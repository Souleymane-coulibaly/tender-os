"use client";

import { useState } from "react";
import {
  fetchGeneratedDocument,
  generateDocumentAction,
  regenerateDocumentAction,
} from "../../../../document-generation-actions";
import {
  canUseDocumentGeneration,
  documentGenerationRevisionStatusBadgeClass,
  type DocumentTemplateSummary,
  type GeneratedDocumentRevisionSummary,
  type GeneratedDocumentSummary,
} from "../../../../../../lib/document-generation-types";
import { Button } from "../../../../../../components/ui/button";
import { Input } from "../../../../../../components/ui/input";
import { Select } from "../../../../../../components/ui/select";
import { Textarea } from "../../../../../../components/ui/textarea";

/** Types de champ éditables via un formulaire simple (texte/date/nombre/case) — LIST/TABLE
 *  nécessitent une saisie structurée (lignes de tableau) hors périmètre de ce formulaire minimal
 *  Sprint 10 (mission "minimal frontend") ; ces champs restent visibles mais non éditables ici. */
const SIMPLE_FIELD_TYPES = new Set([
  "STRING",
  "DATE",
  "CURRENCY",
  "PERCENTAGE",
  "BOOLEAN",
  "CHECKBOX",
  "MULTILINE",
]);

function FieldInput({
  fieldType,
  value,
  onChange,
}: {
  fieldType: string;
  value: string;
  onChange: (v: string) => void;
}) {
  if (fieldType === "MULTILINE") {
    return <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} />;
  }
  if (fieldType === "DATE") {
    return <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  if (fieldType === "CURRENCY" || fieldType === "PERCENTAGE") {
    return (
      <Input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-40"
      />
    );
  }
  if (fieldType === "BOOLEAN" || fieldType === "CHECKBOX") {
    return (
      <input
        type="checkbox"
        checked={value === "true"}
        onChange={(e) => onChange(e.target.checked ? "true" : "false")}
      />
    );
  }
  return <Input type="text" value={value} onChange={(e) => onChange(e.target.value)} />;
}

function coerceValue(fieldType: string, raw: string): unknown {
  if (fieldType === "CURRENCY" || fieldType === "PERCENTAGE")
    return raw === "" ? undefined : Number(raw);
  if (fieldType === "BOOLEAN" || fieldType === "CHECKBOX") return raw === "true";
  return raw === "" ? undefined : raw;
}

function RevisionRow({ revision }: { revision: GeneratedDocumentRevisionSummary }) {
  return (
    <tr className="border-b border-tenderos-navy/10">
      <td className="py-1 pr-4">v{revision.revisionNumber}</td>
      <td className="py-1 pr-4">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${documentGenerationRevisionStatusBadgeClass(revision.status)}`}
        >
          {revision.status}
        </span>
      </td>
      <td className="py-1 pr-4">
        {revision.missingFields.length > 0 ? (
          <span className="text-warning-fg">{revision.missingFields.join(", ")}</span>
        ) : (
          <span className="text-tenderos-slate">—</span>
        )}
      </td>
      <td className="py-1 pr-4">{new Date(revision.createdAt).toLocaleString("fr-FR")}</td>
      <td className="py-1 pr-4">
        {revision.status === "COMPLETED" ? (
          <a
            href={`document-revisions/${revision.id}/download`}
            className="text-tenderos-navy hover:underline"
          >
            Télécharger
          </a>
        ) : revision.errorMessage ? (
          <span className="text-danger-fg">{revision.errorMessage}</span>
        ) : null}
      </td>
    </tr>
  );
}

function GeneratedDocumentCard({
  tenderId,
  generatedDocument,
  canUse,
}: {
  tenderId: string;
  generatedDocument: GeneratedDocumentSummary;
  canUse: boolean;
}) {
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
        for (const [key, value] of Object.entries(
          full.revisions[full.revisions.length - 1]!.dataSnapshot,
        )) {
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
    <div className="rounded border border-tenderos-navy/10 p-3">
      <div className="flex items-center justify-between">
        <Button type="button" onClick={toggle} variant="ghost" size="sm">
          {generatedDocument.title}
        </Button>
        {latest ? (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${documentGenerationRevisionStatusBadgeClass(latest.status)}`}
          >
            Dernière révision : v{latest.revisionNumber}
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-tenderos-navy/10 pt-3">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-tenderos-navy/10 text-left text-tenderos-slate">
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
              <p className="text-xs font-medium text-tenderos-navy">
                Régénérer (nouvelle révision, l&apos;ancienne reste inchangée)
              </p>
              {Object.keys(regenerateData).length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(regenerateData).map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-xs text-tenderos-slate">{key}</label>
                      <Input
                        value={value}
                        onChange={(e) =>
                          setRegenerateData((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              <Button
                type="button"
                disabled={isPending}
                onClick={handleRegenerate}
                className="self-start"
                variant="secondary"
                size="sm"
              >
                {isPending ? "Régénération..." : "Régénérer"}
              </Button>
              {error ? (
                <p role="alert" className="text-xs text-danger-fg">
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

function GenerateForm({
  tenderId,
  templates,
  onGenerated,
}: {
  tenderId: string;
  templates: DocumentTemplateSummary[];
  onGenerated: (g: GeneratedDocumentSummary) => void;
}) {
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
    const result = await generateDocumentAction(tenderId, {
      documentTemplateId: templateId,
      title: title || undefined,
      data,
    });
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
    return (
      <p className="text-sm text-warning-fg">
        Aucun template avec une version active. Un administrateur doit d&apos;abord en activer un
        (Configuration IA → Templates documentaires).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-tenderos-navy/10 p-4">
      <h2 className="text-sm font-semibold text-tenderos-navy">Nouveau document</h2>
      <div className="flex flex-wrap gap-2">
        <Select value={templateId} onChange={(e) => handleTemplateChange(e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Titre du document (optionnel)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1"
        />
      </div>

      {fieldMappings.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {fieldMappings.map((mapping) => (
            <div key={mapping.fieldKey} className="flex flex-col gap-1">
              <label className="text-xs text-tenderos-slate">
                {mapping.label}
                {mapping.required ? <span className="text-danger-fg"> *</span> : null}
                {!SIMPLE_FIELD_TYPES.has(mapping.fieldType) ? (
                  <span className="ml-1 text-tenderos-slate">
                    (liste/tableau — non éditable ici)
                  </span>
                ) : null}
              </label>
              {SIMPLE_FIELD_TYPES.has(mapping.fieldType) ? (
                <FieldInput
                  fieldType={mapping.fieldType}
                  value={values[mapping.fieldKey] ?? ""}
                  onChange={(v) => setValues((prev) => ({ ...prev, [mapping.fieldKey]: v }))}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <Button
        type="button"
        disabled={isPending}
        onClick={handleSubmit}
        className="self-start"
        variant="primary"
        size="sm"
      >
        {isPending ? "Génération..." : "Générer"}
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}

      {lastResult?.revisions?.[0] ? (
        <div className="flex items-center gap-3 rounded border border-tenderos-navy/10 bg-tenderos-light p-3 text-sm">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${documentGenerationRevisionStatusBadgeClass(lastResult.revisions[0].status)}`}
          >
            {lastResult.revisions[0].status}
          </span>
          {lastResult.revisions[0].missingFields.length > 0 ? (
            <span className="text-warning-fg">
              Champs manquants : {lastResult.revisions[0].missingFields.join(", ")}
            </span>
          ) : null}
          {lastResult.revisions[0].status === "COMPLETED" ? (
            <a
              href={`document-revisions/${lastResult.revisions[0].id}/download`}
              className="font-medium text-tenderos-navy hover:underline"
            >
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
      {canUse ? (
        <GenerateForm
          tenderId={tenderId}
          templates={templates}
          onGenerated={(g) => setGeneratedDocuments((prev) => [g, ...prev])}
        />
      ) : null}

      <section className="rounded border border-tenderos-navy/10 p-4">
        <h2 className="mb-3 text-sm font-semibold text-tenderos-navy">Historique</h2>
        {generatedDocuments.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun document généré pour l&apos;instant.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {generatedDocuments.map((g) => (
              <GeneratedDocumentCard
                key={g.id}
                tenderId={tenderId}
                generatedDocument={g}
                canUse={canUse}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
