"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import {
  Button, Card, CardContent, CardHeader, CardTitle, DataTable, Field, FilterPanel, PageHeader,
  Pagination, Select, Textarea, type DataColumn,
} from "@neton/application-front-kit";
import { PulseScopeSelector, pulseScopeParams, usePulseScope } from "../pulse-scope";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useFormat, useT } from "@neton/application-front-runtime/i18n";
import { StatCards, useTimeAgo } from "../pulse-ui";

interface Issue {
  id: number; projectId: string; fingerprint: string; title: string; kind: string; message: string;
  appKey: string | null; buildNumber: number | null;
  firstSeenAt: number; lastSeenAt: number; eventCount: number; deviceCount: number; status: number;
}
interface Frame {
  index: number; runtimeAddress: number; staticAddress: number;
  symbol: string | null; offset: number | null;
}
interface IssueDetail { issue: Issue; frames: Frame[]; symbolicated: boolean }
interface Page<T> { list: T[]; total: number }
interface Summary {
  total: number; open: number; inProgress: number; resolved: number; ignored: number;
  crash: number; error: number; devices: number;
}

const STATUS_CLASS: Record<number, string> = {
  0: "bg-red-50 text-red-700 border-red-200",
  1: "bg-amber-50 text-amber-700 border-amber-200",
  2: "bg-emerald-50 text-emerald-700 border-emerald-200",
  3: "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]",
};

const hex = (n: number) => `0x${(n >>> 0 === n ? n : n).toString(16)}`;

/**
 * 崩溃聚合。同一处崩溃归并成一个问题,按影响设备数排序——
 * 一台设备崩溃一千次,不比一千台设备各崩溃一次更重要。
 *
 * 堆栈在读取时符号化,不落库:符号表通常晚于崩溃才上传,而且随时可能被更准的一份替换,
 * 落库的符号会过期,原始地址不会。
 */
export default function Page() {
  const t = useT("pulse");
  const fmt = useFormat();
  const timeAgo = useTimeAgo();
  const describeError = useDescribeError("pulse");
  /** 处理状态 0..3（词条 `crashIssue.status.<n>`）；未知值原样显示。 */
  const statusLabel = (status: number) => (status >= 0 && status <= 3 ? t(`crashIssue.status.${status}`) : String(status));
  const queryClient = useQueryClient();
  const [selected, setSelected] = React.useState<number | null>(null);
  const [symbolText, setSymbolText] = React.useState("");
  const [uploadMsg, setUploadMsg] = React.useState<string | null>(null);
  const { scope, setScope } = usePulseScope();

  // draft 是表单里的值,filters 是已生效的值:筛选条件在点「查询」前不该影响列表,
  // 否则每敲一个字都打一次接口。
  const [filters, setFilters] = React.useState({ kind: "", status: "" });
  const [draft, setDraft] = React.useState(filters);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const listQuery = useQuery({
    queryKey: ["pulse-crash-issues", scope.projectId, scope.days, filters.kind, filters.status, page, pageSize],
    queryFn: () => {
      const params = new URLSearchParams({ pageNo: String(page), pageSize: String(pageSize) });
      if (filters.kind) params.set("kind", filters.kind);
      if (filters.status) params.set("status", filters.status);
      return apiFetch<Page<Issue>>(`/admin/pulse/crash/page?${params}&${pulseScopeParams(scope)}`);
    },
  });
  const summary = useQuery({
    queryKey: ["pulse-crash-summary", scope.projectId, scope.days],
    queryFn: () => apiFetch<Summary>(`/admin/pulse/crash/summary?${pulseScopeParams(scope)}`),
  });
  const detail = useQuery({
    queryKey: ["pulse-crash-detail", selected],
    queryFn: () => (selected ? apiFetch<IssueDetail>(`/admin/pulse/crash/get/${selected}`) : Promise.resolve(null)),
    enabled: selected !== null,
  });

  const applyFilters = (next: { kind: string; status: string }) => {
    setDraft(next); setFilters(next); setPage(1);
  };

  const setStatus = async (id: number, status: number) => {
    await apiWrite<void>("/admin/pulse/crash/status", "PUT", { id, status });
    await queryClient.invalidateQueries({ queryKey: ["pulse-crash-issues"] });
    await queryClient.invalidateQueries({ queryKey: ["pulse-crash-summary"] });
  };

  const uploadSymbols = async () => {
    const issue = detail.data?.issue;
    if (!issue?.appKey || !issue.buildNumber) {
      setUploadMsg(t("crashIssue.symbols.noBuild"));
      return;
    }
    try {
      const res = await apiWrite<{ loaded: number }>("/admin/pulse/crash/symbols/upload", "POST", {
        appKey: issue.appKey, buildNumber: issue.buildNumber, text: symbolText,
      });
      setUploadMsg(t("crashIssue.symbols.loaded", { count: res.loaded }));
      setSymbolText("");
      await queryClient.invalidateQueries({ queryKey: ["pulse-crash-detail"] });
    } catch (error) {
      // 符号表解析为空（SYMBOLS_EMPTY）等业务错误就地说明，而不是静默失败。
      setUploadMsg(describeError(error));
    }
  };

  const columns: DataColumn<Issue>[] = [
    {
      key: "title", header: t("crashIssue.column.issue"),
      cell: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={r.kind === "Error" ? "rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700" : "rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700"}>
              {r.kind === "Error" ? t("common.kind.error") : t("common.kind.crash")}
            </span>
            <span className="font-medium">{r.title}</span>
          </div>
          <div className="mt-0.5 max-w-xl truncate text-xs text-[var(--muted-foreground)]" title={r.message}>
            {r.message || t("crashIssue.noMessage")}
          </div>
        </div>
      ),
    },
    // 设备数在前：影响面比频率更能决定优先级。
    { key: "deviceCount", header: t("common.field.affectedDevices"), className: "text-right", headerClassName: "text-right", cell: (r) => <span className="tabular-nums font-medium">{r.deviceCount}</span> },
    { key: "eventCount", header: t("crashIssue.column.eventCount"), className: "text-right", headerClassName: "text-right", cell: (r) => <span className="tabular-nums">{r.eventCount}</span> },
    { key: "buildNumber", header: t("crashIssue.column.build"), cell: (r) => <span className="tabular-nums">{r.buildNumber ?? "-"}</span> },
    {
      key: "lastSeenAt", header: t("crashIssue.column.lastSeenAt"),
      cell: (r) => <span title={r.lastSeenAt ? fmt.dateTime(r.lastSeenAt) : ""}>{timeAgo(r.lastSeenAt)}</span>,
    },
    {
      key: "status", header: t("common.field.status"),
      cell: (r) => (
        <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[r.status] ?? ""}`}>
          {statusLabel(r.status)}
        </span>
      ),
    },
    {
      key: "actions", header: t("common.field.actions"), className: "text-right", headerClassName: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-2 whitespace-nowrap">
          <Button variant="outline" size="sm" onClick={() => { setSelected(r.id); setUploadMsg(null); }}>{t("crashIssue.action.stack")}</Button>
          {r.status !== 2 && <Button variant="outline" size="sm" onClick={() => void setStatus(r.id, 2)}>{t("crashIssue.status.2")}</Button>}
          {r.status !== 3 && <Button variant="outline" size="sm" onClick={() => void setStatus(r.id, 3)}>{t("common.action.ignore")}</Button>}
        </div>
      ),
    },
  ];

  const s = summary.data;
  const scopeNote = scope.days === "1" ? t("crashIssue.scope.today") : t("crashIssue.scope.days", { days: scope.days });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={t("common.eyebrow")}
        title={t("crashIssue.title")}
        description={t("crashIssue.description")}
        actions={<PulseScopeSelector scope={scope} onChange={(next) => { setSelected(null); setPage(1); setScope(next); }} />}
      />

      <StatCards
        columns={5}
        cards={[
          { label: t("crashIssue.stat.total"), value: s?.total, note: t("crashIssue.stat.totalNote", { scope: scopeNote }) },
          { label: t("crashIssue.status.0"), value: s?.open, tone: "danger", note: t("crashIssue.stat.openNote"), onClick: () => applyFilters({ ...filters, status: "0" }), active: filters.status === "0" },
          { label: t("crashIssue.status.1"), value: s?.inProgress, tone: "warning", note: t("crashIssue.stat.inProgressNote"), onClick: () => applyFilters({ ...filters, status: "1" }), active: filters.status === "1" },
          { label: t("crashIssue.stat.crash"), value: s?.crash, tone: "danger", note: t("crashIssue.stat.crashNote"), onClick: () => applyFilters({ ...filters, kind: "Crash" }), active: filters.kind === "Crash" },
          { label: t("crashIssue.stat.devices"), value: s?.devices, note: t("crashIssue.stat.devicesNote") },
        ]}
      />

      <FilterPanel onSubmit={(e) => { e.preventDefault(); applyFilters(draft); }}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Field label={t("crashIssue.filter.kind")}>
              <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                <option value="">{t("common.filter.all")}</option>
                <option value="Crash">{t("crashIssue.filter.kindCrash")}</option>
                <option value="Error">{t("crashIssue.filter.kindError")}</option>
              </Select>
            </Field>
          </div>
          <div className="min-w-48 flex-1">
            <Field label={t("crashIssue.filter.status")}>
              <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                <option value="">{t("common.filter.all")}</option>
                <option value="0">{t("crashIssue.status.0")}</option>
                <option value="1">{t("crashIssue.status.1")}</option>
                <option value="2">{t("crashIssue.status.2")}</option>
                <option value="3">{t("crashIssue.status.3")}</option>
              </Select>
            </Field>
          </div>
          <Button type="button" variant="ghost" onClick={() => applyFilters({ kind: "", status: "" })}>{t("common.action.reset")}</Button>
          <Button type="submit">{t("common.action.search")}</Button>
          <Button type="button" variant="outline" onClick={() => void listQuery.refetch()} disabled={listQuery.isFetching}>{t("common.action.refresh")}</Button>
        </div>
      </FilterPanel>

      <section className="front-surface overflow-hidden rounded-xl">
        <DataTable
          columns={columns}
          rows={listQuery.data?.list ?? []}
          rowKey={(r) => String(r.id)}
          loading={listQuery.isPending}
          error={listQuery.error ? describeError(listQuery.error) : undefined}
          emptyTitle={t("crashIssue.emptyTitle")}
          emptyDescription={t("crashIssue.emptyDescription")}
        />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={listQuery.data?.total ?? 0}
          loading={listQuery.isFetching}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </section>

      {selected !== null && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>
                {t("crashIssue.stack.title", { title: detail.data?.issue.title ?? "" })}
                {detail.data && !detail.data.symbolicated && (
                  <span className="ml-2 text-sm font-normal text-amber-600">{t("crashIssue.stack.unsymbolicated")}</span>
                )}
              </CardTitle>
              <Button variant="outline" onClick={() => setSelected(null)}>{t("common.action.close")}</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <pre className="overflow-auto rounded bg-[var(--muted)] p-3 text-xs leading-relaxed">
                {(detail.data?.frames ?? []).map((f) => (
                  <div key={f.index}>
                    <span className="text-[var(--muted-foreground)]">{`#${String(f.index).padStart(2, " ")} `}</span>
                    <span className="text-[var(--muted-foreground)]">{hex(f.staticAddress)} </span>
                    {f.symbol
                      ? <span>{f.symbol}{f.offset != null ? ` + ${f.offset}` : ""}</span>
                      // 跨镜像的帧不做解析：给一个看起来对、其实指错代码的函数名，比给不出名字更糟。
                      : <span className="text-[var(--muted-foreground)]">{t("crashIssue.stack.otherImage")}</span>}
                  </div>
                ))}
                {detail.isLoading && t("common.loading")}
                {!detail.isLoading && (detail.data?.frames ?? []).length === 0 && t("crashIssue.stack.empty")}
              </pre>

              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {t("crashIssue.symbols.title", { build: detail.data?.issue.buildNumber ?? "-" })}
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  {/* 词条用 {command} 标出命令的位置，命令本身按代码样式渲染。 */}
                  {(() => { const [before, after = ""] = t("crashIssue.symbols.hint").split("{command}"); return <>{before}<code>nm -n &lt;binary&gt;</code>{after}</>; })()}
                </div>
                <Textarea
                  rows={6}
                  value={symbolText}
                  onChange={(e) => setSymbolText(e.target.value)}
                  placeholder="0000000100001000 T _myFunction"
                />
                <div className="flex items-center gap-3">
                  <Button disabled={!symbolText.trim()} onClick={() => void uploadSymbols()}>{t("crashIssue.symbols.upload")}</Button>
                  {uploadMsg && <span className="text-sm text-[var(--muted-foreground)]">{uploadMsg}</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
