"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-front-runtime/client";
import { useQuery } from "@neton/application-front-runtime/client-context";
import {
  Card, CardContent, CardHeader, CardTitle, DataTable, PageHeader, Select,
  type DataColumn,
} from "@neton/application-front-kit";
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

const versionColumns: DataColumn<VersionStats>[] = [
  { key: "buildNumber", header: "构建号", cell: (r) => <span className="font-medium tabular-nums">{r.buildNumber}</span> },
  { key: "appVersion", header: "版本", cell: (r) => r.appVersion ?? "-" },
  { key: "devices", header: "设备", cell: (r) => <span className="tabular-nums">{r.devices}</span> },
  { key: "sessions", header: "会话", cell: (r) => <span className="tabular-nums">{r.sessions}</span> },
  // 无崩溃设备率排在崩溃数前面：发版决策看的是比率，不是绝对数——
  // 绝对数会因为新版本覆盖的用户更多而上升，回答不了「这一版是不是更差」。
  {
    key: "crashFreeDeviceRate", header: "无崩溃设备率",
    cell: (r) => <span className="tabular-nums font-medium">{pct(r.crashFreeDeviceRate)}</span>,
  },
  { key: "crashFreeSessionRate", header: "无崩溃会话率", cell: (r) => <span className="tabular-nums">{pct(r.crashFreeSessionRate)}</span> },
  { key: "crashes", header: "崩溃", cell: (r) => <span className="tabular-nums">{r.crashes}</span> },
  { key: "newIssues", header: "新增问题", cell: (r) => <span className="tabular-nums">{r.newIssues}</span> },
  { key: "lastSeenAt", header: "最近上报", cell: (r) => (r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString("zh-CN") : "-") },
];

const regressionColumns: DataColumn<IssueOnBuild>[] = [
  { key: "title", header: "崩溃", cell: (r) => <span className="font-medium">{r.title}</span> },
  { key: "message", header: "信息", cell: (r) => <span className="text-xs">{r.message || "-"}</span> },
  { key: "devices", header: "影响设备", cell: (r) => <span className="tabular-nums">{r.devices}</span> },
  { key: "fingerprint", header: "指纹", cell: (r) => <code className="text-xs">{r.fingerprint.slice(0, 12)}</code> },
];

/**
 * 版本对比。头号指标是无崩溃设备率而不是崩溃数——
 * 崩溃数会因为新版覆盖用户更多而上升，回答不了「这一版是不是更差」，比率可以。
 *
 * 设备维度优先于会话维度：一个每次启动都崩的用户是一个不满意的用户，
 * 按会话算会让一个人看起来像一场事故。两个都给出，因为它们之间的差距本身有信息。
 */
export default function Page() {
  const [build, setBuild] = React.useState<string>("");
  const { scope, setScope } = usePulseScope();

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
        eyebrow="PULSE"
        title="版本分析"
        description="按构建号聚合。构建号是客户端上报的单调计数（iOS 取 CFBundleVersion，Android 取 versionCode），版本名只用于展示。"
        actions={<PulseScopeSelector scope={scope} onChange={setScope} />}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>对比</CardTitle>
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
          {!c && <div className="text-sm text-[var(--muted-foreground)]">{comparison.isLoading ? "加载中…" : "选择一个构建"}</div>}
          {c && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-[var(--border)] p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">本版无崩溃设备率</div>
                  <div className="text-2xl font-semibold tabular-nums">{pct(c.current.crashFreeDeviceRate)}</div>
                  {c.baseline && (
                    <div className={`text-xs tabular-nums ${deltaClass(c.crashFreeDeviceDelta)}`}>
                      {signed(c.crashFreeDeviceDelta)} vs 构建 {c.baseline.buildNumber}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-[var(--border)] p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">本版无崩溃会话率</div>
                  <div className="text-2xl font-semibold tabular-nums">{pct(c.current.crashFreeSessionRate)}</div>
                  {c.baseline && (
                    <div className={`text-xs tabular-nums ${deltaClass(c.crashFreeSessionDelta)}`}>
                      {signed(c.crashFreeSessionDelta)} vs 构建 {c.baseline.buildNumber}
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-[var(--border)] p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">覆盖设备</div>
                  <div className="text-2xl font-semibold tabular-nums">{c.current.devices}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">其中 {c.current.crashedDevices} 台发生过崩溃</div>
                </div>
                <div className="rounded-lg border border-[var(--border)] p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">本版新增问题</div>
                  <div className="text-2xl font-semibold tabular-nums">{c.current.newIssues}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">首次出现在这一版</div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">
                  相对构建 {c.baseline ? c.baseline.buildNumber : "—"} 新出现的崩溃
                </div>
                <DataTable
                  columns={regressionColumns}
                  rows={c.regressions}
                  rowKey={(r) => String(r.issueId)}
                  loading={comparison.isLoading}
                  emptyTitle={c.baseline ? "没有新增崩溃" : "没有可对比的上一版"}
                  emptyDescription={
                    c.baseline
                      ? "这一版没有引入上一版不存在的崩溃。"
                      : "这是最早一个上报数据的构建，没有基线可比。"
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>全部版本</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={versionColumns}
            rows={versions.data ?? []}
            rowKey={(r) => String(r.buildNumber)}
            loading={versions.isLoading}
            emptyTitle="还没有版本数据"
            emptyDescription="客户端上报构建号后，这里按构建聚合。"
          />
        </CardContent>
      </Card>
    </div>
  );
}
