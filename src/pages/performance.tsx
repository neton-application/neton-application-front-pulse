"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { PulseScopeSelector, usePulseScope } from "../pulse-scope";

/** 性能（U-APM 类）：启动耗时、网络性能等采样。kind 输入 Performance 或 Network 切换。只读。 */
export default function Page() {
  const { scope, setScope } = usePulseScope();
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-perf",
        eyebrow: "PULSE",
        title: "性能",
        description: "性能采样：启动耗时、网络请求等。kind 输入 Performance 或 Network 切换。",
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
          { key: "kind", label: "类型", filter: true },
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
