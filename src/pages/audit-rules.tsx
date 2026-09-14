"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";

/**
 * 审计规则维护。与告警分开：规则是偶尔的策略调整，告警是日常处置，
 * 两者由不同的人在不同频率上使用，权限也不同（save vs triage）。
 */
export default function Page() {
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-audit-rule",
        eyebrow: "PULSE",
        title: "审计规则",
        description:
          "规则是「模式 + 分级」，不是黑名单。模式支持前后缀 * 通配，不区分大小写；同一模块命中多条时，应用级规则优先于全局，其次取更严重、更具体的一条。",
        endpoint: "/pulse/audit/rule",
        listPath: "page",
        permissions: {
          page: "pulse:audit:list",
          create: "pulse:audit:save",
          update: "pulse:audit:save",
          delete: "pulse:audit:save",
        },
        fields: [
          { key: "pattern", label: "匹配模式", required: true, placeholder: "如 SDWebImage、*Ads*、WeChat*", format: "mono" },
          { key: "label", label: "名称", placeholder: "如：广告 SDK" },
          {
            key: "severity", label: "级别", type: "select", required: true, defaultValue: "info",
            options: [
              { label: "记录（info）", value: "info" },
              { label: "关注（warn）", value: "warn" },
              { label: "严重（critical）", value: "critical" },
            ],
          },
          { key: "appId", label: "限定应用 ID", type: "number", placeholder: "留空表示全局规则" },
          { key: "note", label: "备注", type: "textarea", placeholder: "为什么值得关注：合规、隐私、体积、已知漏洞……" },
          { key: "status", label: "状态", type: "select", format: "status", defaultValue: 1,
            options: [{ label: "启用", value: 1 }, { label: "停用", value: 0 }] },
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
