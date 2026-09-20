"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { PulseScopeSelector, usePulseScope } from "../pulse-scope";

/** 崩溃明细：原始流水，不归并。归并后的问题列表在 crash-issues。只读。 */
export default function Page() {
  const { scope, setScope } = usePulseScope();
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-crash",
        eyebrow: "PULSE",
        title: "崩溃明细",
        description: "崩溃与错误的逐条原始记录——同一个 bug 发生一千次就是一千行。要按问题归并、分配状态、看堆栈符号化，请用「崩溃分析」；这一页用于核对某一次具体的上报。",
        endpoint: "/pulse/apm",
        listPath: "page",
        readOnly: true,
        permissions: { page: "pulse:apm:list" },
        fixedFilters: { projectId: scope.projectId, days: scope.days },
        headerActions: <PulseScopeSelector scope={scope} onChange={setScope} />,
        initialFilters: { kind: "Crash" },
        fields: [
          { key: "ts", label: "时间", format: "date" },
          // Declared twice: front-resource takes table columns from the non-filter entries, so a
          // filter-only key is searchable but invisible in the table.
          { key: "kind", label: "类型", filter: true, type: "select", options: [
            { label: "Crash · 致命崩溃", value: "Crash" },
            { label: "Error · 已捕获错误", value: "Error" },
          ] },
          { key: "kind", label: "类型" },
          { key: "name", label: "名称" },
          { key: "sessionId", label: "会话", format: "mono", filter: true },
          { key: "sessionId", label: "会话", format: "mono" },
          { key: "attributes", label: "详情（message / stack）", format: "mono" },
        ],
      }}
    />
  );
}
