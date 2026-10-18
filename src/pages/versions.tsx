"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-front-runtime/client";
import { useQuery } from "@neton/application-front-runtime/client-context";
import {
  Button, Card, CardContent, CardHeader, CardTitle, DataTable, PageHeader, Pagination, Select,
  type DataColumn,
} from "@neton/application-front-kit";
import { useFormat, useT, type Formatters, type Translate } from "@neton/application-front-runtime/i18n";
import { useTimeAgo } from "../pulse-ui";
import { PulseScopeSelector, pulseScopeParams, usePulseScope } from "../pulse-scope";

interface VersionStats {
  buildNumber: number; appVersion: string | null;
  devices: number; sessions: number; events: number;
  crashes: number; errors: number; crashedDevices: number; crashedSessions: number;
  newIssues: number; firstSeenAt: number; lastSeenAt: number;
  crashFreeDeviceRate: number; crashFreeSessionRate: number;
}
interface IssueOnBuild {
  issueId: number; title: string; message: string; fingerprint: string;
  devices: number; events: number;
}
interface Comparison {
  current: VersionStats; baseline: VersionStats | null;
  crashFreeDeviceDelta: number; crashFreeSessionDelta: number;
  regressions: IssueOnBuild[];
}

const pct = (n: number) => `${n.toFixed(2)}%`;
/** 负数是变差：崩溃率越高，无崩溃率越低。 */
const deltaClass = (d: number) => (d < -0.005 ? "text-red-600" : d > 0.005 ? "text-green-600" : "");
const signed = (d: number) => `${d >= 0 ? "+" : ""}${d.toFixed(2)}pp`;

function versionColumns(t: Translate, fmt: Formatters, timeAgo: (ms: number) => string, onCompare: (build: number) => void): DataColumn<VersionStats>[] { return [
  { key: "buildNumber", header: t("common.field.buildNumber"), cell: (r) => <span className="font-medium tabular-nums">{r.buildNumber}</span> },
  { key: "appVersion", header: t("versions.column.appVersion"), cell: (r) => r.appVersion ?? "-" },
  { key: "devices", header: t("common.field.devices"), cell: (r) => <span className="tabular-nums">{r.devices}</span> },
  { key: "sessions", header: t("common.field.session"), cell: (r) => <span className="tabular-nums">{r.sessions}</span> },
  // 无崩溃设备率排在崩溃数前面：发版决策看的是比率，不是绝对数——
  // 绝对数会因为新版本覆盖的用户更多而上升，回答不了「这一版是不是更差」。
  {
    key: "crashFreeDeviceRate", header: t("versions.column.crashFreeDeviceRate"),
    cell: (r) => <span className="tabular-nums font-medium">{pct(r.crashFreeDeviceRate)}</span>,
  },
  { key: "crashFreeSessionRate", header: t("versions.column.crashFreeSessionRate"), cell: (r) => <span className="tabular-nums">{pct(r.crashFreeSessionRate)}</span> },
  { key: "crashes", header: t("common.kind.crash"), cell: (r) => <span className="tabular-nums">{r.crashes}</span> },
  { key: "newIssues", header: t("versions.column.newIssues"), cell: (r) => <span className="tabular-nums">{r.newIssues}</span> },
  {
    key: "lastSeenAt", header: t("versions.column.lastSeenAt"),
    cell: (r) => <span title={r.lastSeenAt ? fmt.dateTime(r.lastSeenAt) : ""}>{timeAgo(r.lastSeenAt)}</span>,
  },
  {
    key: "actions", header: t("common.field.actions"), className: "text-right", headerClassName: "text-right",
    cell: (r) => (
      <Button variant="outline" size="sm" onClick={() => onCompare(r.buildNumber)}>{t("versions.action.compare")}</Button>
    ),
  },
]; }

const regressionColumns = (t: Translate): DataColumn<IssueOnBuild>[] => [
  { key: "title", header: t("common.kind.crash"), cell: (r) => <span className="font-medium">{r.title}</span> },
  { key: "message", header: t("versions.column.message"), cell: (r) => <span className="text-xs">{r.message || "-"}</span> },
  { key: "devices", header: t("common.field.affectedDevices"), cell: (r) => <span className="tabular-nums">{r.devices}</span> },
  { key: "fingerprint", header: t("versions.column.fingerprint"), cell: (r) => <code className="text-xs">{r.fingerprint.slice(0, 12)}</code> },
];

/**
 * 版本对比。头号指标是无崩溃设备率而不是崩溃数——
 * 崩溃数会因为新版覆盖用户更多而上升，回答不了「这一版是不是更差」，比率可以。
 *
 * 设备维度优先于会话维度：一个每次启动都崩的用户是一个不满意的用户，
 * 按会话算会让一个人看起来像一场事故。两个都给出，因为它们之间的差距本身有信息。
 */
export default function Page() {
  const t = useT("pulse");
  const fmt = useFormat();
  const timeAgo = useTimeAgo();
  const [build, setBuild] = React.useState<string>("");
  const { scope, setScope } = usePulseScope();
  // 版本表不走服务端分页：一个应用的构建数量有限，接口一次就返回全部,
  // 但「有限」在两年后是三位数,所以列表本身仍然要翻页。
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const versions = useQuery({
    queryKey: ["pulse-versions", scope.projectId, scope.days],
    queryFn: () => apiFetch<VersionStats[]>(`/admin/pulse/version/list?${pulseScopeParams(scope)}`),
  });

  // 默认选最新构建：打开这一页多半是刚发完版想看它怎么样。
  React.useEffect(() => {
    if (versions.data && versions.data.length > 0 && !versions.data.some((v) => String(v.buildNumber) === build)) {
      setBuild(String(versions.data[0].buildNumber));
    } else if (versions.data?.length === 0 && build) {
      setBuild("");
    }
  }, [versions.data, build]);

  const comparison = useQuery({
    queryKey: ["pulse-version-compare", build, scope.projectId, scope.days],
    queryFn: () => (build ? apiFetch<Comparison>(`/admin/pulse/version/compare?buildNumber=${build}&${pulseScopeParams(scope)}`) : Promise.resolve(null)),
    enabled: build !== "",
  });

  const c = comparison.data;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={t("common.eyebrow")}
        title={t("versions.title")}
        description={t("versions.description")}
        actions={<PulseScopeSelector scope={scope} onChange={setScope} />}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{t("versions.compare.title")}</CardTitle>
            <Select value={build} onChange={(e) => setBuild(e.target.value)}>
              {(versions.data ?? []).map((v) => (
                <option key={v.buildNumber} value={String(v.buildNumber)}>
                  {v.buildNumber}{v.appVersion ? ` · ${v.appVersion}` : ""}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!c && <div className="text-sm text-[var(--muted-foreground)]">{comparison.isLoading ? t("common.loading") : t("versions.compare.pick")}</div>}
          {c && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-[var(--border)] p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">{t("versions.compare.crashFreeDeviceRate")}</div>
                  <div className="text-2xl font-semibold tabular-nums">{pct(c.current.crashFreeDeviceRate)}</div>
                  {c.baseline && (
                    <div className={`text-xs tabular-nums ${deltaClass(c.crashFreeDeviceDelta)}`}>
                      {t("versions.compare.delta", { delta: signed(c.crashFreeDeviceDelta), build: c.baseline.buildNumber })}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-[var(--border)] p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">{t("versions.compare.crashFreeSessionRate")}</div>
                  <div className="text-2xl font-semibold tabular-nums">{pct(c.current.crashFreeSessionRate)}</div>
                  {c.baseline && (
                    <div className={`text-xs tabular-nums ${deltaClass(c.crashFreeSessionDelta)}`}>
                      {t("versions.compare.delta", { delta: signed(c.crashFreeSessionDelta), build: c.baseline.buildNumber })}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-[var(--border)] p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">{t("versions.compare.devices")}</div>
                  <div className="text-2xl font-semibold tabular-nums">{c.current.devices}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{t("versions.compare.crashedDevices", { count: c.current.crashedDevices })}</div>
                </div>
                <div className="rounded-lg border border-[var(--border)] p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">{t("versions.compare.newIssues")}</div>
                  <div className="text-2xl font-semibold tabular-nums">{c.current.newIssues}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{t("versions.compare.newIssuesNote")}</div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">
                  {t("versions.compare.regressions", { build: c.baseline ? c.baseline.buildNumber : "—" })}
                </div>
                <DataTable
                  columns={regressionColumns(t)}
                  rows={c.regressions}
                  rowKey={(r) => String(r.issueId)}
                  loading={comparison.isLoading}
                  emptyTitle={c.baseline ? t("versions.compare.noRegressions") : t("versions.compare.noBaseline")}
                  emptyDescription={
                    c.baseline
                      ? t("versions.compare.noRegressionsDescription")
                      : t("versions.compare.noBaselineDescription")
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("versions.all.title")}</CardTitle></CardHeader>
        <CardContent className="px-0 pb-0">
          <DataTable
            columns={versionColumns(t, fmt, timeAgo, (b) => setBuild(String(b)))}
            rows={(versions.data ?? []).slice((page - 1) * pageSize, page * pageSize)}
            rowKey={(r) => String(r.buildNumber)}
            loading={versions.isLoading}
            emptyTitle={t("versions.all.emptyTitle")}
            emptyDescription={t("versions.all.emptyDescription")}
          />
          <Pagination
            page={page} pageSize={pageSize} total={versions.data?.length ?? 0}
            loading={versions.isFetching}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
