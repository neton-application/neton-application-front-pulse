"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { useT } from "@neton/application-front-runtime/i18n";
import { PulseScopeSelector, usePulseScope } from "../pulse-scope";

/** 事件分析（U-App 类）：全部上报事件，可按类型 / 事件名 / 会话筛选。只读。 */
export default function Page() {
  const t = useT("pulse");
  const { scope, setScope } = usePulseScope();
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-event",
        errorNamespace: "pulse",
        eyebrow: t("common.eyebrow"),
        title: t("event.title"),
        description: t("event.description"),
        endpoint: "/pulse/event",
        listPath: "page",
        readOnly: true,
        permissions: { page: "pulse:event:list" },
        fixedFilters: { projectId: scope.projectId, days: scope.days },
        headerActions: <PulseScopeSelector scope={scope} onChange={setScope} />,
        fields: [
          { key: "ts", label: t("common.field.time"), format: "date" },
          // Each filterable key is declared twice on purpose: front-resource builds the filter
          // panel from the `filter: true` entries and the table columns from everything else, so a
          // key that only appears once as a filter can be searched but never read. Type, event
          // name and session are the three things this page exists to show.
          { key: "kind", label: t("common.field.type"), filter: true, type: "select", options: [
            { label: t("kind.Analytics"), value: "Analytics" },
            { label: t("kind.Runtime"), value: "Runtime" },
            { label: t("kind.Performance"), value: "Performance" },
            { label: t("kind.Error"), value: "Error" },
            { label: t("kind.Crash"), value: "Crash" },
            { label: t("kind.Log"), value: "Log" },
            { label: t("kind.Breadcrumb"), value: "Breadcrumb" },
          ] },
          { key: "kind", label: t("common.field.type") },
          { key: "name", label: t("event.field.name"), filter: true },
          { key: "name", label: t("event.field.name") },
          { key: "sessionId", label: t("common.field.session"), format: "mono", filter: true },
          { key: "sessionId", label: t("common.field.session"), format: "mono" },
          { key: "sourceModule", label: t("common.field.sourceModule"), format: "mono" },
          { key: "sourceImageUuid", label: t("event.field.imageUuid"), format: "mono" },
          { key: "attributes", label: t("event.field.attributes"), format: "mono" },
        ],
      }}
    />
  );
}
