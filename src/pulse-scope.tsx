"use client";

import * as React from "react";
import { apiFetch } from "@neton/application-front-runtime/client";
import { useQuery } from "@neton/application-front-runtime/client-context";
import { Select } from "@neton/application-front-kit";

interface AppRow { id: number; name: string; platform: string; appKey: string }
interface Page<T> { list: T[]; total: number }

export interface PulseScope {
  projectId: string;
  days: "1" | "7" | "30";
}

const STORAGE_KEY = "neton:pulse:scope";
const DEFAULT_SCOPE: PulseScope = { projectId: "", days: "7" };

function readInitialScope(): PulseScope {
  if (typeof window === "undefined") return DEFAULT_SCOPE;
  const params = new URLSearchParams(window.location.search);
  let saved: Partial<PulseScope> = {};
  try { saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { /* ignore invalid old state */ }
  const days = params.get("days") ?? saved.days;
  return {
    projectId: params.get("projectId") ?? saved.projectId ?? "",
    days: days === "1" || days === "30" ? days : "7",
  };
}

/** Shared Pulse scope. URL parameters make a page shareable; localStorage carries it to other pages. */
export function usePulseScope() {
  const [scope, setScope] = React.useState<PulseScope>(DEFAULT_SCOPE);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setScope(readInitialScope());
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scope));
    const url = new URL(window.location.href);
    if (scope.projectId) url.searchParams.set("projectId", scope.projectId);
    else url.searchParams.delete("projectId");
    url.searchParams.set("days", scope.days);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [scope, ready]);

  return { scope, setScope };
}

export function pulseScopeParams(scope: PulseScope): string {
  const params = new URLSearchParams({ days: scope.days });
  if (scope.projectId) params.set("projectId", scope.projectId);
  return params.toString();
}

export function PulseScopeSelector({
  scope,
  onChange,
  showDays = true,
}: {
  scope: PulseScope;
  onChange: (scope: PulseScope) => void;
  showDays?: boolean;
}) {
  const apps = useQuery({
    queryKey: ["pulse-scope-apps"],
    queryFn: () => apiFetch<Page<AppRow>>("/admin/pulse/app/page?pageSize=200"),
  });

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
        应用
        <Select value={scope.projectId} onChange={(e) => onChange({ ...scope, projectId: e.target.value })}>
          <option value="">全部应用</option>
          {(apps.data?.list ?? []).map((app) => (
            <option key={app.id} value={app.appKey}>{app.name} · {app.platform}</option>
          ))}
        </Select>
      </label>
      {showDays && (
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          时间范围
          <Select value={scope.days} onChange={(e) => onChange({ ...scope, days: e.target.value as PulseScope["days"] })}>
            <option value="1">今天</option>
            <option value="7">近 7 天</option>
            <option value="30">近 30 天</option>
          </Select>
        </label>
      )}
    </div>
  );
}
