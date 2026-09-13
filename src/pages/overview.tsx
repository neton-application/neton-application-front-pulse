"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-front-runtime/client";
import { useQuery } from "@neton/application-front-runtime/client-context";
import {
  Card, CardContent, CardHeader, CardTitle, DataTable, PageHeader,
  type DataColumn,
} from "@neton/application-front-kit";

interface KindCount { kind: string; count: number }
interface NameCount { name: string; count: number }
interface PulseEvent {
  id: number; eventId: string; sessionId: string; ts: number;
  kind: string; name: string; sourceModule: string | null; attributes: string;
}
interface DomainCount { domain: string; count: number }
interface PulseOverview {
  totalEvents: number; sessions: number; crashes: number; errors: number;
  byKind: KindCount[]; byDomain: DomainCount[]; topEvents: NameCount[]; recentIssues: PulseEvent[];
}

/** 与后端 EventDomain / V005 的三个视图一一对应。 */
const DOMAIN_LABELS: Record<string, string> = {
  analytics: "产品分析",
  apm: "质量监控",
  security: "运行时安全",
};

const topEventColumns: DataColumn<NameCount>[] = [
  { key: "name", header: "事件名", cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "count", header: "次数", cell: (r) => r.count.toLocaleString("en-US") },
];

const issueColumns: DataColumn<PulseEvent>[] = [
  { key: "kind", header: "类型", cell: (r) => <span className={r.kind === "Crash" ? "text-red-600 font-medium" : "text-amber-600 font-medium"}>{r.kind}</span> },
  { key: "name", header: "名称", cell: (r) => r.name },
  { key: "session", header: "会话", cell: (r) => <code className="text-xs">{r.sessionId.slice(0, 12)}…</code> },
  { key: "attrs", header: "详情", cell: (r) => <code className="text-xs">{r.attributes.slice(0, 60)}</code> },
];

export default function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["pulse-overview"],
    queryFn: () => apiFetch<PulseOverview>("/admin/pulse/stats/overview"),
  });

  const cards: Array<[string, number | undefined, string]> = [
    ["事件总数", data?.totalEvents, "text-[var(--foreground)]"],
    ["活跃会话", data?.sessions, "text-[var(--foreground)]"],
    ["崩溃", data?.crashes, "text-red-600"],
    ["错误", data?.errors, "text-amber-600"],
  ];
  const maxKind = Math.max(1, ...(data?.byKind ?? []).map((k) => k.count));

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="PULSE" title="概览" description="应用分析与质量监控：全局汇总、事件构成、崩溃与错误。" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, v, cls]) => (
          <div key={label} className="rounded-lg border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
            <div className={`text-2xl font-semibold tabular-nums ${cls}`}>
              {v === undefined ? "…" : v.toLocaleString("en-US")}
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>业务域分布</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {(data?.byDomain ?? []).map((d) => (
              <div key={d.domain} className="rounded-lg border border-[var(--border)] p-4">
                <div className="text-xs text-[var(--muted-foreground)]">{DOMAIN_LABELS[d.domain] ?? d.domain}</div>
                <div className="text-xl font-semibold tabular-nums">{d.count.toLocaleString("en-US")}</div>
              </div>
            ))}
            {(!data || data.byDomain.length === 0) && (
              <div className="text-sm text-[var(--muted-foreground)]">{isLoading ? "加载中…" : "暂无数据"}</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>事件构成（按类型）</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data?.byKind ?? []).map((k) => (
                <div key={k.kind} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-[var(--muted-foreground)]">{k.kind}</div>
                  <div className="flex-1 h-3 rounded bg-[var(--muted)] overflow-hidden">
                    <div className="h-full bg-[var(--primary)]" style={{ width: `${(k.count / maxKind) * 100}%` }} />
                  </div>
                  <div className="w-16 text-right text-xs tabular-nums">{k.count.toLocaleString("en-US")}</div>
                </div>
              ))}
              {(!data || data.byKind.length === 0) && (
                <div className="text-sm text-[var(--muted-foreground)]">{isLoading ? "加载中…" : "暂无数据"}</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top 事件</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={topEventColumns}
              rows={data?.topEvents ?? []}
              rowKey={(r) => r.name}
              loading={isLoading}
              emptyTitle="暂无事件"
              emptyDescription="客户端上报后，这里按事件名聚合。"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>最近崩溃与错误</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={issueColumns}
            rows={data?.recentIssues ?? []}
            rowKey={(r) => String(r.id)}
            loading={isLoading}
            emptyTitle="暂无崩溃或错误"
            emptyDescription="APM 采集到的崩溃/错误会出现在这里。"
          />
        </CardContent>
      </Card>
    </div>
  );
}
