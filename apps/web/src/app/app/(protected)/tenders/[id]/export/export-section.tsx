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
import { Button } from "../../../../../../components/ui/button";
import { Input } from "../../../../../../components/ui/input";
import { Select } from "../../../../../../components/ui/select";
import { Textarea } from "../../../../../../components/ui/textarea";
import {
  GENERATION_STATUS_LABELS,
  GENERATION_TASK_TYPE_LABELS,
  type GenerationSummary,
} from "../../../../../../lib/generation-types";
import {
  PRICING_STATUS_LABELS,
  type PricingEstimateSummary,
} from "../../../../../../lib/pricing-types";

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

function readTemplateSections(
  template: ExportTemplateSummary | undefined,
): TemplateSectionConfig[] {
  const config = template?.activeVersion?.config as
    { sections?: TemplateSectionConfig[] } | undefined;
  return [...(config?.sections ?? [])].sort((a, b) => a.order - b.order);
}

/** Libellé d'une génération proposée comme source : ce que l'utilisateur reconnaît (type de
 *  contenu, version, statut, date), jamais son identifiant technique. */
function generationOptionLabel(generation: GenerationSummary): string {
  const type = GENERATION_TASK_TYPE_LABELS[generation.taskType] ?? generation.taskType;
  const status = GENERATION_STATUS_LABELS[generation.status] ?? generation.status;
  return (
    type +
    " — v" +
    generation.version +
    " · " +
    status +
    " · " +
    new Date(generation.createdAt).toLocaleDateString("fr-FR")
  );
}

function estimateOptionLabel(estimate: PricingEstimateSummary): string {
  const status = PRICING_STATUS_LABELS[estimate.status] ?? estimate.status;
  return (
    "Estimation v" +
    estimate.currentVersionNumber +
    " · " +
    status +
    " · " +
    new Date(estimate.createdAt).toLocaleDateString("fr-FR")
  );
}

export function ExportSection({
  tenderId,
  templates,
  history,
  actorRole,
  capabilities,
  generations,
  estimates,
}: {
  tenderId: string;
  templates: ExportTemplateSummary[];
  history: ExportJobSummary[];
  actorRole: string | undefined;
  capabilities: ExportCapabilities;
  generations: GenerationSummary[];
  estimates: PricingEstimateSummary[];
}) {
  const activatableTemplates = templates.filter((t) => t.activeVersion);
  const canManage = canManageExport(actorRole);

  const [templateId, setTemplateId] = useState(activatableTemplates[0]?.id ?? "");
  const selectedTemplate = activatableTemplates.find((t) => t.id === templateId);
  const [rows, setRows] = useState<SectionFormRow[]>(() =>
    readTemplateSections(selectedTemplate).map((s) => ({
      sectionId: s.id,
      label: s.label,
      mandatory: s.mandatory,
      sourceType: "MANUAL",
      generationId: "",
      pricingEstimateId: "",
      pricingEstimateVersionNumber: "",
      manualContent: "",
    })),
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [lastJob, setLastJob] = useState<ExportJobSummary | undefined>();

  function handleTemplateChange(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    const next = activatableTemplates.find((t) => t.id === nextTemplateId);
    setRows(
      readTemplateSections(next).map((s) => ({
        sectionId: s.id,
        label: s.label,
        mandatory: s.mandatory,
        sourceType: "MANUAL",
        generationId: "",
        pricingEstimateId: "",
        pricingEstimateVersionNumber: "",
        manualContent: "",
      })),
    );
  }

  function updateRow(sectionId: string, patch: Partial<SectionFormRow>) {
    setRows((current) =>
      current.map((row) => (row.sectionId === sectionId ? { ...row, ...patch } : row)),
    );
  }

  async function handlePreview() {
    if (!templateId) return;
    setIsPending(true);
    setError(undefined);
    const sections: PreviewExportSectionInput[] = rows.map((row) => ({
      sectionId: row.sectionId,
      sourceType: row.sourceType,
      ...(row.sourceType === "GENERATION" && row.generationId
        ? { generationId: row.generationId }
        : {}),
      ...(row.sourceType === "PRICING" && row.pricingEstimateId
        ? { pricingEstimateId: row.pricingEstimateId }
        : {}),
      ...(row.sourceType === "PRICING" && row.pricingEstimateVersionNumber
        ? { pricingEstimateVersionNumber: Number(row.pricingEstimateVersionNumber) }
        : {}),
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
        <section className="flex flex-col gap-3 rounded border border-tenderos-navy/10 p-4">
          <h2 className="text-sm font-semibold text-tenderos-navy">Nouvel aperçu</h2>
          {!capabilities.canExport ? (
            <div className="flex flex-col gap-1">
              {capabilities.blockers.map((blocker) => (
                <p key={blocker.code} role="alert" className="text-sm text-warning-fg">
                  {EXPORT_CAPABILITY_BLOCKER_LABELS[blocker.code] ??
                    "L'export n'est pas encore disponible pour cette organisation."}
                </p>
              ))}
            </div>
          ) : activatableTemplates.length === 0 ? (
            <p className="text-sm text-warning-fg">
              Aucun template avec une version active. Un administrateur doit d&apos;abord en activer
              un.
            </p>
          ) : (
            <>
              <label htmlFor="template" className="text-sm font-medium text-tenderos-navy">
                Template
              </label>
              <Select
                id="template"
                value={templateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="max-w-md"
              >
                {activatableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({EXPORT_DOCUMENT_TYPE_LABELS[t.documentType] ?? t.documentType})
                  </option>
                ))}
              </Select>

              {rows.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {rows.map((row) => (
                    <div key={row.sectionId} className="rounded border border-tenderos-navy/10 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-sm font-medium text-tenderos-navy">{row.label}</span>
                        {row.mandatory ? (
                          <span className="rounded bg-tenderos-light px-1.5 py-0.5 text-xs text-tenderos-navy">
                            Obligatoire
                          </span>
                        ) : null}
                      </div>
                      <Select
                        value={row.sourceType}
                        onChange={(e) => updateRow(row.sectionId, { sourceType: e.target.value })}
                        className="mb-2"
                      >
                        {EXPORT_SECTION_SOURCES.map((source) => (
                          <option key={source} value={source}>
                            {EXPORT_SECTION_SOURCE_LABELS[source] ?? source}
                          </option>
                        ))}
                      </Select>
                      {row.sourceType === "GENERATION" ? (
                        <Select
                          aria-label="Génération à reprendre"
                          value={row.generationId}
                          onChange={(e) =>
                            updateRow(row.sectionId, { generationId: e.target.value })
                          }
                        >
                          <option value="">
                            {generations.length === 0
                              ? "Aucune génération pour cet appel d'offres"
                              : "Choisir une génération…"}
                          </option>
                          {generations.map((generation) => (
                            <option key={generation.id} value={generation.id}>
                              {generationOptionLabel(generation)}
                            </option>
                          ))}
                        </Select>
                      ) : null}
                      {row.sourceType === "PRICING" ? (
                        <div className="flex gap-2">
                          <div className="min-w-0 flex-1">
                            <Select
                              aria-label="Estimation à reprendre"
                              value={row.pricingEstimateId}
                              onChange={(e) =>
                                updateRow(row.sectionId, { pricingEstimateId: e.target.value })
                              }
                            >
                              <option value="">
                                {estimates.length === 0
                                  ? "Aucune estimation pour cet appel d'offres"
                                  : "Choisir une estimation…"}
                              </option>
                              {estimates.map((estimate) => (
                                <option key={estimate.id} value={estimate.id}>
                                  {estimateOptionLabel(estimate)}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <Input
                            type="number"
                            min="1"
                            placeholder="N° de version (vide = courante)"
                            value={row.pricingEstimateVersionNumber}
                            onChange={(e) =>
                              updateRow(row.sectionId, {
                                pricingEstimateVersionNumber: e.target.value,
                              })
                            }
                            className="w-48"
                          />
                        </div>
                      ) : null}
                      {row.sourceType === "MANUAL" ? (
                        <Textarea
                          placeholder="Contenu de la section"
                          value={row.manualContent}
                          onChange={(e) =>
                            updateRow(row.sectionId, { manualContent: e.target.value })
                          }
                          rows={3}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <Button
                type="button"
                disabled={isPending || rows.length === 0}
                onClick={handlePreview}
                className="self-start"
                variant="primary"
                size="sm"
              >
                {isPending ? "Génération..." : "Générer l'aperçu"}
              </Button>
            </>
          )}

          {error ? (
            <p role="alert" className="text-sm text-danger-fg">
              {error}
            </p>
          ) : null}

          {lastJob ? (
            <div className="flex items-center gap-3 rounded border border-tenderos-navy/10 bg-tenderos-light p-3">
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${exportJobStatusBadgeClass(lastJob.status)}`}
              >
                {EXPORT_JOB_STATUS_LABELS[lastJob.status] ?? lastJob.status}
              </span>
              <span className="text-sm text-tenderos-navy">v{lastJob.version}</span>
              {lastJob.status === "COMPLETED" ? (
                <a
                  href={`/app/tenders/${tenderId}/export/${lastJob.id}/download`}
                  className="text-sm font-medium text-tenderos-navy hover:underline"
                >
                  Télécharger
                </a>
              ) : null}
              {lastJob.status === "FAILED" ? (
                <span className="text-sm text-danger-fg">{lastJob.errorMessage}</span>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded border border-tenderos-navy/10 p-4">
        <h2 className="mb-3 text-sm font-semibold text-tenderos-navy">Historique</h2>
        {history.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun export pour l&apos;instant.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-tenderos-navy/10 text-left text-tenderos-slate">
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
                <tr key={job.id} className="border-b border-tenderos-navy/10">
                  <td className="py-2 pr-4 text-tenderos-navy">
                    {EXPORT_DOCUMENT_TYPE_LABELS[job.documentType] ?? job.documentType}
                  </td>
                  <td className="py-2 pr-4 text-tenderos-slate">
                    {job.mode === "FINAL" ? "Final" : "Aperçu"}
                  </td>
                  <td className="py-2 pr-4 text-tenderos-slate">v{job.version}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${exportJobStatusBadgeClass(job.status)}`}
                    >
                      {EXPORT_JOB_STATUS_LABELS[job.status] ?? job.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-tenderos-slate">
                    {new Date(job.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="py-2 pr-4">
                    {job.status === "COMPLETED" ? (
                      <a
                        href={`/app/tenders/${tenderId}/export/${job.id}/download`}
                        className="text-tenderos-navy hover:underline"
                      >
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
