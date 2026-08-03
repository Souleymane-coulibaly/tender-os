"use client";

import { useState } from "react";
import { previewExportAction, type PreviewExportSectionInput } from "../../../../export-actions";
import {
  EXPORT_CAPABILITY_BLOCKER_LABELS,
  EXPORT_DOCUMENT_TYPE_LABELS,
  EXPORT_JOB_STATUS_LABELS,
  EXPORT_SECTION_SOURCES,
  EXPORT_SECTION_SOURCE_LABELS,
  canManageExport,
  exportJobStatusBadgeClass,
  type ExportCapabilities,
  type ExportJobSummary,
  type ExportTemplateSummary,
} from "../../../../../../lib/export-types";

type TemplateSectionConfig = { id: string; label: string; mandatory: boolean; order: number };

type SectionFormRow = {
  sectionId: string;
  label: string;
  mandatory: boolean;
  sourceType: string;
  generationId: string;
  pricingEstimateId: string;
  pricingEstimateVersionNumber: string;
  manualContent: string;
};

function readTemplateSections(template: ExportTemplateSummary | undefined): TemplateSectionConfig[] {
  const config = template?.activeVersion?.config as { sections?: TemplateSectionConfig[] } | undefined;
  return [...(config?.sections ?? [])].sort((a, b) => a.order - b.order);
}

export function ExportSection({
  tenderId,
  templates,
  history,
  actorRole,
  capabilities,
}: {
  tenderId: string;
  templates: ExportTemplateSummary[];
  history: ExportJobSummary[];
  actorRole: string | undefined;
  capabilities: ExportCapabilities;
}) {
  const activatableTemplates = templates.filter((t) => t.activeVersion);
  const canManage = canManageExport(actorRole);

  const [templateId, setTemplateId] = useState(activatableTemplates[0]?.id ?? "");
  const selectedTemplate = activatableTemplates.find((t) => t.id === templateId);
  const [rows, setRows] = useState<SectionFormRow[]>(() =>
    readTemplateSections(selectedTemplate).map((s) => ({ sectionId: s.id, label: s.label, mandatory: s.mandatory, sourceType: "MANUAL", generationId: "", pricingEstimateId: "", pricingEstimateVersionNumber: "", manualContent: "" })),
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [lastJob, setLastJob] = useState<ExportJobSummary | undefined>();

  function handleTemplateChange(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    const next = activatableTemplates.find((t) => t.id === nextTemplateId);
    setRows(readTemplateSections(next).map((s) => ({ sectionId: s.id, label: s.label, mandatory: s.mandatory, sourceType: "MANUAL", generationId: "", pricingEstimateId: "", pricingEstimateVersionNumber: "", manualContent: "" })));
  }

  function updateRow(sectionId: string, patch: Partial<SectionFormRow>) {
    setRows((current) => current.map((row) => (row.sectionId === sectionId ? { ...row, ...patch } : row)));
  }

  async function handlePreview() {
    if (!templateId) return;
    setIsPending(true);
    setError(undefined);
    const sections: PreviewExportSectionInput[] = rows.map((row) => ({
      sectionId: row.sectionId,
      sourceType: row.sourceType,
      ...(row.sourceType === "GENERATION" && row.generationId ? { generationId: row.generationId } : {}),
      ...(row.sourceType === "PRICING" && row.pricingEstimateId ? { pricingEstimateId: row.pricingEstimateId } : {}),
      ...(row.sourceType === "PRICING" && row.pricingEstimateVersionNumber ? { pricingEstimateVersionNumber: Number(row.pricingEstimateVersionNumber) } : {}),
      ...(row.sourceType === "MANUAL" ? { manualContent: row.manualContent } : {}),
    }));
    const result = await previewExportAction(tenderId, templateId, sections);
    setIsPending(false);
    if (result.error) setError(result.error);
    else setLastJob(result.job);
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Nouvel aperçu</h2>
          {!capabilities.canExport ? (
            <div className="flex flex-col gap-1">
              {capabilities.blockers.map((blocker) => (
                <p key={blocker.code} role="alert" className="text-sm text-amber-700">
                  {EXPORT_CAPABILITY_BLOCKER_LABELS[blocker.code] ?? "L'export n'est pas encore disponible pour cette organisation."}
                </p>
              ))}
            </div>
          ) : activatableTemplates.length === 0 ? (
            <p className="text-sm text-amber-700">Aucun template avec une version active. Un administrateur doit d&apos;abord en activer un.</p>
          ) : (
            <>
              <label htmlFor="template" className="text-sm font-medium text-neutral-700">
                Template
              </label>
              <select id="template" value={templateId} onChange={(e) => handleTemplateChange(e.target.value)} className="max-w-md rounded border border-neutral-300 px-3 py-2 text-sm">
                {activatableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({EXPORT_DOCUMENT_TYPE_LABELS[t.documentType] ?? t.documentType})
                  </option>
                ))}
              </select>

              {rows.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {rows.map((row) => (
                    <div key={row.sectionId} className="rounded border border-neutral-200 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-900">{row.label}</span>
                        {row.mandatory ? <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-700">Obligatoire</span> : null}
                      </div>
                      <select
                        value={row.sourceType}
                        onChange={(e) => updateRow(row.sectionId, { sourceType: e.target.value })}
                        className="mb-2 rounded border border-neutral-300 px-3 py-2 text-sm"
                      >
                        {EXPORT_SECTION_SOURCES.map((source) => (
                          <option key={source} value={source}>
                            {EXPORT_SECTION_SOURCE_LABELS[source] ?? source}
                          </option>
                        ))}
                      </select>
                      {row.sourceType === "GENERATION" ? (
                        <input
                          placeholder="ID de la génération"
                          value={row.generationId}
                          onChange={(e) => updateRow(row.sectionId, { generationId: e.target.value })}
                          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                        />
                      ) : null}
                      {row.sourceType === "PRICING" ? (
                        <div className="flex gap-2">
                          <input
                            placeholder="ID de l'estimation"
                            value={row.pricingEstimateId}
                            onChange={(e) => updateRow(row.sectionId, { pricingEstimateId: e.target.value })}
                            className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
                          />
                          <input
                            type="number"
                            min="1"
                            placeholder="N° de version (vide = courante)"
                            value={row.pricingEstimateVersionNumber}
                            onChange={(e) => updateRow(row.sectionId, { pricingEstimateVersionNumber: e.target.value })}
                            className="w-48 rounded border border-neutral-300 px-3 py-2 text-sm"
                          />
                        </div>
                      ) : null}
                      {row.sourceType === "MANUAL" ? (
                        <textarea
                          placeholder="Contenu de la section"
                          value={row.manualContent}
                          onChange={(e) => updateRow(row.sectionId, { manualContent: e.target.value })}
                          rows={3}
                          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <button type="button" disabled={isPending || rows.length === 0} onClick={handlePreview} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {isPending ? "Génération..." : "Générer l'aperçu"}
              </button>
            </>
          )}

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          {lastJob ? (
            <div className="flex items-center gap-3 rounded border border-neutral-200 bg-neutral-50 p-3">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${exportJobStatusBadgeClass(lastJob.status)}`}>{EXPORT_JOB_STATUS_LABELS[lastJob.status] ?? lastJob.status}</span>
              <span className="text-sm text-neutral-700">v{lastJob.version}</span>
              {lastJob.status === "COMPLETED" ? (
                <a href={`/app/tenders/${tenderId}/export/${lastJob.id}/download`} className="text-sm font-medium text-neutral-900 hover:underline">
                  Télécharger
                </a>
              ) : null}
              {lastJob.status === "FAILED" ? <span className="text-sm text-red-700">{lastJob.errorMessage}</span> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Historique</h2>
        {history.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun export pour l&apos;instant.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Mode</th>
                <th className="py-2 pr-4">Version</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {history.map((job) => (
                <tr key={job.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 text-neutral-700">{EXPORT_DOCUMENT_TYPE_LABELS[job.documentType] ?? job.documentType}</td>
                  <td className="py-2 pr-4 text-neutral-600">{job.mode === "FINAL" ? "Final" : "Aperçu"}</td>
                  <td className="py-2 pr-4 text-neutral-600">v{job.version}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${exportJobStatusBadgeClass(job.status)}`}>{EXPORT_JOB_STATUS_LABELS[job.status] ?? job.status}</span>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{new Date(job.createdAt).toLocaleString("fr-FR")}</td>
                  <td className="py-2 pr-4">
                    {job.status === "COMPLETED" ? (
                      <a href={`/app/tenders/${tenderId}/export/${job.id}/download`} className="text-neutral-900 hover:underline">
                        Télécharger
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
