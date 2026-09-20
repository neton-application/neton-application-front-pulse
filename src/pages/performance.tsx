"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { PulseScopeSelector, usePulseScope } from "../pulse-scope";

/** 性能：逐条耗时采样，只读。聚合视图在「概览」与「版本分析」。 */
export default function Page() {
  const { scope, setScope } = usePulseScope();
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-perf",
        eyebrow: "PULSE",
        title: "性能",
        description: "逐条性能采样：每行是一次被计时的操作，耗时在「详情」的 duration_ms 里。指标名由客户端定义（如 app_launch_to_first_frame）。",
        endpoint: "/pulse/apm",
        listPath: "page",
        readOnly: true,
        permissions: { page: "pulse:apm:list" },
        fixedFilters: { projectId: scope.projectId, days: scope.days },
        headerActions: <PulseScopeSelector scope={scope} onChange={setScope} />,
        initialFilters: { kind: "Performance" },
        fields: [
          { key: "ts", label: "时间", format: "date" },
          // Declared twice: front-resource takes table columns from the non-filter entries, so a
          // filter-only key is searchable but invisible in the table.
          // Network 是协议里留给网络采样的类别；SDK 目前把网络请求记为 Runtime/network_request,
          // 所以这里只列真实会出现的值,避免给出一个永远查不到东西的选项。
          { key: "kind", label: "类型", filter: true, type: "select", options: [
            { label: "Performance · 性能采样", value: "Performance" },
          ] },
          { key: "kind", label: "类型" },
          { key: "name", label: "指标" },
          { key: "sessionId", label: "会话", format: "mono", filter: true },
          { key: "sessionId", label: "会话", format: "mono" },
          { key: "attributes", label: "详情（duration_ms 等）", format: "mono" },
        ],
      }}
    />
  );
}
