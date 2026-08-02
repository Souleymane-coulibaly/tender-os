"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { activateExportTemplateVersionAction, createExportTemplateVersionAction } from "../../../../export-actions";
import { EXPORT_TEMPLATE_VERSION_STATUS_LABELS, exportTemplateVersionStatusBadgeClass, type ExportTemplateVersionSummary } from "../../../../../../lib/export-types";

export function ExportTemplateVersionManager({ templateId, activeVersion, defaultConfig }: { templateId: string; activeVersion?: ExportTemplateVersionSummary | undefined; defaultConfig: string }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [format, setFormat] = useState(activeVersion?.format ?? "DOCX");
  const [config, setConfig] = useState(defaultConfig);
  const [createdVersion, setCreatedVersion] = useState<ExportTemplateVersionSummary | undefined>();

  async function handleCreateVersion() {
    setIsPending(true);
    setError(undefined);
    const result = await createExportTemplateVersionAction(templateId, format, config);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setCreatedVersion(result.version);
      setIsCreating(false);
    }
  }

  async function handleActivate(versionId: string) {
    setIsPending(true);
    setError(undefined);
    const result = await activateExportTemplateVersionAction(templateId, versionId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setCreatedVersion(undefined);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {createdVersion ? (
        <div className="flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-900">Nouvelle version v{createdVersion.version} créée</span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${exportTemplateVersionStatusBadgeClass(createdVersion.status)}`}>
              {EXPORT_TEMPLATE_VERSION_STATUS_LABELS[createdVersion.status] ?? createdVersion.status}
            </span>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleActivate(createdVersion.id)}
            className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Activer cette version
          </button>
        </div>
      ) : null}

      {!isCreating ? (
        <button type="button" onClick={() => setIsCreating(true)} className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
          Créer une nouvelle version
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
          <label htmlFor="new-version-format" className="text-sm font-medium text-neutral-700">
            Format
          </label>
          <select id="new-version-format" value={format} onChange={(e) => setFormat(e.target.value)} className="rounded border border-neutral-300 px-3 py-2 text-sm">
            <option value="DOCX">DOCX</option>
            <option value="PDF">PDF</option>
          </select>
          <label htmlFor="new-version-config" className="text-sm font-medium text-neutral-700">
            Configuration (JSON)
          </label>
          <textarea id="new-version-config" value={config} onChange={(e) => setConfig(e.target.value)} rows={14} className="rounded border border-neutral-300 px-3 py-2 font-mono text-xs" />
          <div className="flex gap-2">
            <button type="button" disabled={isPending} onClick={handleCreateVersion} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {isPending ? "Création..." : "Créer la version"}
            </button>
            <button type="button" onClick={() => setIsCreating(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
              Annuler
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
