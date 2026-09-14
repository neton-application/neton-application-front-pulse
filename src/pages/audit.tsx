"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import {
  Button, Card, CardContent, CardHeader, CardTitle, DataTable, PageHeader,
  type DataColumn,
} from "@neton/application-front-kit";

interface Alert {
  id: number; projectId: string; moduleName: string; severity: string; label: string;
  note: string | null; firstSeenAt: number; lastSeenAt: number;
  occurrences: number; deviceCount: number; status: number;
  /** module = 随包分发了什么；behavior = 运行时做了什么。 */
  kind: string; api: string | null; callCount: number; detail: string | null;
}
interface Rule {
  id: number; pattern: string; label: string; severity: string;
  note: string | null; appId: number | null; status: number;
}
interface Page<T> { list: T[]; total: number }

const SEVERITY_LABEL: Record<string, string> = { info: "记录", warn: "关注", critical: "严重" };
const SEVERITY_CLASS: Record<string, string> = {
  info: "text-[var(--muted-foreground)]",
  warn: "text-amber-600 font-medium",
  critical: "text-red-600 font-semibold",
};
const STATUS_LABEL: Record<number, string> = { 0: "待处理", 1: "已确认", 2: "已忽略" };
const KIND_LABEL: Record<string, string> = { module: "结构", behavior: "动作" };
/** 敏感 API 的中文名；未知的直接显示原始事件名，不猜。 */
const API_LABEL: Record<string, string> = {
  pasteboard_read: "读取剪贴板",
  advertising_id_read: "读取广告标识 IDFA",
  vendor_id_read: "读取设备标识 IDFV",
  carrier_info_read: "读取运营商信息",
  location_start: "开始采集位置",
  photo_library_status_read: "查询相册权限",
  photo_library_permission_request: "请求相册权限",
  network_request: "发起网络请求",
  location_permission_request: "请求位置权限",
  user_agent_read: "读取 User-Agent",
};

/**
 * 三方插件审计。客户端只上报「随包分发了哪些镜像」，不带任何结论；
 * 判定在服务端按规则做，所以规则可以随时调整，不必等下一次发版。
 *
 * 告警按 (项目, 模块) 聚合：一个模块出现在一万台设备上是一条告警加两个计数，
 * 不是一万条告警——后者没人看得完。设备数来自去重明细，不是事件数近似。
 */
export default function Page() {
  const queryClient = useQueryClient();
  const [onlyOpen, setOnlyOpen] = React.useState(true);

  const alerts = useQuery({
    queryKey: ["pulse-audit-alerts", onlyOpen],
    queryFn: () => apiFetch<Page<Alert>>(`/admin/pulse/audit/alert/page?pageSize=100${onlyOpen ? "&status=0" : ""}`),
  });
  const rules = useQuery({
    queryKey: ["pulse-audit-rules"],
    queryFn: () => apiFetch<Page<Rule>>("/admin/pulse/audit/rule/page?pageSize=100"),
  });

  const triage = async (id: number, status: number) => {
    await apiWrite<void>("/admin/pulse/audit/alert/status", "PUT", { id, status });
    await queryClient.invalidateQueries({ queryKey: ["pulse-audit-alerts"] });
  };

  const alertColumns: DataColumn<Alert>[] = [
    {
      key: "severity", header: "级别",
      cell: (r) => <span className={SEVERITY_CLASS[r.severity] ?? ""}>{SEVERITY_LABEL[r.severity] ?? r.severity}</span>,
    },
    {
      key: "kind", header: "类型",
      cell: (r) => (
        <span className={r.kind === "behavior" ? "text-blue-600" : "text-[var(--muted-foreground)]"}>
          {KIND_LABEL[r.kind] ?? r.kind}
        </span>
      ),
    },
    { key: "moduleName", header: "模块", cell: (r) => <span className="font-medium">{r.moduleName}</span> },
    {
      key: "api", header: "行为",
      // 结构告警没有行为可言，留空而不是编一个。
      cell: (r) => (r.api ? (API_LABEL[r.api] ?? r.api) : <span className="text-[var(--muted-foreground)]">—</span>),
    },
    {
      key: "detail", header: "目的地 / 明细",
      // 网络请求的目的地已在客户端剥掉 query 与 fragment；这里存的是端点，不是凭证。
      cell: (r) => (r.detail ? <code className="text-xs">{r.detail}</code> : <span className="text-[var(--muted-foreground)]">—</span>),
    },
    { key: "label", header: "说明", cell: (r) => r.label || "-" },
    { key: "note", header: "备注", cell: (r) => <span className="text-xs text-[var(--muted-foreground)]">{r.note ?? "-"}</span> },
    // 设备数说明影响面，出现次数说明频率——两个都要，只有一个都会误导。
    { key: "deviceCount", header: "影响设备", cell: (r) => <span className="tabular-nums">{r.deviceCount}</span> },
    // 调用次数只有动作告警有意义：结构是「在不在」，没有频率一说。
    {
      key: "callCount", header: "调用次数",
      cell: (r) => (r.kind === "behavior" ? <span className="tabular-nums">{r.callCount}</span> : <span className="text-[var(--muted-foreground)]">—</span>),
    },
    { key: "occurrences", header: "上报次数", cell: (r) => <span className="tabular-nums">{r.occurrences}</span> },
    { key: "lastSeenAt", header: "最近出现", cell: (r) => (r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString("zh-CN") : "-") },
    { key: "status", header: "状态", cell: (r) => STATUS_LABEL[r.status] ?? String(r.status) },
    {
      key: "actions", header: "操作",
      cell: (r) => (
        <div className="flex gap-2">
          {r.status !== 1 && <Button variant="outline" onClick={() => void triage(r.id, 1)}>确认</Button>}
          {r.status !== 2 && <Button variant="outline" onClick={() => void triage(r.id, 2)}>忽略</Button>}
          {r.status !== 0 && <Button variant="outline" onClick={() => void triage(r.id, 0)}>重新打开</Button>}
        </div>
      ),
    },
  ];

  const ruleColumns: DataColumn<Rule>[] = [
    { key: "pattern", header: "匹配模式", cell: (r) => <code className="text-xs">{r.pattern}</code> },
    { key: "label", header: "名称", cell: (r) => r.label || "-" },
    {
      key: "severity", header: "级别",
      cell: (r) => <span className={SEVERITY_CLASS[r.severity] ?? ""}>{SEVERITY_LABEL[r.severity] ?? r.severity}</span>,
    },
    { key: "appId", header: "适用范围", cell: (r) => (r.appId ? `应用 #${r.appId}` : "全局") },
    { key: "note", header: "备注", cell: (r) => <span className="text-xs text-[var(--muted-foreground)]">{r.note ?? "-"}</span> },
    { key: "status", header: "状态", cell: (r) => (r.status === 1 ? "启用" : "停用") },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="PULSE"
        title="安全审计"
        description="两类发现：结构（随包分发了哪些镜像）与动作（哪个镜像在运行时调用了敏感 API）。客户端只陈述事实，不携带任何结论；判定在服务端按规则做，可随时调整。"
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>告警</CardTitle>
            <Button variant="outline" onClick={() => setOnlyOpen((v) => !v)}>
              {onlyOpen ? "显示全部" : "只看待处理"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={alertColumns}
            rows={alerts.data?.list ?? []}
            rowKey={(r) => String(r.id)}
            loading={alerts.isLoading}
            emptyTitle={onlyOpen ? "没有待处理告警" : "还没有告警"}
            emptyDescription="客户端上报的随包镜像命中规则后，会在这里按模块聚合出现。"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>审计规则</CardTitle>
            <a className="text-sm underline" href="/pulse/audit-rules">维护规则</a>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={ruleColumns}
            rows={rules.data?.list ?? []}
            rowKey={(r) => String(r.id)}
            loading={rules.isLoading}
            emptyTitle="还没有规则"
            emptyDescription="规则决定哪些模块值得告警；大多数三方 SDK 不是恶意的，只是需要被知道存在。"
          />
        </CardContent>
      </Card>
    </div>
  );
}
