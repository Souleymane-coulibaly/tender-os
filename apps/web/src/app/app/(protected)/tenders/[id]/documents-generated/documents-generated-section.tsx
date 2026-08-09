"use client";

import { useState } from "react";
import { fetchGeneratedDocument, generateDocumentAction, regenerateDocumentAction } from "../../../../document-generation-actions";
import {
  canUseDocumentGeneration,
  documentGenerationRevisionStatusBadgeClass,
  type DocumentTemplateSummary,
  type GeneratedDocumentRevisionSummary,
  type GeneratedDocumentSummary,
} from "../../../../../../lib/document-generation-types";

/** Types de champ éditables via un formulaire simple (texte/date/nombre/case) — LIST/TABLE
 *  nécessitent une saisie structurée (lignes de tableau) hors périmètre de ce formulaire minimal
 *  Sprint 10 (mission "minimal frontend") ; ces champs restent visibles mais non éditables ici. */
const SIMPLE_FIELD_TYPES = new Set(["STRING", "DATE", "CURRENCY", "PERCENTAGE", "BOOLEAN", "CHECKBOX", "MULTILINE"]);

function FieldInput({ fieldType, value, onChange }: { fieldType: string; value: string; onChange: (v: string) => void }) {
  if (fieldType === "MULTILINE") {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" />;
  }
  if (fieldType === "DATE") {
    return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-sm" />;
  }
  if (fieldType === "CURRENCY" || fieldType === "PERCENTAGE") {
    return <input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} className="w-40 rounded border border-neutral-300 px-2 py-1 text-sm" />;
  }
  if (fieldType === "BOOLEAN" || fieldType === "CHECKBOX") {
    return <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} />;
  }
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded border border-neutral-300 px-2 py-1 text-sm" />;
}

function coerceValue(fieldType: string, raw: string): unknown {
  if (fieldType === "CURRENCY" || fieldType === "PERCENTAGE") return raw === "" ? undefined : Number(raw);
  if (fieldType === "BOOLEAN" || fieldType === "CHECKBOX") return raw === "true";
  return raw === "" ? undefined : raw;
}

function RevisionRow({ revision }: { revision: GeneratedDocumentRevisionSummary }) {
  return (
    <tr className="border-b border-neutral-100">
      <td className="py-1 pr-4">v{revision.revisionNumber}</td>
      <td className="py-1 pr-4">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${documentGenerationRevisionStatusBadgeClass(revision.status)}`}>{revision.status}</span>
      </td>
      <td className="py-1 pr-4">{revision.missingFields.length > 0 ? <span className="text-amber-700">{revision.missingFields.join(", ")}</span> : <span className="text-neutral-400">—</span>}</td>
      <td className="py-1 pr-4">{new Date(revision.createdAt).toLocaleString("fr-FR")}</td>
      <td className="py-1 pr-4">
        {revision.status === "COMPLETED" ? (
          <a href={`document-revisions/${revision.id}/download`} className="text-neutral-900 hover:underline">
            Télécharger
          </a>
        ) : revision.errorMessage ? (
          <span className="text-red-700">{revision.errorMessage}</span>
        ) : null}
      </td>
    </tr>
  );
}

function GeneratedDocumentCard({ tenderId, generatedDocument, canUse }: { tenderId: string; generatedDocument: GeneratedDocumentSummary; canUse: boolean }) {
  const [revisions, setRevisions] = useState(generatedDocument.revisions ?? []);
  const [expanded, setExpanded] = useState(false);
  const [regenerateData, setRegenerateData] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const latest = [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber)[0];

  async function toggle() {
    if (!expanded) {
      const full = await fetchGeneratedDocument(generatedDocument.id);
      setRevisions(full.revisions ?? []);
      if (full.revisions?.[0]) {
        const seed: Record<string, string> = {};
        for (const [key, value] of Object.entries(full.revisions[full.revisions.length - 1]!.dataSnapshot)) {
          seed[key] = typeof value === "boolean" ? (value ? "true" : "false") : String(value ?? "");
        }
        setRegenerateData(seed);
      }
    }
    setExpanded((v) => !v);
  }

  async function handleRegenerate() {
    setIsPending(true);
    setError(undefined);
    const data: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(regenerateData)) {
      if (raw !== "") data[key] = raw;
    }
    const result = await regenerateDocumentAction(tenderId, generatedDocument.id, data);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.generated?.revisions) setRevisions(result.generated.revisions);
  }

  return (
    <div className="rounded border border-neutral-200 p-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={toggle} className="text-sm font-medium text-neutral-900 hover:underline">
          {generatedDocument.title}
        </button>
        {latest ? <span className={`rounded px-2 py-0.5 text-xs font-medium ${documentGenerationRevisionStatusBadgeClass(latest.status)}`}>Dernière révision : v{latest.revisionNumber}</span> : null}
      </div>

      {expanded ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-neutral-100 pt-3">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-1 pr-4">Révision</th>
                <th className="py-1 pr-4">Statut</th>
                <th className="py-1 pr-4">Champs manquants</th>
                <th className="py-1 pr-4">Date</th>
                <th className="py-1 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {[...revisions]
                .sort((a, b) => a.revisionNumber - b.revisionNumber)
                .map((revision) => (
                  <RevisionRow key={revision.id} revision={revision} />
                ))}
            </tbody>
          </table>

          {canUse ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-neutral-700">Régénérer (nouvelle révision, l&apos;ancienne reste inchangée)</p>
              {Object.keys(regenerateData).length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(regenerateData).map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-xs text-neutral-600">{key}</label>
                      <input value={value} onChange={(e) => setRegenerateData((prev) => ({ ...prev, [key]: e.target.value }))} className="rounded border border-neutral-300 px-2 py-1 text-sm" />
                    </div>
                  ))}
                </div>
              ) : null}
              <button type="button" disabled={isPending} onClick={handleRegenerate} className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50">
                {isPending ? "Régénération..." : "Régénérer"}
              </button>
              {error ? (
                <p role="alert" className="text-xs text-red-600">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GenerateForm({ tenderId, templates, onGenerated }: { tenderId: string; templates: DocumentTemplateSummary[]; onGenerated: (g: GeneratedDocumentSummary) => void }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [lastResult, setLastResult] = useState<GeneratedDocumentSummary | undefined>();

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const fieldMappings = selectedTemplate?.activeVersion?.fieldMappings ?? [];

  function handleTemplateChange(nextId: string) {
    setTemplateId(nextId);
    setValues({});
  }

  async function handleSubmit() {
    setIsPending(true);
    setError(undefined);
    const data: Record<string, unknown> = {};
    for (const mapping of fieldMappings) {
      if (!SIMPLE_FIELD_TYPES.has(mapping.fieldType)) continue;
      const coerced = coerceValue(mapping.fieldType, values[mapping.fieldKey] ?? "");
      if (coerced !== undefined) data[mapping.fieldKey] = coerced;
    }
    const result = await generateDocumentAction(tenderId, { documentTemplateId: templateId, title: title || undefined, data });
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.generated) {
      setLastResult(result.generated);
      onGenerated(result.generated);
    }
  }

  if (templates.length === 0) {
    return <p className="text-sm text-amber-700">Aucun template avec une version active. Un administrateur doit d&apos;abord en activer un (Configuration IA → Templates documentaires).</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Nouveau document</h2>
      <div className="flex flex-wrap gap-2">
        <select value={templateId} onChange={(e) => handleTemplateChange(e.target.value)} className="rounded border border-neutral-300 px-2 py-1 text-sm">
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input placeholder="Titre du document (optionnel)" value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm" />
      </div>

      {fieldMappings.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {fieldMappings.map((mapping) => (
            <div key={mapping.fieldKey} className="flex flex-col gap-1">
              <label className="text-xs text-neutral-600">
                {mapping.label}
                {mapping.required ? <span className="text-red-600"> *</span> : null}
                {!SIMPLE_FIELD_TYPES.has(mapping.fieldType) ? <span className="ml-1 text-neutral-400">(liste/tableau — non éditable ici)</span> : null}
              </label>
              {SIMPLE_FIELD_TYPES.has(mapping.fieldType) ? (
                <FieldInput fieldType={mapping.fieldType} value={values[mapping.fieldKey] ?? ""} onChange={(v) => setValues((prev) => ({ ...prev, [mapping.fieldKey]: v }))} />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <button type="button" disabled={isPending} onClick={handleSubmit} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Génération..." : "Générer"}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {lastResult?.revisions?.[0] ? (
        <div className="flex items-center gap-3 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${documentGenerationRevisionStatusBadgeClass(lastResult.revisions[0].status)}`}>{lastResult.revisions[0].status}</span>
          {lastResult.revisions[0].missingFields.length > 0 ? (
            <span className="text-amber-700">Champs manquants : {lastResult.revisions[0].missingFields.join(", ")}</span>
          ) : null}
          {lastResult.revisions[0].status === "COMPLETED" ? (
            <a href={`document-revisions/${lastResult.revisions[0].id}/download`} className="font-medium text-neutral-900 hover:underline">
              Télécharger
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DocumentsGeneratedSection({
  tenderId,
  initialGeneratedDocuments,
  templates,
  actorRole,
}: {
  tenderId: string;
  initialGeneratedDocuments: GeneratedDocumentSummary[];
  templates: DocumentTemplateSummary[];
  actorRole: string | undefined;
}) {
  const [generatedDocuments, setGeneratedDocuments] = useState(initialGeneratedDocuments);
  const canUse = canUseDocumentGeneration(actorRole);

  return (
    <div className="flex flex-col gap-6">
      {canUse ? <GenerateForm tenderId={tenderId} templates={templates} onGenerated={(g) => setGeneratedDocuments((prev) => [g, ...prev])} /> : null}

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Historique</h2>
        {generatedDocuments.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun document généré pour l&apos;instant.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {generatedDocuments.map((g) => (
              <GeneratedDocumentCard key={g.id} tenderId={tenderId} generatedDocument={g} canUse={canUse} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
