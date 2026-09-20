"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { PulseScopeSelector, usePulseScope } from "../pulse-scope";

/** 事件分析（U-App 类）：全部上报事件，可按类型 / 事件名 / 会话筛选。只读。 */
export default function Page() {
  const { scope, setScope } = usePulseScope();
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-event",
        eyebrow: "PULSE",
        title: "事件",
        description: "客户端上报的统一事件，只存元数据。可按类型、事件名、会话筛选。",
        endpoint: "/pulse/event",
        listPath: "page",
        readOnly: true,
        permissions: { page: "pulse:event:list" },
        fixedFilters: { projectId: scope.projectId, days: scope.days },
        headerActions: <PulseScopeSelector scope={scope} onChange={setScope} />,
        fields: [
          { key: "ts", label: "时间", format: "date" },
          // Each filterable key is declared twice on purpose: front-resource builds the filter
          // panel from the `filter: true` entries and the table columns from everything else, so a
          // key that only appears once as a filter can be searched but never read. Type, event
          // name and session are the three things this page exists to show.
          { key: "kind", label: "类型", filter: true },
          { key: "kind", label: "类型" },
          { key: "name", label: "事件", filter: true },
          { key: "name", label: "事件" },
          { key: "sessionId", label: "会话", format: "mono", filter: true },
          { key: "sessionId", label: "会话", format: "mono" },
          { key: "sourceModule", label: "来源模块", format: "mono" },
          { key: "sourceImageUuid", label: "镜像 UUID", format: "mono" },
          { key: "attributes", label: "属性", format: "mono" },
        ],
      }}
    />
  );
}
