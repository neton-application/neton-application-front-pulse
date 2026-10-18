"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import {
  Button, Card, CardContent, CardHeader, CardTitle, DataTable, Input, PageHeader, Pagination,
  StatusBadge, type DataColumn,
} from "@neton/application-front-kit";
import { useFormat, useT, type Formatters, type Translate } from "@neton/application-front-runtime/i18n";
import { useTimeAgo } from "../pulse-ui";
import { PulseScopeSelector, pulseScopeParams, usePulseScope } from "../pulse-scope";

interface QueueDepth { work: number; retry: number; processing: number; dead: number; truncatedAt: number }
interface QueueCounters { enqueued: number; consumed: number; failed: number; dead: number }
interface PipelineStatus { depth: QueueDepth; counters: QueueCounters; hasDeadLetters: boolean }
interface Envelope { payload: string; attempts: number; firstSeenMs: number; lastError: string | null }
interface OnlineConnection {
  connectionId: string; projectId: string; deviceId: string; installationId: string;
  platform: string; deviceType: string; packageName: string | null; appVersion: string | null;
  buildNumber: number; sdkVersion: string; capabilities: string[];
  connectedAt: number; lastHeartbeatAt: number;
}
interface ConnectionSummary {
  online: number; activeLast5Minutes: number;
  sdkVersions: Array<{ sdkVersion: string; devices: number; sessions: number }>;
}

const shortId = (value: string) => value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
const onlineColumns = (t: Translate, fmt: Formatters, timeAgo: (ms: number) => string): DataColumn<OnlineConnection>[] => [
  { key: "device", header: t("pipeline.column.device"), cell: (r) => <div><div className="font-medium">{r.deviceType}</div><code className="text-[11px] text-[var(--muted-foreground)]">{shortId(r.deviceId)}</code></div> },
  { key: "platform", header: t("common.field.platform"), cell: (r) => r.platform },
  { key: "app", header: t("pipeline.column.appVersion"), cell: (r) => <span>{r.appVersion ?? "—"} <span className="text-xs text-[var(--muted-foreground)]">({r.buildNumber})</span></span> },
  { key: "sdk", header: "PulseKit", cell: (r) => <code className="text-xs">{r.sdkVersion}</code> },
  { key: "package", header: t("common.field.packageName"), cell: (r) => <code className="text-xs">{r.packageName ?? "—"}</code> },
  {
    key: "heartbeat", header: t("pipeline.column.lastHeartbeat"),
    cell: (r) => <span title={fmt.dateTime(r.lastHeartbeatAt)}>{timeAgo(r.lastHeartbeatAt)}</span>,
  },
];

const deadColumns = (t: Translate, fmt: Formatters): DataColumn<Envelope>[] => [
  { key: "firstSeenMs", header: t("pipeline.column.firstSeen"), cell: (r) => (r.firstSeenMs ? fmt.dateTime(r.firstSeenMs) : "-") },
  { key: "attempts", header: t("pipeline.column.attempts"), cell: (r) => <span className="tabular-nums">{r.attempts}</span> },
  { key: "lastError", header: t("pipeline.column.lastError"), cell: (r) => <span className="text-red-600 text-xs">{r.lastError ?? "-"}</span> },
  { key: "payload", header: t("pipeline.column.payload"), cell: (r) => <code className="text-xs">{r.payload.slice(0, 120)}{r.payload.length > 120 ? "…" : ""}</code> },
];

/**
 * 采集管道。这是本模块唯一会悄悄丢数据的地方，所以它需要被看见：
 * 队列积压多少、写入/重试/进死信各多少、失败原因是什么。
 *
 * 死信保留的意义是一次坏发布或数据库抖动之后能人工恢复，而不是只能道歉，
 * 因此这里提供重放；但重放是对采集链路的写操作，根因没修就重放只会把死信再灌一遍。
 */
export default function Page() {
  const t = useT("pulse");
  const fmt = useFormat();
  const timeAgo = useTimeAgo();
  const queryClient = useQueryClient();
  const { scope, setScope } = usePulseScope();
  const [busy, setBusy] = React.useState(false);
  // 在线设备是一份快照数组：设备多起来时一屏放不下，翻页与搜索都在前端做。
  const [onlineSearch, setOnlineSearch] = React.useState("");
  const [onlinePage, setOnlinePage] = React.useState(1);
  const [onlineSize, setOnlineSize] = React.useState(20);
  const scopeQuery = pulseScopeParams(scope);

  const status = useQuery({
    queryKey: ["pulse-pipeline-status"],
    queryFn: () => apiFetch<PipelineStatus>("/admin/pulse/pipeline/status"),
    // 队列是活的，看的人多半正盯着它排空。
    refetchInterval: 5000,
  });

  const dead = useQuery({
    queryKey: ["pulse-pipeline-dead"],
    queryFn: () => apiFetch<Envelope[]>("/admin/pulse/pipeline/dead-letters?limit=50"),
    refetchInterval: 5000,
  });
  const connectionSummary = useQuery({
    queryKey: ["pulse-connection-summary", scope.projectId],
    queryFn: () => apiFetch<ConnectionSummary>(`/admin/pulse/connection/summary?${scopeQuery}`),
    refetchInterval: 10_000,
  });
  const online = useQuery({
    queryKey: ["pulse-online-connections", scope.projectId],
    queryFn: () => apiFetch<OnlineConnection[]>(`/admin/pulse/connection/online?${scopeQuery}`),
    refetchInterval: 10_000,
  });

  const run = async (path: string) => {
    setBusy(true);
    try {
      await apiWrite<number>(`/admin/pulse/pipeline/${path}`, "POST");
      await queryClient.invalidateQueries({ queryKey: ["pulse-pipeline-status"] });
      await queryClient.invalidateQueries({ queryKey: ["pulse-pipeline-dead"] });
    } finally {
      setBusy(false);
    }
  };

  const onlineKeyword = onlineSearch.trim().toLowerCase();
  const onlineRows = (online.data ?? []).filter((r) => !onlineKeyword
    || [r.deviceId, r.deviceType, r.appVersion, r.packageName, r.sdkVersion, r.platform]
      .some((v) => (v ?? "").toLowerCase().includes(onlineKeyword)));

  const d = status.data?.depth;
  const c = status.data?.counters;
  const truncated = (n: number | undefined) => (d && n !== undefined && n >= d.truncatedAt ? `${n}+` : String(n ?? "…"));

  const cards: Array<[string, string, string]> = [
    [t("pipeline.stat.work"), truncated(d?.work), "text-[var(--foreground)]"],
    [t("pipeline.stat.processing"), truncated(d?.processing), d && d.processing > 0 ? "text-blue-600" : "text-[var(--foreground)]"],
    [t("pipeline.stat.retry"), truncated(d?.retry), d && d.retry > 0 ? "text-amber-600" : "text-[var(--foreground)]"],
    [t("pipeline.stat.dead"), truncated(d?.dead), d && d.dead > 0 ? "text-red-600" : "text-[var(--foreground)]"],
    [t("pipeline.stat.enqueued"), c ? fmt.number(c.enqueued) : "…", "text-[var(--muted-foreground)]"],
    [t("pipeline.stat.consumed"), c ? fmt.number(c.consumed) : "…", "text-[var(--muted-foreground)]"],
    [t("pipeline.stat.failed"), c ? fmt.number(c.failed) : "…", "text-[var(--muted-foreground)]"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow={t("common.eyebrow")}
          title={t("pipeline.title")}
          description={t("pipeline.description")}
        />
        <PulseScopeSelector scope={scope} onChange={setScope} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] p-4"><div className="text-xs text-[var(--muted-foreground)]">{t("common.stat.online")}</div><div className="text-2xl font-semibold tabular-nums text-emerald-600">{connectionSummary.data?.online ?? "…"}</div></div>
        <div className="rounded-lg border border-[var(--border)] p-4"><div className="text-xs text-[var(--muted-foreground)]">{t("common.stat.activeLast5Minutes")}</div><div className="text-2xl font-semibold tabular-nums text-blue-600">{connectionSummary.data?.activeLast5Minutes ?? "…"}</div></div>
        <div className="rounded-lg border border-[var(--border)] p-4 sm:col-span-2"><div className="text-xs text-[var(--muted-foreground)]">{t("pipeline.sdkVersions")}</div><div className="mt-2 flex flex-wrap gap-2">{(connectionSummary.data?.sdkVersions ?? []).map((v) => <span key={v.sdkVersion} className="rounded bg-[var(--muted)] px-2 py-1 text-xs"><code>{v.sdkVersion}</code> · {t("common.devicesCount", { count: v.devices })}</span>)}{connectionSummary.data?.sdkVersions.length === 0 && <span className="text-sm text-[var(--muted-foreground)]">{t("common.noData")}</span>}</div></div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t("pipeline.online.title", { count: onlineRows.length })}</CardTitle>
            <Input
              className="h-8 w-60"
              placeholder={t("pipeline.online.search")}
              value={onlineSearch}
              onChange={(e) => { setOnlineSearch(e.target.value); setOnlinePage(1); }}
            />
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <DataTable
            columns={onlineColumns(t, fmt, timeAgo)}
            rows={onlineRows.slice((onlinePage - 1) * onlineSize, onlinePage * onlineSize)}
            rowKey={(r) => r.connectionId}
            loading={online.isLoading}
            emptyTitle={onlineKeyword ? t("pipeline.online.emptyMatch") : t("pipeline.online.empty")}
            emptyDescription={t("pipeline.online.emptyDescription")}
          />
          <Pagination
            page={onlinePage} pageSize={onlineSize} total={onlineRows.length}
            loading={online.isFetching}
            onPageChange={setOnlinePage}
            onPageSizeChange={(size) => { setOnlineSize(size); setOnlinePage(1); }}
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {cards.map(([label, v, cls]) => (
          <div key={label} className="rounded-lg border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
            <div className={`text-2xl font-semibold tabular-nums ${cls}`}>{v}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{t("pipeline.dead.title")}</CardTitle>
            <div className="flex items-center gap-2">
              <StatusBadge active={!status.data?.hasDeadLetters}>
                {status.data?.hasDeadLetters ? t("pipeline.dead.pending") : t("pipeline.dead.healthy")}
              </StatusBadge>
              <Button variant="outline" disabled={busy || !status.data?.hasDeadLetters} onClick={() => void run("replay")}>
                {t("pipeline.dead.replay")}
              </Button>
              <Button variant="outline" disabled={busy || !status.data?.hasDeadLetters} onClick={() => void run("purge")}>
                {t("pipeline.dead.purge")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={deadColumns(t, fmt)}
            rows={dead.data ?? []}
            rowKey={(r) => `${r.firstSeenMs}-${r.payload.slice(0, 32)}`}
            loading={dead.isLoading}
            emptyTitle={t("pipeline.dead.emptyTitle")}
            emptyDescription={t("pipeline.dead.emptyDescription")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
