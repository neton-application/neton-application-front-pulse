"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { useT } from "@neton/application-front-runtime/i18n";
import { PulseScopeSelector, usePulseScope } from "../pulse-scope";

/** 性能：逐条耗时采样，只读。聚合视图在「概览」与「版本分析」。 */
export default function Page() {
  const t = useT("pulse");
  const { scope, setScope } = usePulseScope();
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-perf",
        errorNamespace: "pulse",
        eyebrow: t("common.eyebrow"),
        title: t("performance.title"),
        description: t("performance.description"),
        endpoint: "/pulse/apm",
        listPath: "page",
        readOnly: true,
        permissions: { page: "pulse:apm:list" },
        fixedFilters: { projectId: scope.projectId, days: scope.days },
        headerActions: <PulseScopeSelector scope={scope} onChange={setScope} />,
        initialFilters: { kind: "Performance" },
        fields: [
          { key: "ts", label: t("common.field.time"), format: "date" },
          // Declared twice: front-resource takes table columns from the non-filter entries, so a
          // filter-only key is searchable but invisible in the table.
          // Network 是协议里留给网络采样的类别；SDK 目前把网络请求记为 Runtime/network_request,
          // 所以这里只列真实会出现的值,避免给出一个永远查不到东西的选项。
          { key: "kind", label: t("common.field.type"), filter: true, type: "select", options: [
            { label: t("kind.Performance"), value: "Performance" },
          ] },
          { key: "kind", label: t("common.field.type") },
          { key: "name", label: t("performance.field.metric") },
          { key: "sessionId", label: t("common.field.session"), format: "mono", filter: true },
          { key: "sessionId", label: t("common.field.session"), format: "mono" },
          { key: "attributes", label: t("performance.field.attributes"), format: "mono" },
        ],
      }}
    />
  );
}
