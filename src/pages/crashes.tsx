"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { PulseScopeSelector, usePulseScope } from "../pulse-scope";

/** 崩溃分析（Bugly / U-APM 类）：默认看 Crash，可切到 Error。堆栈/消息在属性里。只读。 */
export default function Page() {
  const { scope, setScope } = usePulseScope();
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-crash",
        eyebrow: "PULSE",
        title: "崩溃分析",
        description: "崩溃与错误明细。kind 输入 Crash 或 Error 切换；属性含 message / stack。",
        endpoint: "/pulse/apm",
        listPath: "page",
        readOnly: true,
        permissions: { page: "pulse:apm:list" },
        fixedFilters: { projectId: scope.projectId, days: scope.days },
        headerActions: <PulseScopeSelector scope={scope} onChange={setScope} />,
        initialFilters: { kind: "Crash" },
        fields: [
          { key: "ts", label: "时间", format: "date" },
          { key: "kind", label: "类型", filter: true },
          { key: "name", label: "名称" },
          { key: "sessionId", label: "会话", format: "mono", filter: true },
          { key: "attributes", label: "详情（message / stack）", format: "mono" },
        ],
      }}
    />
  );
}
