"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import {
  Button, Card, CardContent, CardHeader, CardTitle, DataTable, Field, Input,
  PageHeader, Pagination, Select, type DataColumn,
} from "@neton/application-front-kit";
import { PulseScopeSelector, pulseScopeParams, usePulseScope } from "../pulse-scope";
import { timeAgo } from "../pulse-ui";

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
interface EvidenceItem {
  category: string; name: string; moduleName: string | null; detail: string | null;
  imageUuid: string | null; callerSymbol: string | null; stackFingerprint: string | null;
  callPath: string | null;
  occurrences: number; devices: number; firstSeenAt: number; lastSeenAt: number;
}
interface Evidence {
  projectId: string | null; days: number;
  modules: EvidenceItem[]; internalMethods: EvidenceItem[]; networkDestinations: EvidenceItem[];
  sensitiveApis: EvidenceItem[]; permissions: EvidenceItem[];
}

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
  user_defaults_read: "读取 UserDefaults",
  user_defaults_write: "写入 UserDefaults",
  http_cookie_read: "读取 HTTP Cookie",
  camera_microphone_permission_request: "请求相机或麦克风权限",
  microphone_permission_request: "请求麦克风权限",
  contacts_permission_request: "请求通讯录权限",
  tracking_permission_request: "请求跟踪权限",
  notification_permission_request: "请求通知权限",
  calendar_reminders_permission_request: "请求日历或提醒事项权限",
  calendar_permission_request: "请求日历权限",
  reminders_permission_request: "请求提醒事项权限",
  health_permission_request: "请求健康数据权限",
  webview_message_bridge_installed: "安装 WebView 消息桥",
  webview_script_injected: "注入 WebView 脚本",
  webview_javascript_evaluated: "执行 WebView JavaScript",
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
  const { scope, setScope } = usePulseScope();
  // 证据是一次取回的数组（它本来就是聚合结果），所以搜索与翻页都在前端做。
  const [evidenceSearch, setEvidenceSearch] = React.useState("");
  const [evidencePage, setEvidencePage] = React.useState(1);
  const [evidenceSize, setEvidenceSize] = React.useState(20);
  // 告警走服务端分页：它会随时间无限增长。
  const [alertFilters, setAlertFilters] = React.useState({ status: "0", severity: "" });
  const [alertDraft, setAlertDraft] = React.useState(alertFilters);
  const [alertPage, setAlertPage] = React.useState(1);
  const [alertSize, setAlertSize] = React.useState(20);
  const [evidenceKind, setEvidenceKind] = React.useState<keyof Pick<Evidence, "modules" | "internalMethods" | "networkDestinations" | "sensitiveApis" | "permissions">>("modules");

  const evidence = useQuery({
    queryKey: ["pulse-audit-evidence", scope.projectId, scope.days],
    queryFn: () => apiFetch<Evidence>(`/admin/pulse/audit/evidence?${pulseScopeParams(scope)}`),
  });

  const alerts = useQuery({
    queryKey: ["pulse-audit-alerts", scope.projectId, alertFilters.status, alertFilters.severity, alertPage, alertSize],
    queryFn: () => {
      const params = new URLSearchParams({ pageNo: String(alertPage), pageSize: String(alertSize) });
      if (alertFilters.status) params.set("status", alertFilters.status);
      if (alertFilters.severity) params.set("severity", alertFilters.severity);
      if (scope.projectId) params.set("projectId", scope.projectId);
      return apiFetch<Page<Alert>>(`/admin/pulse/audit/alert/page?${params}`);
    },
  });
  const rules = useQuery({
    queryKey: ["pulse-audit-rules"],
    queryFn: () => apiFetch<Page<Rule>>("/admin/pulse/audit/rule/page?pageSize=20"),
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
    {
      key: "lastSeenAt", header: "最近出现",
      cell: (r) => <span title={r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString("zh-CN") : ""}>{timeAgo(r.lastSeenAt)}</span>,
    },
    { key: "status", header: "状态", cell: (r) => STATUS_LABEL[r.status] ?? String(r.status) },
    {
      key: "actions", header: "操作", className: "text-right", headerClassName: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-2 whitespace-nowrap">
          {r.status !== 1 && <Button variant="outline" size="sm" onClick={() => void triage(r.id, 1)}>确认</Button>}
          {r.status !== 2 && <Button variant="outline" size="sm" onClick={() => void triage(r.id, 2)}>忽略</Button>}
          {r.status !== 0 && <Button variant="outline" size="sm" onClick={() => void triage(r.id, 0)}>重新打开</Button>}
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

  const evidenceColumns: DataColumn<EvidenceItem>[] = [
    { key: "name", header: "证据", cell: (r) => <span className="font-medium">{API_LABEL[r.name] ?? r.name}</span> },
    { key: "moduleName", header: "来源模块", cell: (r) => <code className="text-xs">{r.moduleName ?? "—"}</code> },
    {
      key: "callerSymbol", header: "插件内部调用点",
      cell: (r) => (
        <div className="max-w-2xl space-y-1 font-mono text-xs">
          <div className="break-all">{r.callerSymbol ?? "—"}</div>
          {r.callPath && <div className="break-all text-[11px] text-[var(--muted-foreground)]">{r.callPath}</div>}
        </div>
      ),
    },
    {
      key: "detail", header: "目的地 / 声明 / 调用",
      cell: (r) => <code className="block max-w-3xl break-all text-xs">{r.detail ?? "—"}</code>,
    },
    {
      key: "fingerprint", header: "二进制 / 调用链",
      cell: (r) => (
        <div className="space-y-1 font-mono text-[11px]">
          <div>{r.imageUuid ? `UUID ${r.imageUuid}` : "UUID —"}</div>
          <div>{r.stackFingerprint ? `stack#${r.stackFingerprint}` : "stack —"}</div>
        </div>
      ),
    },
    { key: "devices", header: "设备", cell: (r) => <span className="tabular-nums">{r.devices}</span> },
    { key: "occurrences", header: "次数", cell: (r) => <span className="tabular-nums">{r.occurrences}</span> },
    { key: "lastSeenAt", header: "最近观察", cell: (r) => new Date(r.lastSeenAt).toLocaleString("zh-CN") },
  ];

  const evidenceGroups: Array<[typeof evidenceKind, string]> = [
    ["modules", "插件与动态库"],
    ["internalMethods", "插件内部方法"],
    ["networkDestinations", "联网地址"],
    ["sensitiveApis", "敏感 API"],
    ["permissions", "权限与声明"],
  ];
  const allEvidence = evidence.data?.[evidenceKind] ?? [];
  const keyword = evidenceSearch.trim().toLowerCase();
  const filteredEvidence = keyword
    ? allEvidence.filter((r) => [r.name, API_LABEL[r.name], r.moduleName, r.detail, r.callerSymbol]
        .some((v) => (v ?? "").toLowerCase().includes(keyword)))
    : allEvidence;
  const currentEvidence = filteredEvidence.slice((evidencePage - 1) * evidenceSize, evidencePage * evidenceSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow="PULSE"
          title="安全审计"
          description="先展示客户端观察到的证据，再由规则判断风险。没有规则也不会隐藏插件、联网地址、敏感 API 和权限使用。"
        />
        <PulseScopeSelector scope={scope} onChange={setScope} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>观察证据</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {evidenceGroups.map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={evidenceKind === key ? "default" : "outline"}
                  onClick={() => { setEvidenceKind(key); setEvidencePage(1); }}
                >
                  {label} · {evidence.data?.[key].length ?? 0}
                </Button>
              ))}
              <Input
                className="h-8 w-56"
                placeholder="搜索名称 / 模块 / 地址"
                value={evidenceSearch}
                onChange={(e) => { setEvidenceSearch(e.target.value); setEvidencePage(1); }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <DataTable
            columns={evidenceColumns}
            rows={currentEvidence}
            rowKey={(r) => `${r.category}-${r.name}-${r.moduleName ?? ""}-${r.stackFingerprint ?? ""}-${r.detail ?? ""}`}
            loading={evidence.isLoading}
            emptyTitle={keyword ? "没有匹配的证据" : "当前范围没有这类证据"}
            emptyDescription="这表示尚未观察到，并不代表对应能力已通过审计。"
          />
          <Pagination
            page={evidencePage}
            pageSize={evidenceSize}
            total={filteredEvidence.length}
            loading={evidence.isFetching}
            onPageChange={setEvidencePage}
            onPageSizeChange={(size) => { setEvidenceSize(size); setEvidencePage(1); }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>告警</CardTitle>
            <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setAlertFilters(alertDraft); setAlertPage(1); }}>
                <Field label="状态">
                  <Select className="h-8 w-32" value={alertDraft.status} onChange={(e) => setAlertDraft({ ...alertDraft, status: e.target.value })}>
                    <option value="">全部</option>
                    <option value="0">待处理</option>
                    <option value="1">已确认</option>
                    <option value="2">已忽略</option>
                  </Select>
                </Field>
                <Field label="级别">
                  <Select className="h-8 w-32" value={alertDraft.severity} onChange={(e) => setAlertDraft({ ...alertDraft, severity: e.target.value })}>
                    <option value="">全部</option>
                    <option value="critical">严重</option>
                    <option value="warn">关注</option>
                    <option value="info">记录</option>
                  </Select>
                </Field>
              <Button type="submit" size="sm">查询</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <DataTable
            columns={alertColumns}
            rows={alerts.data?.list ?? []}
            rowKey={(r) => String(r.id)}
            loading={alerts.isLoading}
            emptyTitle={alertFilters.status === "0" ? "没有待处理告警" : "没有符合条件的告警"}
            emptyDescription="客户端上报的随包镜像命中规则后，会在这里按模块聚合出现；没有启用的审计规则时不会产生任何告警。"
          />
          <Pagination
            page={alertPage}
            pageSize={alertSize}
            total={alerts.data?.total ?? 0}
            loading={alerts.isFetching}
            onPageChange={setAlertPage}
            onPageSizeChange={(size) => { setAlertSize(size); setAlertPage(1); }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>审计规则 · 前 20 条</CardTitle>
            <a className="text-sm underline" href="/pulse/audit-rules">维护全部规则</a>
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
