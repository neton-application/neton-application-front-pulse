"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import {
  Button, Card, CardContent, CardHeader, CardTitle, DataTable, Input, PageHeader, Pagination,
  StatusBadge, type DataColumn,
} from "@neton/application-front-kit";
import { timeAgo } from "../pulse-ui";
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
const onlineColumns: DataColumn<OnlineConnection>[] = [
  { key: "device", header: "设备", cell: (r) => <div><div className="font-medium">{r.deviceType}</div><code className="text-[11px] text-[var(--muted-foreground)]">{shortId(r.deviceId)}</code></div> },
  { key: "platform", header: "平台", cell: (r) => r.platform },
  { key: "app", header: "应用版本", cell: (r) => <span>{r.appVersion ?? "—"} <span className="text-xs text-[var(--muted-foreground)]">({r.buildNumber})</span></span> },
  { key: "sdk", header: "PulseKit", cell: (r) => <code className="text-xs">{r.sdkVersion}</code> },
  { key: "package", header: "包名", cell: (r) => <code className="text-xs">{r.packageName ?? "—"}</code> },
  {
    key: "heartbeat", header: "最近心跳",
    cell: (r) => <span title={new Date(r.lastHeartbeatAt).toLocaleString("zh-CN")}>{timeAgo(r.lastHeartbeatAt)}</span>,
  },
];

const deadColumns: DataColumn<Envelope>[] = [
  { key: "firstSeenMs", header: "首次入队", cell: (r) => (r.firstSeenMs ? new Date(r.firstSeenMs).toLocaleString("zh-CN") : "-") },
  { key: "attempts", header: "尝试次数", cell: (r) => <span className="tabular-nums">{r.attempts}</span> },
  { key: "lastError", header: "失败原因", cell: (r) => <span className="text-red-600 text-xs">{r.lastError ?? "-"}</span> },
  { key: "payload", header: "批次内容", cell: (r) => <code className="text-xs">{r.payload.slice(0, 120)}{r.payload.length > 120 ? "…" : ""}</code> },
];

/**
 * 采集管道。这是本模块唯一会悄悄丢数据的地方，所以它需要被看见：
 * 队列积压多少、写入/重试/进死信各多少、失败原因是什么。
 *
 * 死信保留的意义是一次坏发布或数据库抖动之后能人工恢复，而不是只能道歉，
 * 因此这里提供重放；但重放是对采集链路的写操作，根因没修就重放只会把死信再灌一遍。
 */
export default function Page() {
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
    ["待处理", truncated(d?.work), "text-[var(--foreground)]"],
    ["处理中", truncated(d?.processing), d && d.processing > 0 ? "text-blue-600" : "text-[var(--foreground)]"],
    ["重试中", truncated(d?.retry), d && d.retry > 0 ? "text-amber-600" : "text-[var(--foreground)]"],
    ["死信", truncated(d?.dead), d && d.dead > 0 ? "text-red-600" : "text-[var(--foreground)]"],
    ["累计入队", c ? c.enqueued.toLocaleString("en-US") : "…", "text-[var(--muted-foreground)]"],
    ["累计入库", c ? c.consumed.toLocaleString("en-US") : "…", "text-[var(--muted-foreground)]"],
    ["累计重试", c ? c.failed.toLocaleString("en-US") : "…", "text-[var(--muted-foreground)]"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow="PULSE"
          title="采集管道"
          description="上报链路本身的健康状况：哪些客户端正连着、跑的是哪个 SDK 版本，以及事件从入队到落库的每一步有没有积压或丢弃。这一页看的是「数据有没有进来」，不是数据本身。"
        />
        <PulseScopeSelector scope={scope} onChange={setScope} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] p-4"><div className="text-xs text-[var(--muted-foreground)]">当前在线</div><div className="text-2xl font-semibold tabular-nums text-emerald-600">{connectionSummary.data?.online ?? "…"}</div></div>
        <div className="rounded-lg border border-[var(--border)] p-4"><div className="text-xs text-[var(--muted-foreground)]">近 5 分钟活跃</div><div className="text-2xl font-semibold tabular-nums text-blue-600">{connectionSummary.data?.activeLast5Minutes ?? "…"}</div></div>
        <div className="rounded-lg border border-[var(--border)] p-4 sm:col-span-2"><div className="text-xs text-[var(--muted-foreground)]">近 30 日 PulseKit 版本</div><div className="mt-2 flex flex-wrap gap-2">{(connectionSummary.data?.sdkVersions ?? []).map((v) => <span key={v.sdkVersion} className="rounded bg-[var(--muted)] px-2 py-1 text-xs"><code>{v.sdkVersion}</code> · {v.devices} 台</span>)}{connectionSummary.data?.sdkVersions.length === 0 && <span className="text-sm text-[var(--muted-foreground)]">暂无数据</span>}</div></div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>在线设备 · {onlineRows.length}</CardTitle>
            <Input
              className="h-8 w-60"
              placeholder="搜索设备 / 版本 / 包名"
              value={onlineSearch}
              onChange={(e) => { setOnlineSearch(e.target.value); setOnlinePage(1); }}
            />
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <DataTable
            columns={onlineColumns}
            rows={onlineRows.slice((onlinePage - 1) * onlineSize, onlinePage * onlineSize)}
            rowKey={(r) => r.connectionId}
            loading={online.isLoading}
            emptyTitle={onlineKeyword ? "没有匹配的设备" : "暂无在线设备"}
            emptyDescription="客户端完成 CLIENT_CONNECT 并持续心跳后会显示在这里。"
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
            <CardTitle>死信队列</CardTitle>
            <div className="flex items-center gap-2">
              <StatusBadge active={!status.data?.hasDeadLetters}>
                {status.data?.hasDeadLetters ? "有待处理死信" : "正常"}
              </StatusBadge>
              <Button variant="outline" disabled={busy || !status.data?.hasDeadLetters} onClick={() => void run("replay")}>
                重放全部
              </Button>
              <Button variant="outline" disabled={busy || !status.data?.hasDeadLetters} onClick={() => void run("purge")}>
                清空
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={deadColumns}
            rows={dead.data ?? []}
            rowKey={(r) => `${r.firstSeenMs}-${r.payload.slice(0, 32)}`}
            loading={dead.isLoading}
            emptyTitle="没有死信"
            emptyDescription="写入失败且重试用尽的批次会出现在这里，修复根因后可整批重放。"
          />
        </CardContent>
      </Card>
    </div>
  );
}
