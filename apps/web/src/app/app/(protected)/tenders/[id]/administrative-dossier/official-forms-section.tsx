"use client";

import { useState } from "react";
import {
  generateDc1Action,
  generateDc2CandidateAction,
  generateDc2MemberAction,
  generateDc4Action,
} from "../../../../official-form-actions";
import {
  formFieldSourceLabel,
  officialFormFieldStatusBadgeClass,
  officialFormFieldStatusLabel,
  readinessBadgeClass,
  type OfficialFormGeneratedDocumentSummary,
  type OfficialFormReadiness,
} from "../../../../../../lib/official-form-types";
import { Button } from "../../../../../../components/ui/button";
import { GENERATED_REVISION_STATUS_LABELS } from "../../../../../../lib/administrative-dossier-types";

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
};

/** Construit ici, jamais reçu en prop : une fonction ne franchit pas la frontière serveur → client
 *  (la page entière échouait dès qu'un formulaire officiel était disponible). */
export function revisionDownloadHref(tenderId: string, revisionId: string): string {
  return `/app/tenders/${tenderId}/documents-generated/document-revisions/${revisionId}/download`;
}

function FieldRow({ field }: { field: OfficialFormReadiness["fields"][number] }) {
  return (
    <tr className="border-b border-tenderos-navy/10">
      <td className="py-1 pr-4 text-tenderos-navy">{field.label}</td>
      <td className="py-1 pr-4">
        {typeof field.value === "boolean"
          ? field.value
            ? "Oui"
            : "Non"
          : (field.value ?? <span className="text-tenderos-slate">—</span>)}
      </td>
      <td className="py-1 pr-4 text-tenderos-slate">{formFieldSourceLabel(field.source)}</td>
      <td className="py-1 pr-4">
        <span
          className={`rounded border px-2 py-0.5 text-xs font-medium ${officialFormFieldStatusBadgeClass(field.status)}`}
        >
          {officialFormFieldStatusLabel(field.status)}
        </span>
      </td>
    </tr>
  );
}

/** Mission §29 — pour un champ manquant modifiable, orienter vers la fiche source réelle plutôt
 *  qu'un champ isolé caché dans l'aperçu. Purement indicatif, jamais un second système d'édition. */
function sourceHint(source: string | undefined): string | undefined {
  switch (source) {
    case "CLIENT_PROFILE":
      return "Compléter la fiche entreprise du client";
    case "CANDIDATE_COMPANY_PROFILE":
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

  const revisions = [...(generatedDocument?.revisions ?? [])].sort(
    (a, b) => b.revisionNumber - a.revisionNumber,
  );
  const latest = revisions[0];
  const missingRequired = readiness.fields.filter(
    (f) => f.required && (f.status === "MISSING" || f.status === "NEEDS_REVIEW"),
  );
  const hintSources = Array.from(
    new Set(
      readiness.missingFieldKeys
        .map((key) => readiness.fields.find((f) => f.fieldKey === key)?.source)
        .map(sourceHint)
        .filter((v): v is string => Boolean(v)),
    ),
  );

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
      const newest = [...(result.generated.revisions ?? [])].sort(
        (a, b) => b.revisionNumber - a.revisionNumber,
      )[0];
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
    <div className="rounded border border-tenderos-navy/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-tenderos-navy">
            {spec.title} — {spec.operatorLabel}
          </p>
          <p className="text-xs text-tenderos-slate">
            {readiness.availableFieldCount} / {readiness.applicableFieldCount} champs applicables
            disponibles
          </p>
        </div>
        <span
          className={`w-fit rounded border px-2 py-1 text-sm font-semibold ${readinessBadgeClass(readiness.readinessPercentage)}`}
        >
          {readiness.readinessPercentage}% prêt
        </span>
      </div>

      {readiness.needsReviewFieldKeys.length > 0 ? (
        <p className="mt-2 text-xs text-warning-fg">
          {readiness.needsReviewFieldKeys.length} donnée(s) à confirmer manuellement avant
          génération.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-fit"
          variant="secondary"
          size="sm"
        >
          {expanded ? "Masquer l'aperçu" : "Prévisualiser"}
        </Button>
        {spec.canGenerate ? (
          <Button
            type="button"
            onClick={handleGenerateClick}
            disabled={isPending}
            className="w-fit"
            variant="primary"
            size="sm"
          >
            {isPending ? "Génération…" : "Générer le DOCX"}
          </Button>
        ) : null}
      </div>

      {confirmingPartial ? (
        <div
          role="alert"
          className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-warning-fg"
        >
          <p>
            {missingRequired.length} champ(s) important(s) sont manquants ou à confirmer (
            {missingRequired.map((f) => f.label).join(", ")}). Générer quand même ? Les champs
            absents resteront vides dans le document — jamais une valeur inventée.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              onClick={() => void runGenerate()}
              className="w-fit"
              variant="ghost"
              size="sm"
            >
              Générer quand même
            </Button>
            <Button
              type="button"
              onClick={() => setConfirmingPartial(false)}
              className="w-fit"
              variant="ghost"
              size="sm"
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger-fg">
          {error}
        </p>
      ) : null}

      {justGeneratedRevisionId ? (
        <p className="mt-2 text-xs text-success-fg">
          Révision générée —{" "}
          <a href={revisionDownloadHref(spec.tenderId, justGeneratedRevisionId)} className="font-medium underline">
            Télécharger le DOCX
          </a>
          . Ce document reste à l&apos;état « généré », une validation humaine explicite reste
          nécessaire avant tout dépôt.
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-tenderos-navy/15 text-tenderos-slate">
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
            <p className="mt-2 text-xs text-tenderos-slate">
              Pour compléter les données manquantes : {hintSources.join(" · ")}.
            </p>
          ) : null}
        </div>
      ) : null}

      {revisions.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-tenderos-slate">Historique des révisions</p>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-tenderos-navy/10 text-tenderos-slate">
                <th className="py-1 pr-4 font-medium">Révision</th>
                <th className="py-1 pr-4 font-medium">Statut</th>
                <th className="py-1 pr-4 font-medium">Date</th>
                <th className="py-1 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((revision) => (
                <tr key={revision.id} className="border-b border-tenderos-navy/10">
                  <td className="py-1 pr-4">R{revision.revisionNumber}</td>
                  <td className="py-1 pr-4">
                    {GENERATED_REVISION_STATUS_LABELS[revision.status] ?? revision.status}
                  </td>
                  <td className="py-1 pr-4">
                    {new Date(revision.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="py-1 pr-4">
                    {revision.status === "COMPLETED" ? (
                      <a
                        href={revisionDownloadHref(spec.tenderId, revision.id)}
                        className="text-tenderos-navy hover:underline"
                      >
                        Télécharger
                      </a>
                    ) : revision.errorMessage ? (
                      <span className="text-danger-fg">{revision.errorMessage}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : latest === undefined ? (
        <p className="mt-3 text-xs text-tenderos-slate">
          Jamais généré — la génération reste facultative, le reste du dossier fonctionne sans elle.
        </p>
      ) : null}
    </div>
  );
}

export function OfficialFormsSection({ cards }: { cards: FormCardSpec[] }) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-tenderos-slate">
        Aucun formulaire officiel disponible pour l&apos;instant.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {cards.map((spec) => (
        <OfficialFormCard key={spec.key} spec={spec} />
      ))}
    </div>
  );
}
