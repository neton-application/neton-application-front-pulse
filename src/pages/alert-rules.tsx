"use client";

import * as React from "react";
import { ResourcePage } from "@neton/application-front-resource";

/**
 * 告警规则维护。
 *
 * 阈值的含义随类型变化：无崩溃率是百分比下限，影响面是设备台数下限。
 * 最小样本量和冷却期是两个防误报机制，不该被当成可有可无的高级选项——
 * 没有它们，告警会在每次发版时先刷一串假警报，然后人就不看了。
 */
export default function Page() {
  return (
    <ResourcePage
      config={{
        resourceKey: "pulse-alert-rule",
        eyebrow: "PULSE",
        title: "告警规则",
        description: "规则每 5 分钟自动评估。阈值含义随类型变化；样本量与冷却期用于抑制误报。",
        endpoint: "/pulse/alert/rule",
        listPath: "page",
        permissions: {
          page: "pulse:alert:list",
          create: "pulse:alert:save",
          update: "pulse:alert:save",
          delete: "pulse:alert:save",
        },
        fields: [
          { key: "name", label: "规则名称", required: true, placeholder: "如：新版无崩溃率跌破 99%" },
          {
            key: "type", label: "类型", type: "select", required: true, defaultValue: "crash_free_rate",
            options: [
              { label: "无崩溃率跌破阈值", value: "crash_free_rate" },
              { label: "崩溃影响面超阈值", value: "new_issue_impact" },
            ],
          },
          {
            key: "threshold", label: "阈值", type: "number", required: true, defaultValue: 99,
            placeholder: "无崩溃率填百分比（如 99）；影响面填设备台数（如 10）",
          },
          {
            key: "minDevices", label: "最小样本量", type: "number", defaultValue: 10,
            placeholder: "覆盖设备少于此数不触发，避免新版刚放量时的假警报",
          },
          {
            key: "cooldownMs", label: "冷却（毫秒）", type: "number", defaultValue: 3600000,
            placeholder: "同一规则在此期间内不重复触发；默认 1 小时",
          },
          { key: "projectId", label: "限定应用标识", placeholder: "留空表示全部应用", format: "mono" },
          { key: "webhookUrl", label: "通知地址", placeholder: "POST JSON 到此地址；留空则只记录不通知", format: "mono" },
          { key: "status", label: "状态", type: "select", format: "status", defaultValue: 1,
            options: [{ label: "启用", value: 1 }, { label: "停用", value: 0 }] },
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
