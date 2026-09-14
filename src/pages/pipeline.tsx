"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import {
  Button, Card, CardContent, CardHeader, CardTitle, DataTable, PageHeader, StatusBadge,
  type DataColumn,
} from "@neton/application-front-kit";

interface QueueDepth { work: number; retry: number; processing: number; dead: number; truncatedAt: number }
interface QueueCounters { enqueued: number; consumed: number; failed: number; dead: number }
interface PipelineStatus { depth: QueueDepth; counters: QueueCounters; hasDeadLetters: boolean }
interface Envelope { payload: string; attempts: number; firstSeenMs: number; lastError: string | null }

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
  const [busy, setBusy] = React.useState(false);

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
      <PageHeader
        eyebrow="PULSE"
        title="采集管道"
        description="客户端批量上报 → msgtrans/HTTP 接入 → Redis 原子领取 → PostgreSQL 入库后确认。写入失败的批次会重试，用尽次数后进入死信，可在此重放。"
      />

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
