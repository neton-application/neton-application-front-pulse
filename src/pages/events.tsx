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
        description: "所有上报事件的原始流水，一行就是客户端发生过的一件事，不做任何聚合。排查具体某台设备、某次会话做了什么时从这里查；看趋势和汇总请去「概览」「版本分析」「崩溃分析」。只存元数据，不含用户内容。",
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
          { key: "kind", label: "类型", filter: true, type: "select", options: [
            { label: "Analytics · 产品行为", value: "Analytics" },
            { label: "Runtime · 运行时动作", value: "Runtime" },
            { label: "Performance · 性能采样", value: "Performance" },
            { label: "Error · 已捕获错误", value: "Error" },
            { label: "Crash · 致命崩溃", value: "Crash" },
            { label: "Log · 日志", value: "Log" },
            { label: "Breadcrumb · 行为面包屑", value: "Breadcrumb" },
          ] },
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
