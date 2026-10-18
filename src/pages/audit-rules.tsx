"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { useT } from "@neton/application-front-runtime/i18n";

/**
 * 审计规则维护。与告警分开：规则是偶尔的策略调整，告警是日常处置，
 * 两者由不同的人在不同频率上使用，权限也不同（save vs triage）。
 */
export default function Page() {
  const t = useT("pulse");
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-audit-rule",
        errorNamespace: "pulse",
        eyebrow: t("common.eyebrow"),
        title: t("auditRule.title"),
        description: t("auditRule.description"),
        endpoint: "/pulse/audit/rule",
        listPath: "page",
        permissions: {
          page: "pulse:audit:list",
          create: "pulse:audit:save",
          update: "pulse:audit:save",
          delete: "pulse:audit:save",
        },
        fields: [
          { key: "pattern", label: t("auditRule.field.pattern"), required: true, placeholder: t("auditRule.placeholder.pattern"), format: "mono" },
          { key: "label", label: t("common.field.name"), placeholder: t("auditRule.placeholder.label") },
          {
            key: "severity", label: t("auditRule.field.severity"), type: "select", required: true, defaultValue: "info",
            options: [
              { label: t("auditRule.severity.info"), value: "info" },
              { label: t("auditRule.severity.warn"), value: "warn" },
              { label: t("auditRule.severity.critical"), value: "critical" },
            ],
          },
          { key: "appId", label: t("auditRule.field.appId"), type: "number", placeholder: t("auditRule.placeholder.appId") },
          { key: "note", label: t("common.field.remark"), type: "textarea", placeholder: t("auditRule.placeholder.note") },
          { key: "status", label: t("common.field.status"), type: "select", format: "status", defaultValue: 1,
            options: [{ label: t("common.status.enabled"), value: 1 }, { label: t("common.status.disabled"), value: 0 }] },
        ],
        mapSave: (record) => ({
          ...record,
          appId: Number(record.appId ?? 0) || null,
          status: Number(record.status ?? 1),
        }),
      }}
    />
  );
}
