"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-front-runtime/client";
import { useQuery } from "@neton/application-front-runtime/client-context";
import {
  Card, CardContent, CardHeader, CardTitle, DataTable, PageHeader,
  type DataColumn,
} from "@neton/application-front-kit";
import { useFormat, useT, type Formatters, type Translate } from "@neton/application-front-runtime/i18n";
import { PulseScopeSelector, pulseScopeParams, usePulseScope } from "../pulse-scope";

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
interface PulseOverview {
  totalEvents: number; totalUsers: number; identifiedUsers: number; sessions: number;
  todayActiveUsers: number; todayNewUsers: number; todaySessions: number; todayLaunches: number;
  crashes: number; errors: number; timezone: string; activeTrend: ActiveTrendPoint[];
  byKind: KindCount[]; byDomain: DomainCount[]; topEvents: NameCount[]; recentIssues: PulseEvent[];
}
interface ConnectionSummary {
  online: number;
  activeLast5Minutes: number;
  sdkVersions: Array<{ sdkVersion: string; devices: number; sessions: number }>;
}

/** 与后端 EventDomain / V005 的三个视图一一对应（词条 `overview.domain.<domain>`）。 */
const DOMAINS = new Set(["analytics", "apm", "security"]);

const topEventColumns = (t: Translate, fmt: Formatters): DataColumn<NameCount>[] => [
  { key: "name", header: t("overview.column.eventName"), cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "count", header: t("common.field.count"), cell: (r) => fmt.number(r.count) },
];

const issueColumns = (t: Translate): DataColumn<PulseEvent>[] => [
  { key: "kind", header: t("common.field.type"), cell: (r) => <span className={r.kind === "Crash" ? "text-red-600 font-medium" : "text-amber-600 font-medium"}>{r.kind}</span> },
  { key: "name", header: t("common.field.name"), cell: (r) => r.name },
  { key: "session", header: t("common.field.session"), cell: (r) => <code className="text-xs">{r.sessionId.slice(0, 12)}…</code> },
  { key: "attrs", header: t("common.field.detail"), cell: (r) => <code className="text-xs">{r.attributes.slice(0, 60)}</code> },
];

export default function Page() {
  const t = useT("pulse");
  const fmt = useFormat();
  const { scope, setScope } = usePulseScope();
  const { data, isLoading } = useQuery({
    queryKey: ["pulse-overview", scope.projectId, scope.days],
    queryFn: () => apiFetch<PulseOverview>(
      `/admin/pulse/stats/overview?${pulseScopeParams(scope)}`,
    ),
  });
  const connections = useQuery({
    queryKey: ["pulse-connection-summary", scope.projectId],
    queryFn: () => apiFetch<ConnectionSummary>(
      `/admin/pulse/connection/summary?${pulseScopeParams({ ...scope, days: "1" })}`,
    ),
    refetchInterval: 10_000,
  });
  const scopeParams = pulseScopeParams(scope);

  const cards: Array<[string, number | undefined, string, string]> = [
    [t("common.stat.online"), connections.data?.online, "text-emerald-600", t("overview.note.online")],
    [t("common.stat.activeLast5Minutes"), connections.data?.activeLast5Minutes, "text-blue-600", t("overview.note.activeLast5Minutes")],
    [t("overview.stat.totalUsers"), data?.totalUsers, "text-[var(--foreground)]", t("overview.note.totalUsers")],
    [t("overview.stat.todayActiveUsers"), data?.todayActiveUsers, "text-blue-600", t("overview.note.todayActiveUsers")],
    [t("overview.stat.todayNewUsers"), data?.todayNewUsers, "text-emerald-600", t("overview.note.todayNewUsers")],
    [t("overview.stat.todayLaunches"), data?.todayLaunches, "text-[var(--foreground)]", t("overview.note.todayLaunches")],
    [t("overview.stat.todaySessions"), data?.todaySessions, "text-[var(--foreground)]", t("overview.note.todaySessions")],
    [t("overview.stat.identifiedUsers"), data?.identifiedUsers, "text-[var(--foreground)]", t("overview.note.identifiedUsers")],
  ];
  const maxKind = Math.max(1, ...(data?.byKind ?? []).map((k) => k.count));
  const maxActive = Math.max(1, ...(data?.activeTrend ?? []).map((d) => Math.max(d.activeUsers, d.newUsers)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader eyebrow={t("common.eyebrow")} title={t("overview.title")} description={t("overview.description")} />
        <PulseScopeSelector scope={scope} onChange={setScope} />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <a className="rounded-md border border-[var(--border)] px-3 py-2 hover:bg-[var(--muted)]" href={`/pulse/events?${scopeParams}`}>{t("overview.link.events")}</a>
        <a className="rounded-md border border-[var(--border)] px-3 py-2 hover:bg-[var(--muted)]" href={`/pulse/versions?${scopeParams}`}>{t("overview.link.versions")}</a>
        <a className="rounded-md border border-[var(--border)] px-3 py-2 hover:bg-[var(--muted)]" href={`/pulse/crash-issues?${scopeParams}`}>{t("overview.link.crashIssues")}</a>
        <a className="rounded-md border border-[var(--border)] px-3 py-2 hover:bg-[var(--muted)]" href={`/pulse/performance?${scopeParams}`}>{t("overview.link.performance")}</a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {cards.map(([label, v, cls, note]) => (
          <div key={label} className="rounded-lg border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
            <div className={`text-2xl font-semibold tabular-nums ${cls}`}>
              {v === undefined ? "…" : fmt.number(v)}
            </div>
            <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">{note}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{scope.days === "1" ? t("overview.trend.titleToday") : t("overview.trend.titleDays", { days: scope.days })}</CardTitle>
            <span className="text-xs text-[var(--muted-foreground)]">{t("overview.trend.timezone", { timezone: data?.timezone ?? "—" })}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex gap-4 text-xs text-[var(--muted-foreground)]">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-blue-500" />{t("overview.trend.activeUsers")}</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />{t("overview.trend.newUsers")}</span>
          </div>
          <div className="grid h-48 grid-cols-7 items-end gap-2 border-b border-[var(--border)] pb-2">
            {(data?.activeTrend ?? []).map((day) => (
              <div key={day.date} className="flex h-full min-w-0 flex-col justify-end gap-1">
                <div className="text-center text-xs font-medium tabular-nums">{day.activeUsers}</div>
                <div className="flex h-32 items-end justify-center gap-1">
                  <div
                    className="w-3 rounded-t bg-blue-500"
                    style={{ height: `${Math.max(day.activeUsers ? 4 : 0, (day.activeUsers / maxActive) * 100)}%` }}
                    title={t("overview.trend.activeTip", { count: day.activeUsers })}
                  />
                  <div
                    className="w-3 rounded-t bg-emerald-500"
                    style={{ height: `${Math.max(day.newUsers ? 4 : 0, (day.newUsers / maxActive) * 100)}%` }}
                    title={t("overview.trend.newTip", { count: day.newUsers })}
                  />
                </div>
                <div className="truncate text-center text-[11px] text-[var(--muted-foreground)]">{day.date.slice(5)}</div>
              </div>
            ))}
            {(!data || data.activeTrend.length === 0) && (
              <div className="col-span-7 self-center text-center text-sm text-[var(--muted-foreground)]">
                {isLoading ? t("common.loading") : t("overview.trend.empty")}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          [t("overview.stat.totalEvents"), data?.totalEvents], [t("overview.stat.totalSessions"), data?.sessions],
          [t("overview.stat.totalCrashes"), data?.crashes], [t("overview.stat.totalErrors"), data?.errors],
        ] as Array<[string, number | undefined]>).map(([label, value]) => (
          <div key={label} className="rounded-lg bg-[var(--muted)] px-4 py-3">
            <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{value === undefined ? "…" : fmt.number(value)}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>{t("overview.domain.title")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {(data?.byDomain ?? []).map((d) => (
              <div key={d.domain} className="rounded-lg border border-[var(--border)] p-4">
                <div className="text-xs text-[var(--muted-foreground)]">{DOMAINS.has(d.domain) ? t(`overview.domain.${d.domain}`) : d.domain}</div>
                <div className="text-xl font-semibold tabular-nums">{fmt.number(d.count)}</div>
              </div>
            ))}
            {(!data || data.byDomain.length === 0) && (
              <div className="text-sm text-[var(--muted-foreground)]">{isLoading ? t("common.loading") : t("common.noData")}</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("overview.byKind.title")}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data?.byKind ?? []).map((k) => (
                <div key={k.kind} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-[var(--muted-foreground)]">{k.kind}</div>
                  <div className="flex-1 h-3 rounded bg-[var(--muted)] overflow-hidden">
                    <div className="h-full bg-[var(--primary)]" style={{ width: `${(k.count / maxKind) * 100}%` }} />
                  </div>
                  <div className="w-16 text-right text-xs tabular-nums">{fmt.number(k.count)}</div>
                </div>
              ))}
              {(!data || data.byKind.length === 0) && (
                <div className="text-sm text-[var(--muted-foreground)]">{isLoading ? t("common.loading") : t("common.noData")}</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("overview.topEvents.title")}</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={topEventColumns(t, fmt)}
              rows={data?.topEvents ?? []}
              rowKey={(r) => r.name}
              loading={isLoading}
              emptyTitle={t("overview.topEvents.emptyTitle")}
              emptyDescription={t("overview.topEvents.emptyDescription")}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("overview.recentIssues.title")}</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={issueColumns(t)}
            rows={data?.recentIssues ?? []}
            rowKey={(r) => String(r.id)}
            loading={isLoading}
            emptyTitle={t("overview.recentIssues.emptyTitle")}
            emptyDescription={t("overview.recentIssues.emptyDescription")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
