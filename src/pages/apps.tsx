"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";
import { useT } from "@neton/application-front-runtime/i18n";

/**
 * 应用管理。一个平台一条记录：同一产品的 iOS 与 Android 分开维护，
 * 因为两端的包名、审核节奏、强制更新策略本来就不同。
 *
 * 列表直接给出「线上版本」，因为运营最先要确认的就是当前用户拿到的是哪一版、
 * 以及它是不是强制更新——强制更新会直接挡住用户使用，不该藏在二级页面里。
 */
export default function Page() {
  const t = useT("pulse");
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-app",
        errorNamespace: "pulse",
        eyebrow: t("common.eyebrow"),
        title: t("app.title"),
        description: t("app.description"),
        endpoint: "/pulse/app",
        listPath: "page",
        permissions: {
          page: "pulse:app:list",
          create: "pulse:app:save",
          update: "pulse:app:save",
          delete: "pulse:app:delete",
        },
        fields: [
          { key: "name", label: t("app.field.name"), required: true, placeholder: t("app.placeholder.name"), filter: false },
          {
            key: "platform",
            label: t("app.field.platform"),
            type: "select",
            required: true,
            defaultValue: "ios",
            options: [
              { label: "iOS", value: "ios" },
              { label: "Android", value: "android" },
              { label: t("app.platform.harmony"), value: "harmony" },
              { label: "Web", value: "web" },
            ],
          },
          {
            key: "appKey",
            label: "App ID",
            editable: false,
            placeholder: t("app.placeholder.appKey"),
            format: "mono",
          },
          {
            key: "packageName",
            label: t("app.field.packageName"),
            placeholder: t("app.placeholder.packageName"),
            format: "mono",
          },
          {
            key: "packagePolicy",
            label: t("app.field.packagePolicy"),
            type: "select",
            required: true,
            defaultValue: "strict",
            options: [
              { label: t("app.packagePolicy.strict"), value: "strict" },
              { label: t("app.packagePolicy.allowlist"), value: "allowlist" },
              { label: t("app.packagePolicy.any"), value: "any" },
            ],
          },
          {
            key: "allowedPackages",
            label: t("app.field.allowedPackages"),
            type: "textarea",
            placeholder: t("app.placeholder.allowedPackages"),
            table: false,
          },
          {
            // 采集策略下发给客户端，客户端据此在写入缓冲前丢弃——关掉一类数据省的是设备上的
            // 内存、电量和流量，不只是服务端存储。预设而不是自由勾选：真实的选择只有这几种，
            // 而一个能勾出「只收崩溃、不收会话」的界面只会产出无法解释的报表。
            key: "collectKinds",
            label: t("app.field.collectKinds"),
            type: "select",
            defaultValue: "",
            options: [
              { label: t("app.collectKinds.all"), value: "" },
              { label: t("app.collectKinds.noRuntime"), value: "Analytics,Crash,Error,Performance,Log,Breadcrumb" },
              { label: t("app.collectKinds.quality"), value: "Crash,Error,Performance" },
              { label: t("app.collectKinds.analytics"), value: "Analytics" },
            ],
          },
          { key: "liveVersion", label: t("app.field.liveVersion"), editable: false },
          { key: "liveBuild", label: t("app.field.liveBuild"), editable: false },
          { key: "versionCount", label: t("app.field.versionCount"), editable: false },
          { key: "status", label: t("common.field.status"), type: "select", format: "status", defaultValue: 1,
            options: [{ label: t("common.status.enabled"), value: 1 }, { label: t("common.status.disabled"), value: 0 }] },
          { key: "remark", label: t("common.field.remark"), type: "textarea", table: false },
          { key: "createdAt", label: t("common.field.createdAt"), format: "date", editable: false },
        ],
        // 版本是应用的子资源，从这里进入；不做成弹窗，因为版本列表本身还要发布/下架操作。
        rowActions: (record) => ({
          primary: [
            {
              label: t("app.action.versions"),
              kind: "list",
              href: `/pulse/app-versions?appId=${record.id}&appName=${encodeURIComponent(String(record.name ?? ""))}`,
            },
          ],
        }),
      }}
    />
  );
}
