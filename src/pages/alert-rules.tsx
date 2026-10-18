"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { useT } from "@neton/application-front-runtime/i18n";

/**
 * 告警规则维护。
 *
 * 阈值的含义随类型变化：无崩溃率是百分比下限，影响面是设备台数下限。
 * 最小样本量和冷却期是两个防误报机制，不该被当成可有可无的高级选项——
 * 没有它们，告警会在每次发版时先刷一串假警报，然后人就不看了。
 */
export default function Page() {
  const t = useT("pulse");
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-alert-rule",
        errorNamespace: "pulse",
        eyebrow: t("common.eyebrow"),
        title: t("alertRule.title"),
        description: t("alertRule.description"),
        endpoint: "/pulse/alert/rule",
        listPath: "page",
        permissions: {
          page: "pulse:alert:list",
          create: "pulse:alert:save",
          update: "pulse:alert:save",
          delete: "pulse:alert:save",
        },
        fields: [
          { key: "name", label: t("alertRule.field.name"), required: true, placeholder: t("alertRule.placeholder.name") },
          {
            key: "type", label: t("common.field.type"), type: "select", required: true, defaultValue: "crash_free_rate",
            options: [
              { label: t("alertRule.type.crash_free_rate"), value: "crash_free_rate" },
              { label: t("alertRule.type.new_issue_impact"), value: "new_issue_impact" },
            ],
          },
          {
            key: "threshold", label: t("alertRule.field.threshold"), type: "number", required: true, defaultValue: 99,
            placeholder: t("alertRule.placeholder.threshold"),
          },
          {
            key: "minDevices", label: t("alertRule.field.minDevices"), type: "number", defaultValue: 10,
            placeholder: t("alertRule.placeholder.minDevices"),
          },
          {
            key: "cooldownMs", label: t("alertRule.field.cooldownMs"), type: "number", defaultValue: 3600000,
            placeholder: t("alertRule.placeholder.cooldownMs"),
          },
          { key: "projectId", label: t("alertRule.field.projectId"), placeholder: t("alertRule.placeholder.projectId"), format: "mono" },
          { key: "webhookUrl", label: t("alertRule.field.webhookUrl"), placeholder: t("alertRule.placeholder.webhookUrl"), format: "mono" },
          { key: "status", label: t("common.field.status"), type: "select", format: "status", defaultValue: 1,
            options: [{ label: t("common.status.enabled"), value: 1 }, { label: t("common.status.disabled"), value: 0 }] },
        ],
        mapSave: (record) => ({
          ...record,
          threshold: Number(record.threshold ?? 0),
          minDevices: Number(record.minDevices ?? 10),
          cooldownMs: Number(record.cooldownMs ?? 3600000),
          status: Number(record.status ?? 1),
        }),
      }}
    />
  );
}
