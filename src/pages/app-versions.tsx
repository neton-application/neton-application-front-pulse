"use client";

import * as React from "react";
import { apiWrite } from "@neton/application-front-runtime/client";
import { useQueryClient } from "@neton/application-front-runtime/client-context";
import { ResourcePage } from "@neton/application-front-resource";

/**
 * 某个应用的版本列表。appId 从查询串带入——版本永远属于一个应用，不存在跨应用的版本列表。
 *
 * 发布是独立操作、独立权限：改草稿无害，发布会立刻改变线上所有客户端启动时得到的答复，
 * 而发布一个强制更新的版本等于把用户挡在应用之外。这两件事不该是同一个权限。
 */
export default function Page() {
  const queryClient = useQueryClient();
  const [appId, setAppId] = React.useState<string>("");
  const [appName, setAppName] = React.useState<string>("");

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAppId(params.get("appId") ?? "");
    setAppName(params.get("appName") ?? "");
  }, []);

  const setPublished = React.useCallback(
    async (id: number, published: boolean) => {
      await apiWrite<void>("/admin/pulse/app-version/publish", "PUT", { id, published });
      await queryClient.invalidateQueries({ queryKey: ["pulse-app-version"] });
    },
    [queryClient],
  );

  if (!appId) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        缺少 appId。请从「应用管理」页面进入某个应用的版本列表。
      </div>
    );
  }

  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-app-version",
        eyebrow: "PULSE",
        title: appName ? `版本管理 · ${appName}` : "版本管理",
        description:
          "客户端用构建号比较，不用版本名——版本名只用于展示。只有已发布的版本会参与更新检查。",
        endpoint: "/pulse/app-version",
        listPath: "page",
        initialFilters: { appId },
        permissions: {
          page: "pulse:app:list",
          create: "pulse:app:save",
          update: "pulse:app:save",
          delete: "pulse:app:delete",
        },
        fields: [
          // 隐藏字段：带上 appId，既作为列表筛选，也随新建一起提交。
          { key: "appId", label: "应用", filter: true, table: false, defaultValue: appId },
          { key: "versionName", label: "版本名", required: true, placeholder: "如：1.4.2" },
          {
            key: "buildNumber",
            label: "构建号",
            type: "number",
            required: true,
            placeholder: "单调递增，iOS 取 CFBundleVersion，Android 取 versionCode",
          },
          {
            key: "forceUpdate",
            label: "强制更新",
            type: "select",
            defaultValue: 0,
            options: [
              { label: "否（仅提示）", value: 0 },
              { label: "是（不更新无法使用）", value: 1 },
            ],
          },
          { key: "published", label: "状态", type: "select", format: "status", defaultValue: 0,
            options: [{ label: "已发布", value: 1 }, { label: "草稿", value: 0 }] },
          { key: "downloadUrl", label: "下载地址", placeholder: "App Store / 应用市场 / 直链", format: "mono" },
          { key: "releaseNotes", label: "更新说明", type: "textarea", table: false },
          { key: "publishedAt", label: "发布时间", format: "date", editable: false },
        ],
        // forceUpdate 在表单里是 0/1 的下拉，落库是布尔；appId 从查询串来，必须是数字。
        mapSave: (record) => ({
          ...record,
          appId: Number(record.appId ?? appId),
          buildNumber: Number(record.buildNumber ?? 0),
          forceUpdate: Number(record.forceUpdate ?? 0) === 1,
          published: Number(record.published ?? 0),
        }),
        rowActions: (record) => ({
          primary: [
            Number(record.published) === 1
              ? { label: "下架", kind: "disable", onClick: () => void setPublished(record.id, false) }
              : { label: "发布", kind: "enable", tone: "positive", onClick: () => void setPublished(record.id, true) },
          ],
        }),
      }}
    />
  );
}
