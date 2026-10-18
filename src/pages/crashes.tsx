"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { useT } from "@neton/application-front-runtime/i18n";
import { PulseScopeSelector, usePulseScope } from "../pulse-scope";

/** 崩溃明细：原始流水，不归并。归并后的问题列表在 crash-issues。只读。 */
export default function Page() {
  const t = useT("pulse");
  const { scope, setScope } = usePulseScope();
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-crash",
        errorNamespace: "pulse",
        eyebrow: t("common.eyebrow"),
        title: t("crash.title"),
        description: t("crash.description"),
        endpoint: "/pulse/apm",
        listPath: "page",
        readOnly: true,
        permissions: { page: "pulse:apm:list" },
        fixedFilters: { projectId: scope.projectId, days: scope.days },
        headerActions: <PulseScopeSelector scope={scope} onChange={setScope} />,
        initialFilters: { kind: "Crash" },
        fields: [
          { key: "ts", label: t("common.field.time"), format: "date" },
          // Declared twice: front-resource takes table columns from the non-filter entries, so a
          // filter-only key is searchable but invisible in the table.
          { key: "kind", label: t("common.field.type"), filter: true, type: "select", options: [
            { label: t("kind.Crash"), value: "Crash" },
            { label: t("kind.Error"), value: "Error" },
          ] },
          { key: "kind", label: t("common.field.type") },
          { key: "name", label: t("common.field.name") },
          { key: "sessionId", label: t("common.field.session"), format: "mono", filter: true },
          { key: "sessionId", label: t("common.field.session"), format: "mono" },
          { key: "attributes", label: t("crash.field.attributes"), format: "mono" },
        ],
      }}
    />
  );
}
