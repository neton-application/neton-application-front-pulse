"use client";

import * as React from "react";
import { apiFetch, apiWrite } from "@neton/application-front-runtime/client";
import { useQueryClient } from "@neton/application-front-runtime/client-context";
import { ResourcePage } from "@neton/application-front-resource";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@neton/application-front-kit";

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
  runtimeBuildNumber: number | null; runtimeEvidenceCount: number;
}

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
      setArtifactError(error instanceof Error ? error.message : "读取分析结果失败");
    }
  }, []);

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
      setArtifactError(error instanceof Error ? error.message : "制品分析失败");
    } finally {
      setArtifactBusy(false);
    }
  }, [artifact, selectedVersion]);

  if (!appId) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        缺少 appId。请从「应用管理」页面进入某个应用的版本列表。
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
            {
              label: "制品分析",
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
          <CardTitle>最终制品静态分析 · {selectedVersion.name}</CardTitle>
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
                {artifactBusy ? "正在分析…" : "上传并分析"}
              </Button>
              <Button variant="outline" onClick={() => setSelectedVersion(null)}>关闭</Button>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              上传最终签名的 IPA，或包含 dSYM 的压缩 XCArchive。服务端只解析文件，不执行其中代码；
              dSYM 仅在 LC_UUID 与架构都匹配时用于恢复 Release 内部函数名。
            </p>
            {artifactError && <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">{artifactError}</div>}
            {report ? <ArtifactReportView report={report} /> : (
              <div className="rounded-md border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted-foreground)]">
                这个版本还没有静态分析报告。
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
  const metrics = [
    ["Mach-O", report.imageCount], ["已签名镜像", report.signedImageCount],
    ["Swift 符号", report.swiftSymbolCount], ["C++ 符号", report.cppSymbolCount],
    ["C 符号", report.cSymbolCount], ["导入符号", report.importedSymbolCount],
    ["运行时证据", report.runtimeEvidenceCount],
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
        <div><span className="text-[var(--muted-foreground)]">文件：</span>{report.fileName} · {(report.fileSize / 1024 / 1024).toFixed(1)} MiB</div>
        <div className="break-all font-mono"><span className="font-sans text-[var(--muted-foreground)]">归档 SHA-256：</span>{report.archiveSha256}</div>
        <div><span className="text-[var(--muted-foreground)]">分析时间：</span>{new Date(report.createdAt).toLocaleString("zh-CN")}</div>
      </div>
      <div className="space-y-2">
        {report.images.map((image, index) => <details key={`${image.relativePath}-${image.architecture}-${index}`} className="rounded-md border border-[var(--border)] p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {image.relativePath} · {image.architecture} · {signatureLabel(image.signatureStatus)}
          </summary>
          <div className="mt-3 grid gap-2 text-xs">
            <div className="break-all"><span className="text-[var(--muted-foreground)]">UUID：</span>{image.imageUuid ?? "无"}</div>
            <div className="break-all font-mono"><span className="font-sans text-[var(--muted-foreground)]">__TEXT SHA-256：</span>{image.textSha256}</div>
            <div>Swift metadata：{image.hasSwiftMetadata ? "有" : "无"}；Swift {image.swiftSymbolCount} / C++ {image.cppSymbolCount} / C {image.cSymbolCount} / 导入 {image.importedSymbolCount}</div>
            <div>
              dSYM：{image.debugSymbolCount > 0 ? `LC_UUID 匹配，恢复 ${image.debugSymbolCount} 个内部符号` : "未匹配到对应 dSYM"}
              {image.debugSymbolsTruncated ? "（达到入库上限）" : ""}
            </div>
            <EvidenceList title="签名证书" values={image.signingCertificates.map((cert) => `${cert.commonName ?? "未知主体"} · ${cert.organizationalUnit ?? cert.organization ?? "-"} · ${cert.sha256}`)} />
            <RuntimeEvidenceView image={image} buildNumber={report.runtimeBuildNumber} />
            <EvidenceList title="依赖库" values={image.linkedLibraries} />
            <EvidenceList title="导入符号" values={image.importedSymbols} />
            <EvidenceList title="Swift 符号" values={image.swiftSymbols} />
            <EvidenceList title="C++ 符号" values={image.cppSymbols} />
            <EvidenceList title="C 符号" values={image.cSymbols} />
            <EvidenceList title="dSYM 内部符号样本" values={image.debugSymbolSample} />
            {image.symbolsTruncated && <div className="text-amber-600">符号很多，页面证据已截断；顶部计数仍是完整数量。</div>}
          </div>
        </details>)}
      </div>
    </div>
  );
}

function RuntimeEvidenceView({ image, buildNumber }: { image: ArtifactImage; buildNumber: number | null }) {
  if (!image.imageUuid) {
    return <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-amber-700">镜像没有 LC_UUID，不能与运行时证据可靠关联。</div>;
  }
  if (image.runtimeEvidence.length === 0) {
    return <div className="rounded border border-[var(--border)] p-2 text-[var(--muted-foreground)]">
      LC_UUID 已建立关联键；构建 {buildNumber ?? "—"} 暂无这个镜像的运行时证据。
    </div>;
  }
  const networks = image.runtimeEvidence.filter((item) => item.category === "network");
  const behaviors = image.runtimeEvidence.filter((item) => ["api", "permission", "method"].includes(item.category));
  return <div className="space-y-2 rounded border border-blue-500/30 bg-blue-500/5 p-3">
    <div className="font-medium text-blue-700 dark:text-blue-300">
      LC_UUID 精确关联 · 构建 {buildNumber ?? "—"} · {image.runtimeEvidence.length} 组运行时证据
    </div>
    <EvidenceList title="运行时调用 / 权限 / 内部方法" values={behaviors.map(runtimeEvidenceLabel)} />
    <EvidenceList title="运行时网络目的地" values={networks.map(runtimeEvidenceLabel)} />
  </div>;
}

function runtimeEvidenceLabel(item: RuntimeEvidence): string {
  const action = item.detail ? `${item.name} · ${item.detail}` : item.name;
  const caller = item.resolvedCallerSymbol ?? item.callerSymbol;
  const path = item.resolvedCallPath ?? item.callPath;
  return [
    action,
    caller ? `调用点 ${caller}` : item.callsiteOffset != null ? `调用点 +0x${item.callsiteOffset.toString(16)}（待 dSYM）` : null,
    path ? `路径 ${path}` : null,
    `${item.occurrences} 次 / ${item.devices} 台设备`,
  ].filter(Boolean).join(" · ");
}

function EvidenceList({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null;
  return <details><summary className="cursor-pointer text-[var(--muted-foreground)]">{title}（{values.length}）</summary>
    <div className="mt-1 max-h-48 overflow-auto rounded bg-black/5 p-2 font-mono dark:bg-white/5">
      {values.map((value, index) => <div key={`${value}-${index}`} className="break-all">{value}</div>)}
    </div>
  </details>;
}

function signatureLabel(status: string): string {
  return ({ signed: "证书签名", adhoc: "临时签名", unsigned: "未签名", invalid: "签名异常" } as Record<string, string>)[status] ?? status;
}
