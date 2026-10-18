"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import {
  Button, Card, CardContent, CardHeader, CardTitle, DataTable, Field, Input,
  PageHeader, Pagination, Select, type DataColumn,
} from "@neton/application-front-kit";
import { PulseScopeSelector, pulseScopeParams, usePulseScope } from "../pulse-scope";
import { useFormat, useT } from "@neton/application-front-runtime/i18n";
import { useTimeAgo } from "../pulse-ui";

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

const SEVERITY_CLASS: Record<string, string> = {
  info: "text-[var(--muted-foreground)]",
  warn: "text-amber-600 font-medium",
  critical: "text-red-600 font-semibold",
};
/** 敏感 API 的名称（词条 `audit.api.<name>`）；未知的直接显示原始事件名，不猜。 */
const KNOWN_APIS = new Set([
  "pasteboard_read",
  "advertising_id_read",
  "vendor_id_read",
  "carrier_info_read",
  "location_start",
  "photo_library_status_read",
  "photo_library_permission_request",
  "network_request",
  "location_permission_request",
  "user_agent_read",
  "user_defaults_read",
  "user_defaults_write",
  "http_cookie_read",
  "camera_microphone_permission_request",
  "microphone_permission_request",
  "contacts_permission_request",
  "tracking_permission_request",
  "notification_permission_request",
  "calendar_reminders_permission_request",
  "calendar_permission_request",
  "reminders_permission_request",
  "health_permission_request",
  "webview_message_bridge_installed",
  "webview_script_injected",
  "webview_javascript_evaluated",
]);

/**
 * 三方插件审计。客户端只上报「随包分发了哪些镜像」，不带任何结论；
 * 判定在服务端按规则做，所以规则可以随时调整，不必等下一次发版。
 *
 * 告警按 (项目, 模块) 聚合：一个模块出现在一万台设备上是一条告警加两个计数，
 * 不是一万条告警——后者没人看得完。设备数来自去重明细，不是事件数近似。
 */
export default function Page() {
  const t = useT("pulse");
  const fmt = useFormat();
  const timeAgo = useTimeAgo();
  const severityLabel = (severity: string) => (severity in SEVERITY_CLASS ? t(`audit.severity.${severity}`) : severity);
  const statusLabel = (status: number) => (status >= 0 && status <= 2 ? t(`audit.status.${status}`) : String(status));
  const kindLabel = (kind: string) => (kind === "module" || kind === "behavior" ? t(`audit.kind.${kind}`) : kind);
  const apiLabel = (name: string): string | undefined => (KNOWN_APIS.has(name) ? t(`audit.api.${name}`) : undefined);
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
      key: "severity", header: t("auditRule.field.severity"),
      cell: (r) => <span className={SEVERITY_CLASS[r.severity] ?? ""}>{severityLabel(r.severity)}</span>,
    },
    {
      key: "kind", header: t("common.field.type"),
      cell: (r) => (
        <span className={r.kind === "behavior" ? "text-blue-600" : "text-[var(--muted-foreground)]"}>
          {kindLabel(r.kind)}
        </span>
      ),
    },
    { key: "moduleName", header: t("audit.column.module"), cell: (r) => <span className="font-medium">{r.moduleName}</span> },
    {
      key: "api", header: t("audit.column.api"),
      // 结构告警没有行为可言，留空而不是编一个。
      cell: (r) => (r.api ? (apiLabel(r.api) ?? r.api) : <span className="text-[var(--muted-foreground)]">—</span>),
    },
    {
      key: "detail", header: t("audit.column.detail"),
      // 网络请求的目的地已在客户端剥掉 query 与 fragment；这里存的是端点，不是凭证。
      cell: (r) => (r.detail ? <code className="text-xs">{r.detail}</code> : <span className="text-[var(--muted-foreground)]">—</span>),
    },
    { key: "label", header: t("audit.column.label"), cell: (r) => r.label || "-" },
    { key: "note", header: t("common.field.remark"), cell: (r) => <span className="text-xs text-[var(--muted-foreground)]">{r.note ?? "-"}</span> },
    // 设备数说明影响面，出现次数说明频率——两个都要，只有一个都会误导。
    { key: "deviceCount", header: t("common.field.affectedDevices"), cell: (r) => <span className="tabular-nums">{r.deviceCount}</span> },
    // 调用次数只有动作告警有意义：结构是「在不在」，没有频率一说。
    {
      key: "callCount", header: t("audit.column.callCount"),
      cell: (r) => (r.kind === "behavior" ? <span className="tabular-nums">{r.callCount}</span> : <span className="text-[var(--muted-foreground)]">—</span>),
    },
    { key: "occurrences", header: t("audit.column.occurrences"), cell: (r) => <span className="tabular-nums">{r.occurrences}</span> },
    {
      key: "lastSeenAt", header: t("audit.column.lastSeenAt"),
      cell: (r) => <span title={r.lastSeenAt ? fmt.dateTime(r.lastSeenAt) : ""}>{timeAgo(r.lastSeenAt)}</span>,
    },
    { key: "status", header: t("common.field.status"), cell: (r) => statusLabel(r.status) },
    {
      key: "actions", header: t("common.field.actions"), className: "text-right", headerClassName: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-2 whitespace-nowrap">
          {r.status !== 1 && <Button variant="outline" size="sm" onClick={() => void triage(r.id, 1)}>{t("audit.action.confirm")}</Button>}
          {r.status !== 2 && <Button variant="outline" size="sm" onClick={() => void triage(r.id, 2)}>{t("common.action.ignore")}</Button>}
          {r.status !== 0 && <Button variant="outline" size="sm" onClick={() => void triage(r.id, 0)}>{t("audit.action.reopen")}</Button>}
        </div>
      ),
    },
  ];

  const ruleColumns: DataColumn<Rule>[] = [
    { key: "pattern", header: t("auditRule.field.pattern"), cell: (r) => <code className="text-xs">{r.pattern}</code> },
    { key: "label", header: t("common.field.name"), cell: (r) => r.label || "-" },
    {
      key: "severity", header: t("auditRule.field.severity"),
      cell: (r) => <span className={SEVERITY_CLASS[r.severity] ?? ""}>{severityLabel(r.severity)}</span>,
    },
    { key: "appId", header: t("audit.column.scope"), cell: (r) => (r.appId ? t("audit.scope.app", { appId: r.appId }) : t("audit.scope.global")) },
    { key: "note", header: t("common.field.remark"), cell: (r) => <span className="text-xs text-[var(--muted-foreground)]">{r.note ?? "-"}</span> },
    { key: "status", header: t("common.field.status"), cell: (r) => (r.status === 1 ? t("common.status.enabled") : t("common.status.disabled")) },
  ];

  const evidenceColumns: DataColumn<EvidenceItem>[] = [
    { key: "name", header: t("audit.column.evidence"), cell: (r) => <span className="font-medium">{apiLabel(r.name) ?? r.name}</span> },
    { key: "moduleName", header: t("common.field.sourceModule"), cell: (r) => <code className="text-xs">{r.moduleName ?? "—"}</code> },
    {
      key: "callerSymbol", header: t("audit.column.callerSymbol"),
      cell: (r) => (
        <div className="max-w-2xl space-y-1 font-mono text-xs">
          <div className="break-all">{r.callerSymbol ?? "—"}</div>
          {r.callPath && <div className="break-all text-[11px] text-[var(--muted-foreground)]">{r.callPath}</div>}
        </div>
      ),
    },
    {
      key: "detail", header: t("audit.column.evidenceDetail"),
      cell: (r) => <code className="block max-w-3xl break-all text-xs">{r.detail ?? "—"}</code>,
    },
    {
      key: "fingerprint", header: t("audit.column.fingerprint"),
      cell: (r) => (
        <div className="space-y-1 font-mono text-[11px]">
          <div>{r.imageUuid ? `UUID ${r.imageUuid}` : "UUID —"}</div>
          <div>{r.stackFingerprint ? `stack#${r.stackFingerprint}` : "stack —"}</div>
        </div>
      ),
    },
    { key: "devices", header: t("common.field.devices"), cell: (r) => <span className="tabular-nums">{r.devices}</span> },
    { key: "occurrences", header: t("common.field.count"), cell: (r) => <span className="tabular-nums">{r.occurrences}</span> },
    { key: "lastSeenAt", header: t("audit.column.lastObserved"), cell: (r) => fmt.dateTime(r.lastSeenAt) },
  ];

  const evidenceGroups: Array<[typeof evidenceKind, string]> = [
    ["modules", t("audit.evidence.modules")],
    ["internalMethods", t("audit.evidence.internalMethods")],
    ["networkDestinations", t("audit.evidence.networkDestinations")],
    ["sensitiveApis", t("audit.evidence.sensitiveApis")],
    ["permissions", t("audit.evidence.permissions")],
  ];
  const allEvidence = evidence.data?.[evidenceKind] ?? [];
  const keyword = evidenceSearch.trim().toLowerCase();
  const filteredEvidence = keyword
    ? allEvidence.filter((r) => [r.name, apiLabel(r.name), r.moduleName, r.detail, r.callerSymbol]
        .some((v) => (v ?? "").toLowerCase().includes(keyword)))
    : allEvidence;
  const currentEvidence = filteredEvidence.slice((evidencePage - 1) * evidenceSize, evidencePage * evidenceSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow={t("common.eyebrow")}
          title={t("audit.title")}
          description={t("audit.description")}
        />
        <PulseScopeSelector scope={scope} onChange={setScope} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t("audit.evidence.title")}</CardTitle>
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
                placeholder={t("audit.evidence.search")}
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
            emptyTitle={keyword ? t("audit.evidence.emptyMatch") : t("audit.evidence.empty")}
            emptyDescription={t("audit.evidence.emptyDescription")}
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
            <CardTitle>{t("audit.alerts.title")}</CardTitle>
            <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setAlertFilters(alertDraft); setAlertPage(1); }}>
                <Field label={t("common.field.status")}>
                  <Select className="h-8 w-32" value={alertDraft.status} onChange={(e) => setAlertDraft({ ...alertDraft, status: e.target.value })}>
                    <option value="">{t("common.filter.all")}</option>
                    <option value="0">{t("audit.status.0")}</option>
                    <option value="1">{t("audit.status.1")}</option>
                    <option value="2">{t("audit.status.2")}</option>
                  </Select>
                </Field>
                <Field label={t("auditRule.field.severity")}>
                  <Select className="h-8 w-32" value={alertDraft.severity} onChange={(e) => setAlertDraft({ ...alertDraft, severity: e.target.value })}>
                    <option value="">{t("common.filter.all")}</option>
                    <option value="critical">{t("audit.severity.critical")}</option>
                    <option value="warn">{t("audit.severity.warn")}</option>
                    <option value="info">{t("audit.severity.info")}</option>
                  </Select>
                </Field>
              <Button type="submit" size="sm">{t("common.action.search")}</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <DataTable
            columns={alertColumns}
            rows={alerts.data?.list ?? []}
            rowKey={(r) => String(r.id)}
            loading={alerts.isLoading}
            emptyTitle={alertFilters.status === "0" ? t("audit.alerts.emptyOpen") : t("audit.alerts.emptyMatch")}
            emptyDescription={t("audit.alerts.emptyDescription")}
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
            <CardTitle>{t("audit.rules.title")}</CardTitle>
            <a className="text-sm underline" href="/pulse/audit-rules">{t("audit.rules.manage")}</a>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={ruleColumns}
            rows={rules.data?.list ?? []}
            rowKey={(r) => String(r.id)}
            loading={rules.isLoading}
            emptyTitle={t("audit.rules.emptyTitle")}
            emptyDescription={t("audit.rules.emptyDescription")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
