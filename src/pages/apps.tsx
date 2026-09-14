"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";

/**
 * 应用管理。一个平台一条记录：同一产品的 iOS 与 Android 分开维护，
 * 因为两端的包名、审核节奏、强制更新策略本来就不同。
 *
 * 列表直接给出「线上版本」，因为运营最先要确认的就是当前用户拿到的是哪一版、
 * 以及它是不是强制更新——强制更新会直接挡住用户使用，不该藏在二级页面里。
 */
export default function Page() {
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-app",
        eyebrow: "PULSE",
        title: "应用管理",
        description:
          "后台自动生成 App ID。默认校验登记包名，也可为内部重签包配置允许名单或放开包名。",
        endpoint: "/pulse/app",
        listPath: "page",
        permissions: {
          page: "pulse:app:list",
          create: "pulse:app:save",
          update: "pulse:app:save",
          delete: "pulse:app:delete",
        },
        fields: [
          { key: "name", label: "应用名称", required: true, placeholder: "如：积分商城 iOS", filter: false },
          {
            key: "platform",
            label: "平台",
            type: "select",
            required: true,
            defaultValue: "ios",
            options: [
              { label: "iOS", value: "ios" },
              { label: "Android", value: "android" },
              { label: "鸿蒙", value: "harmony" },
              { label: "Web", value: "web" },
            ],
          },
          {
            key: "appKey",
            label: "App ID",
            editable: false,
            placeholder: "创建后由后台自动生成，写入 PulseKit 配置",
            format: "mono",
          },
          {
            key: "packageName",
            label: "包名",
            placeholder: "iOS bundle id / Android applicationId；Web 可留空",
            format: "mono",
          },
          {
            key: "packagePolicy",
            label: "包名策略",
            type: "select",
            required: true,
            defaultValue: "strict",
            options: [
              { label: "严格匹配登记包名", value: "strict" },
              { label: "登记包名 + 允许名单", value: "allowlist" },
              { label: "允许任意包名", value: "any" },
            ],
          },
          {
            key: "allowedPackages",
            label: "额外允许包名",
            type: "textarea",
            placeholder: "仅允许名单策略使用，逗号或换行分隔",
            table: false,
          },
          { key: "liveVersion", label: "线上版本", editable: false },
          { key: "liveBuild", label: "线上构建号", editable: false },
          { key: "versionCount", label: "版本数", editable: false },
          { key: "status", label: "状态", type: "select", format: "status", defaultValue: 1,
            options: [{ label: "启用", value: 1 }, { label: "停用", value: 0 }] },
          { key: "remark", label: "备注", type: "textarea", table: false },
          { key: "createdAt", label: "创建时间", format: "date", editable: false },
        ],
        // 版本是应用的子资源，从这里进入；不做成弹窗，因为版本列表本身还要发布/下架操作。
        rowActions: (record) => ({
          primary: [
            {
              label: "版本管理",
              kind: "list",
              href: `/pulse/app-versions?appId=${record.id}&appName=${encodeURIComponent(String(record.name ?? ""))}`,
            },
          ],
        }),
      }}
    />
  );
}
