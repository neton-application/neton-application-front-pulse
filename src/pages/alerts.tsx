"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import {
  Button, Card, CardContent, CardHeader, CardTitle, DataTable, PageHeader,
  type DataColumn,
} from "@neton/application-front-kit";

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

const TYPE_LABEL: Record<string, string> = {
  crash_free_rate: "无崩溃率跌破阈值",
  new_issue_impact: "崩溃影响面超阈值",
};
const DELIVERY: Record<number, [string, string]> = {
  0: ["待发送", "text-[var(--muted-foreground)]"],
  1: ["已送达", "text-green-600"],
  2: ["发送失败", "text-red-600"],
  // 未配置 webhook 不是错误：告警已记录，只是没有地方可送。
  3: ["未配置通知", "text-amber-600"],
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
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);

  const rules = useQuery({
    queryKey: ["pulse-alert-rules"],
    queryFn: () => apiFetch<Page<Rule>>("/admin/pulse/alert/rule/page?pageSize=100"),
  });
  const records = useQuery({
    queryKey: ["pulse-alert-records"],
    queryFn: () => apiFetch<Page<Record_>>("/admin/pulse/alert/record/page?pageSize=100"),
  });

  const evaluateNow = async () => {
    setBusy(true);
    try {
      const fired = await apiWrite<number>("/admin/pulse/alert/evaluate", "POST");
      await queryClient.invalidateQueries({ queryKey: ["pulse-alert-records"] });
      await queryClient.invalidateQueries({ queryKey: ["pulse-alert-rules"] });
      window.alert(fired > 0 ? `触发了 ${fired} 条告警` : "没有规则达到触发条件");
    } finally {
      setBusy(false);
    }
  };

  const ruleColumns: DataColumn<Rule>[] = [
    { key: "name", header: "规则", cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "type", header: "类型", cell: (r) => TYPE_LABEL[r.type] ?? r.type },
    {
      key: "threshold", header: "阈值",
      cell: (r) => (r.type === "crash_free_rate" ? `低于 ${r.threshold}%` : `≥ ${r.threshold} 台设备`),
    },
    { key: "minDevices", header: "最小样本", cell: (r) => <span className="tabular-nums">{r.minDevices} 台</span> },
    { key: "cooldownMs", header: "冷却", cell: (r) => `${Math.round(r.cooldownMs / 60000)} 分钟` },
    {
      key: "webhookUrl", header: "通知地址",
      cell: (r) => (r.webhookUrl ? <code className="text-xs">{r.webhookUrl}</code> : <span className="text-amber-600 text-xs">未配置</span>),
    },
    { key: "lastFiredAt", header: "最近触发", cell: (r) => (r.lastFiredAt ? new Date(r.lastFiredAt).toLocaleString("zh-CN") : "从未") },
    { key: "status", header: "状态", cell: (r) => (r.status === 1 ? "启用" : "停用") },
  ];

  const recordColumns: DataColumn<Record_>[] = [
    { key: "firedAt", header: "时间", cell: (r) => new Date(r.firedAt).toLocaleString("zh-CN") },
    { key: "title", header: "告警", cell: (r) => <span className="font-medium">{r.title}</span> },
    { key: "detail", header: "详情", cell: (r) => <span className="text-xs">{r.detail}</span> },
    {
      key: "observed", header: "实测 / 阈值",
      cell: (r) => <span className="tabular-nums text-xs">{r.observed} / {r.threshold}</span>,
    },
    {
      key: "deliveryStatus", header: "通知",
      cell: (r) => {
        const [label, cls] = DELIVERY[r.deliveryStatus] ?? ["未知", ""];
        return (
          <span className={cls} title={r.deliveryError ?? undefined}>
            {label}{r.deliveryError ? `：${r.deliveryError}` : ""}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="PULSE"
        title="告警"
        description="规则每 5 分钟自动评估一次。定时评估而不是随上报触发：数据停止上报本身就是一种异常，而随上报触发的检查看不见沉默。"
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>规则</CardTitle>
            <div className="flex items-center gap-2">
              <a className="text-sm underline" href="/pulse/alert-rules">维护规则</a>
              {/* 会真的发出通知，所以和改规则同权，不给只读账号。 */}
              <Button variant="outline" disabled={busy} onClick={() => void evaluateNow()}>立即评估</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={ruleColumns}
            rows={rules.data?.list ?? []}
            rowKey={(r) => String(r.id)}
            loading={rules.isLoading}
            emptyTitle="还没有告警规则"
            emptyDescription="没有规则时不会有任何通知——问题只能靠人主动登录后台发现。"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>触发历史</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={recordColumns}
            rows={records.data?.list ?? []}
            rowKey={(r) => String(r.id)}
            loading={records.isLoading}
            emptyTitle="还没有触发过"
            emptyDescription="每次触发都会连同通知是否送达一起记录在这里。"
          />
        </CardContent>
      </Card>
    </div>
  );
}
