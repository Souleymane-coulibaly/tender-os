"use client";

import { useState } from "react";
import { generateDc1Action, generateDc2CandidateAction, generateDc2MemberAction, generateDc4Action } from "../../../../official-form-actions";
import {
  officialFormFieldStatusBadgeClass,
  officialFormFieldStatusLabel,
  readinessBadgeClass,
  type OfficialFormGeneratedDocumentSummary,
  type OfficialFormReadiness,
} from "../../../../../../lib/official-form-types";

export type FormCardSpec = {
  key: string;
  title: string;
  operatorLabel: string;
  initialReadiness: OfficialFormReadiness;
  initialGeneratedDocument?: OfficialFormGeneratedDocumentSummary | undefined;
  canGenerate: boolean;
  action: "dc1" | "dc2-candidate" | "dc2-member" | "dc4";
  tenderId: string;
  memberId?: string | undefined;
  subcontractorDeclarationId?: string | undefined;
  downloadHref: (revisionId: string) => string;
};

function FieldRow({ field }: { field: OfficialFormReadiness["fields"][number] }) {
  return (
    <tr className="border-b border-neutral-100">
      <td className="py-1 pr-4 text-neutral-700">{field.label}</td>
      <td className="py-1 pr-4">{typeof field.value === "boolean" ? (field.value ? "Oui" : "Non") : (field.value ?? <span className="text-neutral-400">—</span>)}</td>
      <td className="py-1 pr-4 text-neutral-500">{field.source ?? "—"}</td>
      <td className="py-1 pr-4">
        <span className={`rounded border px-2 py-0.5 text-xs font-medium ${officialFormFieldStatusBadgeClass(field.status)}`}>{officialFormFieldStatusLabel(field.status)}</span>
      </td>
    </tr>
  );
}

/** Mission §29 — pour un champ manquant modifiable, orienter vers la fiche source réelle plutôt
 *  qu'un champ isolé caché dans l'aperçu. Purement indicatif, jamais un second système d'édition. */
function sourceHint(source: string | undefined): string | undefined {
  switch (source) {
    case "CLIENT_PROFILE":
      return "Compléter la fiche entreprise candidate";
    case "GROUP_MEMBER":
      return "Compléter le groupement (membre)";
    case "SUBCONTRACTOR":
      return "Compléter la déclaration de sous-traitance";
    case "TENDER":
      return "Compléter la fiche du marché";
    default:
      return undefined;
  }
}

export function OfficialFormCard({ spec }: { spec: FormCardSpec }) {
  const [readiness] = useState(spec.initialReadiness);
  const [generatedDocument, setGeneratedDocument] = useState(spec.initialGeneratedDocument);
  const [expanded, setExpanded] = useState(false);
  const [confirmingPartial, setConfirmingPartial] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [justGeneratedRevisionId, setJustGeneratedRevisionId] = useState<string | undefined>();

  const revisions = [...(generatedDocument?.revisions ?? [])].sort((a, b) => b.revisionNumber - a.revisionNumber);
  const latest = revisions[0];
  const missingRequired = readiness.fields.filter((f) => f.required && (f.status === "MISSING" || f.status === "NEEDS_REVIEW"));
  const hintSources = Array.from(new Set(readiness.missingFieldKeys.map((key) => readiness.fields.find((f) => f.fieldKey === key)?.source).map(sourceHint).filter((v): v is string => Boolean(v))));

  async function runGenerate() {
    setIsPending(true);
    setError(undefined);
    setConfirmingPartial(false);
    const result =
      spec.action === "dc1"
        ? await generateDc1Action(spec.tenderId)
        : spec.action === "dc2-candidate"
          ? await generateDc2CandidateAction(spec.tenderId)
          : spec.action === "dc2-member"
            ? await generateDc2MemberAction(spec.tenderId, spec.memberId!)
            : await generateDc4Action(spec.tenderId, spec.subcontractorDeclarationId!);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.generated) {
      setGeneratedDocument(result.generated);
      const newest = [...(result.generated.revisions ?? [])].sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
      setJustGeneratedRevisionId(newest?.id);
    }
  }

  function handleGenerateClick() {
    if (missingRequired.length > 0 && !confirmingPartial) {
      setConfirmingPartial(true);
      return;
    }
    void runGenerate();
  }

  return (
    <div className="rounded border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-neutral-900">
            {spec.title} — {spec.operatorLabel}
          </p>
          <p className="text-xs text-neutral-500">
            {readiness.availableFieldCount} / {readiness.applicableFieldCount} champs applicables disponibles
          </p>
        </div>
        <span className={`w-fit rounded border px-2 py-1 text-sm font-semibold ${readinessBadgeClass(readiness.readinessPercentage)}`}>{readiness.readinessPercentage}% prêt</span>
      </div>

      {readiness.needsReviewFieldKeys.length > 0 ? <p className="mt-2 text-xs text-amber-700">{readiness.needsReviewFieldKeys.length} donnée(s) à confirmer manuellement avant génération.</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="w-fit rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700">
          {expanded ? "Masquer l'aperçu" : "Prévisualiser"}
        </button>
        {spec.canGenerate ? (
          <button type="button" onClick={handleGenerateClick} disabled={isPending} className="w-fit rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {isPending ? "Génération…" : "Générer le DOCX"}
          </button>
        ) : null}
      </div>

      {confirmingPartial ? (
        <div role="alert" className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <p>
            {missingRequired.length} champ(s) important(s) sont manquants ou à confirmer ({missingRequired.map((f) => f.label).join(", ")}). Générer quand même ? Les champs absents resteront
            vides dans le document — jamais une valeur inventée.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => void runGenerate()} className="w-fit rounded bg-amber-700 px-2 py-1 text-xs font-medium text-white">
              Générer quand même
            </button>
            <button type="button" onClick={() => setConfirmingPartial(false)} className="w-fit rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-800">
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {justGeneratedRevisionId ? (
        <p className="mt-2 text-xs text-green-700">
          Révision générée —{" "}
          <a href={spec.downloadHref(justGeneratedRevisionId)} className="font-medium underline">
            Télécharger le DOCX
          </a>
          . Ce document reste à l&apos;état « généré », une validation humaine explicite reste nécessaire avant tout dépôt.
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-300 text-neutral-500">
                <th className="py-1 pr-4 font-medium">Champ</th>
                <th className="py-1 pr-4 font-medium">Valeur</th>
                <th className="py-1 pr-4 font-medium">Source</th>
                <th className="py-1 pr-4 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {readiness.fields.map((field) => (
                <FieldRow key={field.fieldKey} field={field} />
              ))}
            </tbody>
          </table>
          {hintSources.length > 0 ? (
            <p className="mt-2 text-xs text-neutral-600">
              Pour compléter les données manquantes : {hintSources.join(" · ")}.
            </p>
          ) : null}
        </div>
      ) : null}

      {revisions.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-neutral-500">Historique des révisions</p>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-500">
                <th className="py-1 pr-4 font-medium">Révision</th>
                <th className="py-1 pr-4 font-medium">Statut</th>
                <th className="py-1 pr-4 font-medium">Date</th>
                <th className="py-1 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((revision) => (
                <tr key={revision.id} className="border-b border-neutral-100">
                  <td className="py-1 pr-4">R{revision.revisionNumber}</td>
                  <td className="py-1 pr-4">{revision.status}</td>
                  <td className="py-1 pr-4">{new Date(revision.createdAt).toLocaleString("fr-FR")}</td>
                  <td className="py-1 pr-4">
                    {revision.status === "COMPLETED" ? (
                      <a href={spec.downloadHref(revision.id)} className="text-neutral-900 hover:underline">
                        Télécharger
                      </a>
                    ) : revision.errorMessage ? (
                      <span className="text-red-700">{revision.errorMessage}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : latest === undefined ? (
        <p className="mt-3 text-xs text-neutral-400">Jamais généré — la génération reste facultative, le reste du dossier fonctionne sans elle.</p>
      ) : null}
    </div>
  );
}

export function OfficialFormsSection({ cards }: { cards: FormCardSpec[] }) {
  if (cards.length === 0) {
    return <p className="text-sm text-neutral-500">Aucun formulaire officiel disponible pour l&apos;instant.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {cards.map((spec) => (
        <OfficialFormCard key={spec.key} spec={spec} />
      ))}
    </div>
  );
}
