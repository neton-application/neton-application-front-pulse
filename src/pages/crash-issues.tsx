"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useQuery, useQueryClient } from "@neton/application-front-runtime/client-context";
import {
  Button, Card, CardContent, CardHeader, CardTitle, DataTable, Field, FilterPanel, PageHeader,
  Pagination, Select, Textarea, type DataColumn,
} from "@neton/application-front-kit";
import { PulseScopeSelector, pulseScopeParams, usePulseScope } from "../pulse-scope";
import { StatCards, timeAgo } from "../pulse-ui";

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

const STATUS_LABEL: Record<number, string> = { 0: "待处理", 1: "处理中", 2: "已解决", 3: "已忽略" };
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
      setUploadMsg("该问题没有归属的构建号，无法确定符号表属于哪个版本。");
      return;
    }
    const res = await apiWrite<{ loaded: number }>("/admin/pulse/crash/symbols/upload", "POST", {
      appKey: issue.appKey, buildNumber: issue.buildNumber, text: symbolText,
    });
    setUploadMsg(`已载入 ${res.loaded} 个符号。`);
    setSymbolText("");
    await queryClient.invalidateQueries({ queryKey: ["pulse-crash-detail"] });
  };

  const columns: DataColumn<Issue>[] = [
    {
      key: "title", header: "问题",
      cell: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={r.kind === "Error" ? "rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700" : "rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700"}>
              {r.kind === "Error" ? "错误" : "崩溃"}
            </span>
            <span className="font-medium">{r.title}</span>
          </div>
          <div className="mt-0.5 max-w-xl truncate text-xs text-[var(--muted-foreground)]" title={r.message}>
            {r.message || "无附加信息"}
          </div>
        </div>
      ),
    },
    // 设备数在前：影响面比频率更能决定优先级。
    { key: "deviceCount", header: "影响设备", className: "text-right", headerClassName: "text-right", cell: (r) => <span className="tabular-nums font-medium">{r.deviceCount}</span> },
    { key: "eventCount", header: "发生次数", className: "text-right", headerClassName: "text-right", cell: (r) => <span className="tabular-nums">{r.eventCount}</span> },
    { key: "buildNumber", header: "构建", cell: (r) => <span className="tabular-nums">{r.buildNumber ?? "-"}</span> },
    {
      key: "lastSeenAt", header: "最近发生",
      cell: (r) => <span title={r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString("zh-CN") : ""}>{timeAgo(r.lastSeenAt)}</span>,
    },
    {
      key: "status", header: "状态",
      cell: (r) => (
        <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[r.status] ?? ""}`}>
          {STATUS_LABEL[r.status] ?? String(r.status)}
        </span>
      ),
    },
    {
      key: "actions", header: "操作", className: "text-right", headerClassName: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-2 whitespace-nowrap">
          <Button variant="outline" size="sm" onClick={() => { setSelected(r.id); setUploadMsg(null); }}>堆栈</Button>
          {r.status !== 2 && <Button variant="outline" size="sm" onClick={() => void setStatus(r.id, 2)}>已解决</Button>}
          {r.status !== 3 && <Button variant="outline" size="sm" onClick={() => void setStatus(r.id, 3)}>忽略</Button>}
        </div>
      ),
    },
  ];

  const s = summary.data;
  const scopeNote = scope.days === "1" ? "今日" : `近 ${scope.days} 日`;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="PULSE"
        title="崩溃分析"
        description="客户端上报的崩溃（致命）与错误（已捕获）按指纹归并为「问题」。分组依据是栈顶若干帧的静态地址（已去掉 ASLR 偏移），不是崩溃信息文本——同一个 bug 的文本常常带着每次不同的地址。列表按影响设备数排序。"
        actions={<PulseScopeSelector scope={scope} onChange={(next) => { setSelected(null); setPage(1); setScope(next); }} />}
      />

      <StatCards
        columns={5}
        cards={[
          { label: "问题总数", value: s?.total, note: `${scopeNote}内有新发生的问题数（归并后）` },
          { label: "待处理", value: s?.open, tone: "danger", note: "还没人认领，点此只看这些", onClick: () => applyFilters({ ...filters, status: "0" }), active: filters.status === "0" },
          { label: "处理中", value: s?.inProgress, tone: "warning", note: "已认领，尚未发版修复", onClick: () => applyFilters({ ...filters, status: "1" }), active: filters.status === "1" },
          { label: "致命崩溃", value: s?.crash, tone: "danger", note: "进程直接退出，用户当场丢失会话", onClick: () => applyFilters({ ...filters, kind: "Crash" }), active: filters.kind === "Crash" },
          { label: "受影响设备次", value: s?.devices, note: "各问题影响设备数之和，同一台设备可重复计入" },
        ]}
      />

      <FilterPanel onSubmit={(e) => { e.preventDefault(); applyFilters(draft); }}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Field label="类别">
              <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                <option value="">全部</option>
                <option value="Crash">崩溃（致命）</option>
                <option value="Error">错误（已捕获）</option>
              </Select>
            </Field>
          </div>
          <div className="min-w-48 flex-1">
            <Field label="处理状态">
              <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                <option value="">全部</option>
                <option value="0">待处理</option>
                <option value="1">处理中</option>
                <option value="2">已解决</option>
                <option value="3">已忽略</option>
              </Select>
            </Field>
          </div>
          <Button type="button" variant="ghost" onClick={() => applyFilters({ kind: "", status: "" })}>重置</Button>
          <Button type="submit">查询</Button>
          <Button type="button" variant="outline" onClick={() => void listQuery.refetch()} disabled={listQuery.isFetching}>刷新</Button>
        </div>
      </FilterPanel>

      <section className="front-surface overflow-hidden rounded-xl">
        <DataTable
          columns={columns}
          rows={listQuery.data?.list ?? []}
          rowKey={(r) => String(r.id)}
          loading={listQuery.isPending}
          error={listQuery.error?.message}
          emptyTitle="没有符合条件的问题"
          emptyDescription="客户端上报的崩溃与错误会在这里按指纹聚合；当前时间范围与筛选条件下没有记录。"
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
                堆栈 · {detail.data?.issue.title ?? ""}
                {detail.data && !detail.data.symbolicated && (
                  <span className="ml-2 text-sm font-normal text-amber-600">未符号化（尚未上传该构建的符号表）</span>
                )}
              </CardTitle>
              <Button variant="outline" onClick={() => setSelected(null)}>关闭</Button>
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
                      : <span className="text-[var(--muted-foreground)]">{"<其他镜像>"}</span>}
                  </div>
                ))}
                {detail.isLoading && "加载中…"}
                {!detail.isLoading && (detail.data?.frames ?? []).length === 0 && "该问题没有携带堆栈（平台未提供 backtrace，或上报端被裁剪）。"}
              </pre>

              <div className="space-y-2">
                <div className="text-sm font-medium">
                  上传符号表（构建 {detail.data?.issue.buildNumber ?? "-"}）
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  粘贴 <code>nm -n &lt;binary&gt;</code> 的输出。符号按构建存储，重新上传会整表替换。
                </div>
                <Textarea
                  rows={6}
                  value={symbolText}
                  onChange={(e) => setSymbolText(e.target.value)}
                  placeholder="0000000100001000 T _myFunction"
                />
                <div className="flex items-center gap-3">
                  <Button disabled={!symbolText.trim()} onClick={() => void uploadSymbols()}>载入符号</Button>
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
