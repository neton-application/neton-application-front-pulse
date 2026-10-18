"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useQueryClient } from "@neton/application-front-runtime/client-context";
import { ResourcePage } from "@neton/application-front-resource";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@neton/application-front-kit";
import { useDescribeError } from "@neton/application-front-runtime/errors";
import { useFormat, useT, type Translate } from "@neton/application-front-runtime/i18n";

interface SigningCertificate {
  sha256: string; commonName: string | null; organization: string | null; organizationalUnit: string | null;
}
interface RuntimeEvidence {
  category: string; name: string; moduleName: string | null; callerSymbol: string | null;
  callsiteOffset: number | null; resolvedCallerSymbol: string | null; stackFingerprint: string | null;
  callPath: string | null; resolvedCallPath: string | null; detail: string | null;
  occurrences: number; devices: number; firstSeenAt: number; lastSeenAt: number;
}
interface ArtifactImage {
  relativePath: string; architecture: string; imageUuid: string | null; textSha256: string; textSize: number;
  hasSwiftMetadata: boolean; swiftSymbolCount: number; cppSymbolCount: number; cSymbolCount: number;
  importedSymbolCount: number; symbolsTruncated: boolean; swiftSymbols: string[]; cppSymbols: string[];
  cSymbols: string[]; importedSymbols: string[]; linkedLibraries: string[]; signatureStatus: string;
  signingCertificates: SigningCertificate[];
  debugSymbolCount: number; debugSymbolsTruncated: boolean; debugSymbolSample: string[];
  runtimeEvidence: RuntimeEvidence[];
}
interface ArtifactReport {
  id: number; versionId: number; fileName: string; fileSize: number; archiveSha256: string; format: string;
  imageCount: number; swiftSymbolCount: number; cppSymbolCount: number; cSymbolCount: number;
  importedSymbolCount: number; signedImageCount: number; createdAt: number; images: ArtifactImage[];
  runtimeBuildNumber: number | null; runtimeEvidenceCount: number; runtimeEvidenceTruncated: boolean;
}

/**
 * 某个应用的版本列表。appId 从查询串带入——版本永远属于一个应用，不存在跨应用的版本列表。
 *
 * 发布是独立操作、独立权限：改草稿无害，发布会立刻改变线上所有客户端启动时得到的答复，
 * 而发布一个强制更新的版本等于把用户挡在应用之外。这两件事不该是同一个权限。
 */
export default function Page() {
  const t = useT("pulse");
  const describeError = useDescribeError("pulse");
  const queryClient = useQueryClient();
  const [appId, setAppId] = React.useState<string>("");
  const [appName, setAppName] = React.useState<string>("");
  const [selectedVersion, setSelectedVersion] = React.useState<{ id: number; name: string } | null>(null);
  const [artifact, setArtifact] = React.useState<File | null>(null);
  const [report, setReport] = React.useState<ArtifactReport | null>(null);
  const [artifactBusy, setArtifactBusy] = React.useState(false);
  const [artifactError, setArtifactError] = React.useState<string | null>(null);

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

  const openArtifact = React.useCallback(async (id: number, name: string) => {
    setSelectedVersion({ id, name });
    setArtifact(null);
    setArtifactError(null);
    try {
      setReport(await apiFetch<ArtifactReport | null>(`/admin/pulse/artifact/get?versionId=${id}`));
    } catch (error) {
      setReport(null);
      setArtifactError(describeError(error));
    }
  }, [describeError]);

  const analyzeArtifact = React.useCallback(async () => {
    if (!selectedVersion || !artifact) return;
    setArtifactBusy(true);
    setArtifactError(null);
    try {
      const params = new URLSearchParams({ versionId: String(selectedVersion.id), fileName: artifact.name });
      setReport(await apiFetch<ArtifactReport>(`/admin/pulse/artifact/analyze?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: artifact,
      }));
    } catch (error) {
      setArtifactError(describeError(error));
    } finally {
      setArtifactBusy(false);
    }
  }, [artifact, selectedVersion, describeError]);

  if (!appId) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        {t("appVersion.missingAppId")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
    <ResourcePage
      config={{
        resourceKey: "pulse-app-version",
        errorNamespace: "pulse",
        eyebrow: t("common.eyebrow"),
        title: appName ? t("appVersion.titleWithApp", { appName }) : t("appVersion.title"),
        description: t("appVersion.description"),
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
          { key: "appId", label: t("scope.app"), filter: true, table: false, defaultValue: appId },
          { key: "versionName", label: t("appVersion.field.versionName"), required: true, placeholder: t("appVersion.placeholder.versionName") },
          {
            key: "buildNumber",
            label: t("common.field.buildNumber"),
            type: "number",
            required: true,
            placeholder: t("appVersion.placeholder.buildNumber"),
          },
          {
            key: "forceUpdate",
            label: t("appVersion.field.forceUpdate"),
            type: "select",
            defaultValue: 0,
            options: [
              { label: t("appVersion.forceUpdate.no"), value: 0 },
              { label: t("appVersion.forceUpdate.yes"), value: 1 },
            ],
          },
          { key: "published", label: t("common.field.status"), type: "select", format: "status", defaultValue: 0,
            options: [{ label: t("appVersion.published.yes"), value: 1 }, { label: t("appVersion.published.no"), value: 0 }] },
          { key: "downloadUrl", label: t("appVersion.field.downloadUrl"), placeholder: t("appVersion.placeholder.downloadUrl"), format: "mono" },
          { key: "releaseNotes", label: t("appVersion.field.releaseNotes"), type: "textarea", table: false },
          { key: "publishedAt", label: t("appVersion.field.publishedAt"), format: "date", editable: false },
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
              ? { label: t("appVersion.action.unpublish"), kind: "disable", onClick: () => void setPublished(record.id, false) }
              : { label: t("appVersion.action.publish"), kind: "enable", tone: "positive", onClick: () => void setPublished(record.id, true) },
            {
              label: t("appVersion.action.artifact"),
              kind: "upload",
              onClick: () => void openArtifact(Number(record.id), String(record.versionName ?? record.id)),
            },
          ],
        }),
      }}
    />
    {selectedVersion && (
      <Card>
        <CardHeader>
          <CardTitle>{t("artifact.title", { name: selectedVersion.name })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept=".ipa,.zip,application/zip"
                onChange={(event) => setArtifact(event.target.files?.[0] ?? null)}
                className="max-w-full text-sm file:mr-3 file:rounded-md file:border file:border-[var(--border)] file:bg-transparent file:px-3 file:py-2"
              />
              <Button disabled={!artifact || artifactBusy} onClick={() => void analyzeArtifact()}>
                {artifactBusy ? t("artifact.analyzing") : t("artifact.analyze")}
              </Button>
              <Button variant="outline" onClick={() => setSelectedVersion(null)}>{t("common.action.close")}</Button>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              {t("artifact.hint")}
            </p>
            {artifactError && <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{artifactError}</div>}
            {report ? <ArtifactReportView report={report} /> : (
              <div className="rounded-md border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted-foreground)]">
                {t("artifact.noReport")}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )}
    </div>
  );
}

function ArtifactReportView({ report }: { report: ArtifactReport }) {
  const t = useT("pulse");
  const fmt = useFormat();
  const metrics = [
    ["Mach-O", report.imageCount], [t("artifact.metric.signedImages"), report.signedImageCount],
    [t("artifact.metric.swiftSymbols"), report.swiftSymbolCount], [t("artifact.metric.cppSymbols"), report.cppSymbolCount],
    [t("artifact.metric.cSymbols"), report.cSymbolCount], [t("artifact.metric.importedSymbols"), report.importedSymbolCount],
    [t("artifact.metric.runtimeEvidence"), report.runtimeEvidenceCount],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {metrics.map(([label, value]) => <div key={label} className="rounded-md border border-[var(--border)] p-3">
          <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
        </div>)}
      </div>
      <div className="rounded-md border border-[var(--border)] p-3 text-xs">
        <div><span className="text-[var(--muted-foreground)]">{t("artifact.label.file")}</span>{report.fileName} · {(report.fileSize / 1024 / 1024).toFixed(1)} MiB</div>
        <div className="break-all font-mono"><span className="font-sans text-[var(--muted-foreground)]">{t("artifact.label.archiveSha256")}</span>{report.archiveSha256}</div>
        <div><span className="text-[var(--muted-foreground)]">{t("artifact.label.analyzedAt")}</span>{fmt.dateTime(report.createdAt)}</div>
      </div>
      {report.runtimeEvidenceTruncated && <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
        {t("artifact.runtimeTruncated")}
      </div>}
      <div className="space-y-2">
        {report.images.map((image, index) => <details key={`${image.relativePath}-${image.architecture}-${index}`} className="rounded-md border border-[var(--border)] p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {image.relativePath} · {image.architecture} · {signatureLabel(t, image.signatureStatus)}
          </summary>
          <div className="mt-3 grid gap-2 text-xs">
            <div className="break-all"><span className="text-[var(--muted-foreground)]">{t("artifact.label.uuid")}</span>{image.imageUuid ?? t("artifact.none")}</div>
            <div className="break-all font-mono"><span className="font-sans text-[var(--muted-foreground)]">{t("artifact.label.textSha256")}</span>{image.textSha256}</div>
            <div>{t("artifact.image.symbolSummary", { metadata: image.hasSwiftMetadata ? t("artifact.present") : t("artifact.none"), swift: image.swiftSymbolCount, cpp: image.cppSymbolCount, c: image.cSymbolCount, imported: image.importedSymbolCount })}</div>
            <div>
              {image.debugSymbolCount > 0 ? t("artifact.image.dsymMatched", { count: image.debugSymbolCount }) : t("artifact.image.dsymMissing")}
              {image.debugSymbolsTruncated ? t("artifact.image.dsymTruncated") : ""}
            </div>
            <EvidenceList title={t("artifact.list.certificates")} values={image.signingCertificates.map((cert) => `${cert.commonName ?? t("artifact.unknownSubject")} · ${cert.organizationalUnit ?? cert.organization ?? "-"} · ${cert.sha256}`)} />
            <RuntimeEvidenceView image={image} buildNumber={report.runtimeBuildNumber} />
            <EvidenceList title={t("artifact.list.linkedLibraries")} values={image.linkedLibraries} />
            <EvidenceList title={t("artifact.metric.importedSymbols")} values={image.importedSymbols} />
            <EvidenceList title={t("artifact.metric.swiftSymbols")} values={image.swiftSymbols} />
            <EvidenceList title={t("artifact.metric.cppSymbols")} values={image.cppSymbols} />
            <EvidenceList title={t("artifact.metric.cSymbols")} values={image.cSymbols} />
            <EvidenceList title={t("artifact.list.debugSymbolSample")} values={image.debugSymbolSample} />
            {image.symbolsTruncated && <div className="text-amber-600">{t("artifact.image.symbolsTruncated")}</div>}
          </div>
        </details>)}
      </div>
    </div>
  );
}

function RuntimeEvidenceView({ image, buildNumber }: { image: ArtifactImage; buildNumber: number | null }) {
  const t = useT("pulse");
  if (!image.imageUuid) {
    return <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-amber-700">{t("artifact.runtime.noUuid")}</div>;
  }
  if (image.runtimeEvidence.length === 0) {
    return <div className="rounded border border-[var(--border)] p-2 text-[var(--muted-foreground)]">
      {t("artifact.runtime.empty", { build: buildNumber ?? "—" })}
    </div>;
  }
  const networks = image.runtimeEvidence.filter((item) => item.category === "network");
  const behaviors = image.runtimeEvidence.filter((item) => ["api", "permission", "method"].includes(item.category));
  return <div className="space-y-2 rounded border border-blue-500/30 bg-blue-500/5 p-3">
    <div className="font-medium text-blue-700 dark:text-blue-300">
      {t("artifact.runtime.matched", { build: buildNumber ?? "—", count: image.runtimeEvidence.length })}
    </div>
    <EvidenceList title={t("artifact.runtime.behaviors")} values={behaviors.map((item) => runtimeEvidenceLabel(t, item))} />
    <EvidenceList title={t("artifact.runtime.networks")} values={networks.map((item) => runtimeEvidenceLabel(t, item))} />
  </div>;
}

function runtimeEvidenceLabel(t: Translate, item: RuntimeEvidence): string {
  const action = item.detail ? `${item.name} · ${item.detail}` : item.name;
  const caller = item.resolvedCallerSymbol ?? item.callerSymbol;
  const path = item.resolvedCallPath ?? item.callPath;
  return [
    action,
    caller ? t("artifact.runtime.caller", { caller }) : item.callsiteOffset != null ? t("artifact.runtime.callerOffset", { offset: `+0x${item.callsiteOffset.toString(16)}` }) : null,
    path ? t("artifact.runtime.path", { path }) : null,
    t("artifact.runtime.counts", { occurrences: item.occurrences, devices: item.devices }),
  ].filter(Boolean).join(" · ");
}

function EvidenceList({ title, values }: { title: string; values: string[] }) {
  const t = useT("pulse");
  if (values.length === 0) return null;
  return <details><summary className="cursor-pointer text-[var(--muted-foreground)]">{t("artifact.list.withCount", { title, count: values.length })}</summary>
    <div className="mt-1 max-h-48 overflow-auto rounded bg-black/5 p-2 font-mono dark:bg-white/5">
      {values.map((value, index) => <div key={`${value}-${index}`} className="break-all">{value}</div>)}
    </div>
  </details>;
}

const SIGNATURE_STATUSES = new Set(["signed", "adhoc", "unsigned", "invalid"]);

function signatureLabel(t: Translate, status: string): string {
  return SIGNATURE_STATUSES.has(status) ? t(`artifact.signature.${status}`) : status;
}
