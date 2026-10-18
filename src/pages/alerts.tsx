"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import {
  Button, Card, CardContent, CardHeader, CardTitle, DataTable, PageHeader, Pagination,
  type DataColumn,
} from "@neton/application-front-kit";
import { useFormat, useT } from "@neton/application-front-runtime/i18n";
import { useTimeAgo } from "../pulse-ui";

interface Rule {
  id: number; name: string; type: string; projectId: string | null;
  threshold: number; minDevices: number; cooldownMs: number;
  webhookUrl: string | null; status: number; lastFiredAt: number | null;
}
interface Record_ {
  id: number; ruleName: string; type: string; title: string; detail: string;
  observed: number; threshold: number; deliveryStatus: number;
  deliveryError: string | null; firedAt: number;
}
interface Page<T> { list: T[]; total: number }

/** 规则类型（词条 `alertRule.type.<type>`）。 */
const RULE_TYPES = new Set(["crash_free_rate", "new_issue_impact"]);
/** 通知状态 → 样式（文案见词条 `alert.delivery.<n>`）。 */
const DELIVERY: Record<number, string> = {
  0: "text-[var(--muted-foreground)]",
  1: "text-green-600",
  2: "text-red-600",
  // 未配置 webhook 不是错误：告警已记录，只是没有地方可送。
  3: "text-amber-600",
};

/**
 * 告警。这是唯一让问题主动找上人的环节，所以判断标准必须是「值得打断人」的那种。
 *
 * 两个防误报机制在规则里就能看到：样本量门槛（新版刚放量时几台设备崩一台就是 50%，
 * 没有门槛每次发版都会先收到一串假警报，然后人就不看告警了）和冷却期。
 *
 * 发送历史不是装饰：一个没人能验证是否真的发出去过的告警系统，和没有告警是一样的。
 */
export default function Page() {
  const t = useT("pulse");
  const fmt = useFormat();
  const timeAgo = useTimeAgo();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);

  const [rulePage, setRulePage] = React.useState(1);
  const [ruleSize, setRuleSize] = React.useState(20);
  const [recordPage, setRecordPage] = React.useState(1);
  const [recordSize, setRecordSize] = React.useState(20);

  const rules = useQuery({
    queryKey: ["pulse-alert-rules", rulePage, ruleSize],
    queryFn: () => apiFetch<Page<Rule>>(`/admin/pulse/alert/rule/page?pageNo=${rulePage}&pageSize=${ruleSize}`),
  });
  const records = useQuery({
    // 触发历史只增不减，必须分页：它是告警系统的审计线索，不能因为太长就截断。
    queryKey: ["pulse-alert-records", recordPage, recordSize],
    queryFn: () => apiFetch<Page<Record_>>(`/admin/pulse/alert/record/page?pageNo=${recordPage}&pageSize=${recordSize}`),
  });

  const evaluateNow = async () => {
    setBusy(true);
    try {
      const fired = await apiWrite<number>("/admin/pulse/alert/evaluate", "POST");
      await queryClient.invalidateQueries({ queryKey: ["pulse-alert-records"] });
      await queryClient.invalidateQueries({ queryKey: ["pulse-alert-rules"] });
      window.alert(fired > 0 ? t("alert.evaluate.fired", { count: fired }) : t("alert.evaluate.none"));
    } finally {
      setBusy(false);
    }
  };

  const ruleColumns: DataColumn<Rule>[] = [
    { key: "name", header: t("alert.column.rule"), cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "type", header: t("common.field.type"), cell: (r) => (RULE_TYPES.has(r.type) ? t(`alertRule.type.${r.type}`) : r.type) },
    {
      key: "threshold", header: t("alertRule.field.threshold"),
      cell: (r) => (r.type === "crash_free_rate" ? t("alert.threshold.rate", { threshold: r.threshold }) : t("alert.threshold.devices", { threshold: r.threshold })),
    },
    { key: "minDevices", header: t("alert.column.minDevices"), cell: (r) => <span className="tabular-nums">{t("common.devicesCount", { count: r.minDevices })}</span> },
    { key: "cooldownMs", header: t("alert.column.cooldown"), cell: (r) => t("alert.cooldownMinutes", { count: Math.round(r.cooldownMs / 60000) }) },
    {
      key: "webhookUrl", header: t("alertRule.field.webhookUrl"),
      cell: (r) => (r.webhookUrl ? <code className="text-xs">{r.webhookUrl}</code> : <span className="text-amber-600 text-xs">{t("alert.notConfigured")}</span>),
    },
    {
      key: "lastFiredAt", header: t("alert.column.lastFiredAt"),
      cell: (r) => (r.lastFiredAt
        ? <span title={fmt.dateTime(r.lastFiredAt)}>{timeAgo(r.lastFiredAt)}</span>
        : <span className="text-[var(--muted-foreground)]">{t("alert.never")}</span>),
    },
    { key: "status", header: t("common.field.status"), cell: (r) => (r.status === 1 ? t("common.status.enabled") : t("common.status.disabled")) },
  ];

  const recordColumns: DataColumn<Record_>[] = [
    { key: "firedAt", header: t("common.field.time"), cell: (r) => fmt.dateTime(r.firedAt) },
    { key: "title", header: t("alert.column.alert"), cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: "detail", header: t("common.field.detail"), cell: (r) => <span className="text-xs">{r.detail}</span> },
    {
      key: "observed", header: t("alert.column.observed"),
      cell: (r) => <span className="tabular-nums text-xs">{r.observed} / {r.threshold}</span>,
    },
    {
      key: "deliveryStatus", header: t("alert.column.delivery"),
      cell: (r) => {
        const cls = DELIVERY[r.deliveryStatus];
        const label = cls === undefined ? t("alert.delivery.unknown") : t(`alert.delivery.${r.deliveryStatus}`);
        return (
          <span className={cls ?? ""} title={r.deliveryError ?? undefined}>
            {r.deliveryError ? t("alert.delivery.withError", { label, error: r.deliveryError }) : label}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={t("common.eyebrow")}
        title={t("alert.title")}
        description={t("alert.description")}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{t("alert.rules.title")}</CardTitle>
            <div className="flex items-center gap-2">
              <a className="text-sm underline" href="/pulse/alert-rules">{t("alert.rules.manage")}</a>
              {/* 会真的发出通知，所以和改规则同权，不给只读账号。 */}
              <Button variant="outline" disabled={busy} onClick={() => void evaluateNow()}>{t("alert.evaluate.action")}</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <DataTable
            columns={ruleColumns}
            rows={rules.data?.list ?? []}
            rowKey={(r) => String(r.id)}
            loading={rules.isLoading}
            emptyTitle={t("alert.rules.emptyTitle")}
            emptyDescription={t("alert.rules.emptyDescription")}
          />
          <Pagination
            page={rulePage} pageSize={ruleSize} total={rules.data?.total ?? 0}
            loading={rules.isFetching}
            onPageChange={setRulePage}
            onPageSizeChange={(size) => { setRuleSize(size); setRulePage(1); }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("alert.records.title")}</CardTitle></CardHeader>
        <CardContent className="px-0 pb-0">
          <DataTable
            columns={recordColumns}
            rows={records.data?.list ?? []}
            rowKey={(r) => String(r.id)}
            loading={records.isLoading}
            emptyTitle={t("alert.records.emptyTitle")}
            emptyDescription={t("alert.records.emptyDescription")}
          />
          <Pagination
            page={recordPage} pageSize={recordSize} total={records.data?.total ?? 0}
            loading={records.isFetching}
            onPageChange={setRecordPage}
            onPageSizeChange={(size) => { setRecordSize(size); setRecordPage(1); }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
