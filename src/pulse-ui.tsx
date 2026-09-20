"use client";

import * as React from "react";

export interface StatCard {
  label: string;
  value: number | undefined;
  /** 一行说明这张卡片算的是什么——没有它,数字只是数字。 */
  note: string;
  tone?: "default" | "danger" | "warning" | "good";
  /** 给出后卡片可点击,用来把总览数字直接变成列表筛选。 */
  onClick?: () => void;
  active?: boolean;
}

const TONE: Record<string, string> = {
  default: "",
  danger: "text-red-600",
  warning: "text-amber-600",
  good: "text-emerald-600",
};

/**
 * 页面顶部的口径卡片。
 *
 * 每张卡片都带一句说明:后台最常见的问题不是数字不对,而是看的人不知道这个数字是怎么来的,
 * 于是既不敢用,也不敢质疑。
 */
export function StatCards({ cards, columns = 4 }: { cards: StatCard[]; columns?: number }) {
  const grid = columns >= 6 ? "sm:grid-cols-3 lg:grid-cols-6" : columns === 5 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <div className={`grid gap-3 ${grid}`}>
      {cards.map((card) => {
        const interactive = Boolean(card.onClick);
        return (
          <div
            key={card.label}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={card.onClick}
            onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.onClick?.(); } } : undefined}
            className={[
              "rounded-lg border p-4 transition-colors",
              card.active ? "border-[var(--foreground)] bg-[var(--muted)]" : "border-[var(--border)]",
              interactive ? "cursor-pointer hover:bg-[var(--muted)]" : "",
            ].join(" ")}
          >
            <div className="text-xs text-[var(--muted-foreground)]">{card.label}</div>
            <div className={`text-2xl font-semibold tabular-nums ${TONE[card.tone ?? "default"]}`}>
              {card.value === undefined ? "…" : card.value.toLocaleString("en-US")}
            </div>
            <div className="mt-1 text-[11px] leading-4 text-[var(--muted-foreground)]">{card.note}</div>
          </div>
        );
      })}
    </div>
  );
}

/** 相对时间。列表里「3 分钟前」比一串年月日时分秒更快判断新鲜度。 */
export function timeAgo(ms: number | null | undefined): string {
  if (!ms) return "-";
  const diff = Date.now() - ms;
  if (diff < 0) return new Date(ms).toLocaleString("zh-CN");
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(ms).toLocaleDateString("zh-CN");
}
