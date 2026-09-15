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
interface ActiveTrendPoint {
  date: string; activeUsers: number; newUsers: number; sessions: number; launches: number;
}
interface PulseApp { id: number; name: string; platform: string; appKey: string }
interface PageResponse<T> { list: T[]; total: number }
interface PulseOverview {
  totalEvents: number; totalUsers: number; identifiedUsers: number; sessions: number;
  todayActiveUsers: number; todayNewUsers: number; todaySessions: number; todayLaunches: number;
  crashes: number; errors: number; timezone: string; activeTrend: ActiveTrendPoint[];
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
  const [projectId, setProjectId] = React.useState("");
  const apps = useQuery({
    queryKey: ["pulse-overview-apps"],
    queryFn: () => apiFetch<PageResponse<PulseApp>>("/admin/pulse/app/page?pageSize=200"),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["pulse-overview", projectId],
    queryFn: () => apiFetch<PulseOverview>(
      `/admin/pulse/stats/overview?days=7${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""}`,
    ),
  });

  const cards: Array<[string, number | undefined, string, string]> = [
    ["累计用户", data?.totalUsers, "text-[var(--foreground)]", "按持久化设备标识去重"],
    ["今日活跃", data?.todayActiveUsers, "text-blue-600", "今天产生过事件的用户"],
    ["今日新增", data?.todayNewUsers, "text-emerald-600", "首次出现发生在今天"],
    ["今日启动", data?.todayLaunches, "text-[var(--foreground)]", "app_launch 事件数"],
    ["今日会话", data?.todaySessions, "text-[var(--foreground)]", "今天的去重会话"],
    ["已登录用户", data?.identifiedUsers, "text-[var(--foreground)]", "宿主调用 identify 后可识别"],
  ];
  const maxKind = Math.max(1, ...(data?.byKind ?? []).map((k) => k.count));
  const maxActive = Math.max(1, ...(data?.activeTrend ?? []).map((d) => Math.max(d.activeUsers, d.newUsers)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader eyebrow="PULSE" title="总览" description="用户活跃、使用趋势和应用质量的整体情况。" />
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          应用
          <select
            className="min-w-52 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">全部应用</option>
            {(apps.data?.list ?? []).map((app) => (
              <option key={app.id} value={app.appKey}>{app.name} · {app.platform}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, v, cls, note]) => (
          <div key={label} className="rounded-lg border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
            <div className={`text-2xl font-semibold tabular-nums ${cls}`}>
              {v === undefined ? "…" : v.toLocaleString("en-US")}
            </div>
            <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">{note}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>近 7 日活跃趋势</CardTitle>
            <span className="text-xs text-[var(--muted-foreground)]">统计时区：{data?.timezone ?? "—"}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex gap-4 text-xs text-[var(--muted-foreground)]">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-blue-500" />活跃用户</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />新增用户</span>
          </div>
          <div className="grid h-48 grid-cols-7 items-end gap-2 border-b border-[var(--border)] pb-2">
            {(data?.activeTrend ?? []).map((day) => (
              <div key={day.date} className="flex h-full min-w-0 flex-col justify-end gap-1">
                <div className="text-center text-xs font-medium tabular-nums">{day.activeUsers}</div>
                <div className="flex h-32 items-end justify-center gap-1">
                  <div
                    className="w-3 rounded-t bg-blue-500"
                    style={{ height: `${Math.max(day.activeUsers ? 4 : 0, (day.activeUsers / maxActive) * 100)}%` }}
                    title={`活跃 ${day.activeUsers}`}
                  />
                  <div
                    className="w-3 rounded-t bg-emerald-500"
                    style={{ height: `${Math.max(day.newUsers ? 4 : 0, (day.newUsers / maxActive) * 100)}%` }}
                    title={`新增 ${day.newUsers}`}
                  />
                </div>
                <div className="truncate text-center text-[11px] text-[var(--muted-foreground)]">{day.date.slice(5)}</div>
              </div>
            ))}
            {(!data || data.activeTrend.length === 0) && (
              <div className="col-span-7 self-center text-center text-sm text-[var(--muted-foreground)]">
                {isLoading ? "加载中…" : "暂无活跃数据"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ["累计事件", data?.totalEvents], ["累计会话", data?.sessions],
          ["累计崩溃", data?.crashes], ["累计错误", data?.errors],
        ] as Array<[string, number | undefined]>).map(([label, value]) => (
          <div key={label} className="rounded-lg bg-[var(--muted)] px-4 py-3">
            <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{value === undefined ? "…" : value.toLocaleString("en-US")}</div>
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
