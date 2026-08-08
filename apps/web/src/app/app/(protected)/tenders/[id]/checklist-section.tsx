"use client";

import { useActionState, useMemo, useState } from "react";
import {
  attachChecklistItemDocumentAction,
  changeChecklistItemStatusAction,
  createChecklistItemAction,
  detachChecklistItemDocumentAction,
  findChecklistItemDocumentMatchesAction,
  markChecklistItemNotApplicableAction,
  reconcileChecklistWithNewAnalysisAction,
  validateChecklistItemAction,
  type FormActionState,
} from "../../../actions";
import { createTaskFromChecklistItemAction } from "../../../workspace-actions";
import type {
  ChecklistComplianceStatus,
  ChecklistDocumentMatchResult,
  ChecklistItem,
  ChecklistItemCriticality,
  ChecklistItemStatus,
  ChecklistItemType,
  ChecklistProgress,
  ChecklistRequirementLevel,
  TenderLot,
} from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};
const STATUSES: ChecklistItemStatus[] = ["TODO", "IN_PROGRESS", "COMPLETED", "NOT_APPLICABLE"];
const TYPES: ChecklistItemType[] = [
  "ADMINISTRATIVE_DOCUMENT",
  "TECHNICAL_DOCUMENT",
  "FINANCIAL_DOCUMENT",
  "CERTIFICATION",
  "INSURANCE",
  "DECLARATION",
  "FORM",
  "SIGNATURE",
  "VISIT",
  "REFERENCE",
  "TECHNICAL_REQUIREMENT",
  "FINANCIAL_REQUIREMENT",
  "DEADLINE",
  "DELIVERABLE",
  "OTHER",
];
const REQUIREMENT_LEVELS: ChecklistRequirementLevel[] = ["MANDATORY", "CONDITIONAL", "INFORMATIONAL"];
const CRITICALITIES: ChecklistItemCriticality[] = ["BLOCKING", "HIGH", "MEDIUM", "LOW"];

function statusLabel(status: ChecklistItemStatus): string {
  switch (status) {
    case "TODO":
      return "A faire";
    case "IN_PROGRESS":
      return "En cours";
    case "COMPLETED":
      return "Termine";
    case "NOT_APPLICABLE":
      return "Non applicable";
  }
}

function typeLabel(type: ChecklistItemType): string {
  const labels: Record<ChecklistItemType, string> = {
    ADMINISTRATIVE_DOCUMENT: "Document administratif",
    TECHNICAL_DOCUMENT: "Document technique",
    FINANCIAL_DOCUMENT: "Document financier",
    CERTIFICATION: "Certification",
    INSURANCE: "Assurance",
    DECLARATION: "Déclaration",
    FORM: "Formulaire",
    SIGNATURE: "Signature",
    VISIT: "Visite",
    REFERENCE: "Référence",
    TECHNICAL_REQUIREMENT: "Exigence technique",
    FINANCIAL_REQUIREMENT: "Exigence financière",
    DEADLINE: "Échéance",
    DELIVERABLE: "Livrable",
    OTHER: "Autre",
  };
  return labels[type];
}

function requirementLevelLabel(level: ChecklistRequirementLevel): string {
  switch (level) {
    case "MANDATORY":
      return "Obligatoire";
    case "CONDITIONAL":
      return "Conditionnel";
    case "INFORMATIONAL":
      return "Informatif";
  }
}

function criticalityBadgeClass(criticality: ChecklistItemCriticality): string {
  switch (criticality) {
    case "BLOCKING":
      return "bg-red-100 text-red-800";
    case "HIGH":
      return "bg-orange-100 text-orange-800";
    case "MEDIUM":
      return "bg-amber-100 text-amber-800";
    case "LOW":
      return "bg-neutral-100 text-neutral-700";
  }
}

function complianceStatusLabel(status: ChecklistComplianceStatus): string {
  switch (status) {
    case "TO_REVIEW":
      return "À vérifier";
    case "NON_COMPLIANT":
      return "Non conforme";
    case "READY":
      return "Prêt";
    case "VALIDATED":
      return "Validé";
    case "NOT_APPLICABLE":
      return "Non applicable";
  }
}

function complianceBadgeClass(status: ChecklistComplianceStatus): string {
  switch (status) {
    case "VALIDATED":
      return "bg-green-100 text-green-800";
    case "READY":
      return "bg-blue-100 text-blue-800";
    case "NON_COMPLIANT":
      return "bg-red-100 text-red-800";
    case "NOT_APPLICABLE":
      return "bg-neutral-100 text-neutral-500";
    case "TO_REVIEW":
      return "bg-amber-100 text-amber-800";
  }
}

/** V2 Sprint 6 §7 -> V2 Sprint 7 §12 — une criticité BLOCKING peut SUGGÉRER une priorité URGENT à
 *  la création depuis la checklist, jamais recopiée automatiquement : l'utilisateur confirme
 *  toujours (mission §14), voir le <select> priority ci-dessous, jamais désactivé. */
const CRITICALITY_TO_SUGGESTED_PRIORITY: Record<string, string> = { BLOCKING: "URGENT", HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" };

function ChecklistItemRow({ tenderId, item, lots }: { tenderId: string; item: ChecklistItem; lots: TenderLot[] }) {
  const [status, setStatus] = useState(item.status);
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [matches, setMatches] = useState<ChecklistDocumentMatchResult | undefined>();
  const [isSearchingMatches, setIsSearchingMatches] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);

  const lot = item.lotId ? lots.find((candidate) => candidate.id === item.lotId) : undefined;

  async function runAction(action: () => Promise<{ error?: string }>): Promise<void> {
    setIsPending(true);
    setError(undefined);
    const result = await action();
    setIsPending(false);
    setError(result.error);
  }

  return (
    <li className="flex flex-col gap-2 border-b border-neutral-100 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-neutral-900">{item.title}</span>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-700">{typeLabel(item.type)}</span>
            <span className={`rounded px-1.5 py-0.5 ${criticalityBadgeClass(item.criticality)}`}>{item.criticality}</span>
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-700">{requirementLevelLabel(item.requirementLevel)}</span>
            <span className={`rounded px-1.5 py-0.5 ${complianceBadgeClass(item.complianceStatus)}`}>{complianceStatusLabel(item.complianceStatus)}</span>
            {lot ? <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-800">{lot.title}</span> : <span className="rounded bg-neutral-50 px-1.5 py-0.5 text-neutral-500">Global</span>}
            {item.origin === "AI_SUGGESTION" ? <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-800">Suggéré par l&apos;IA</span> : null}
          </div>
          {item.conditionText ? <p className="text-xs italic text-neutral-500">Condition : {item.conditionText}</p> : null}
          {item.matchedDocumentId ? (
            <p className="text-xs text-neutral-600">
              Document associé — statut : <span className="font-medium">{item.documentStatus}</span>
              {item.documentExpiresAt ? ` (expire le ${new Date(item.documentExpiresAt).toLocaleDateString("fr-FR")})` : ""}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
        </div>
        <select
          value={status}
          disabled={isPending}
          onChange={async (event) => {
            const nextStatus = event.target.value as ChecklistItemStatus;
            setIsPending(true);
            setStatus(nextStatus);
            const result = await changeChecklistItemStatusAction(tenderId, item.id, nextStatus);
            setIsPending(false);
            setError(result.error);
          }}
          className="rounded border border-neutral-300 px-2 py-1 text-xs"
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {statusLabel(value)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {item.complianceStatus !== "VALIDATED" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(() => validateChecklistItemAction(tenderId, item.id))}
            className="rounded border border-green-300 bg-green-50 px-2 py-1 text-xs text-green-800 hover:bg-green-100 disabled:opacity-50"
          >
            Valider
          </button>
        ) : null}
        {item.complianceStatus !== "NOT_APPLICABLE" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(() => markChecklistItemNotApplicableAction(tenderId, item.id))}
            className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            Non applicable
          </button>
        ) : null}
        {!item.matchedDocumentId ? (
          <button
            type="button"
            disabled={isSearchingMatches}
            onClick={async () => {
              setIsSearchingMatches(true);
              const result = await findChecklistItemDocumentMatchesAction(tenderId, item.id);
              setIsSearchingMatches(false);
              setMatches(result.result);
              setError(result.error);
            }}
            className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            {isSearchingMatches ? "Recherche…" : "Rechercher un document"}
          </button>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(() => detachChecklistItemDocumentAction(tenderId, item.id))}
            className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            Dissocier le document
          </button>
        )}
        {!taskCreated ? (
          <button type="button" onClick={() => setShowTaskForm((v) => !v)} className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100">
            Créer une tâche
          </button>
        ) : (
          <span className="text-xs text-neutral-500">Tâche créée — voir l&apos;onglet Workspace.</span>
        )}
      </div>

      {showTaskForm ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded border border-neutral-200 bg-neutral-50 p-2"
          action={async (formData: FormData) => {
            setIsPending(true);
            setError(undefined);
            const dueDate = (formData.get("dueDate") as string) || "";
            const result = await createTaskFromChecklistItemAction(tenderId, {
              title: String(formData.get("title")),
              priority: formData.get("priority") as string,
              checklistItemId: item.id,
              ...(item.lotId ? { lotId: item.lotId } : {}),
              ...(dueDate ? { dueDate } : {}),
            });
            setIsPending(false);
            if (result.error) {
              setError(result.error);
            } else {
              setTaskCreated(true);
              setShowTaskForm(false);
            }
          }}
        >
          {/* Préremplissage indicatif (titre + criticité -> priorité suggérée), jamais
              d'affectation automatique (mission §14 : le responsable/l'échéance/la priorité
              restent à confirmer explicitement par l'utilisateur). */}
          <input name="title" defaultValue={item.title} required className="min-w-56 rounded border border-neutral-300 px-2 py-1 text-xs" />
          <select name="priority" defaultValue={CRITICALITY_TO_SUGGESTED_PRIORITY[item.criticality] ?? "MEDIUM"} className="rounded border border-neutral-300 px-2 py-1 text-xs">
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="URGENT">URGENT</option>
          </select>
          <input name="dueDate" type="date" className="rounded border border-neutral-300 px-2 py-1 text-xs" />
          <button type="submit" disabled={isPending} className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50">
            Créer
          </button>
        </form>
      ) : null}

      {matches ? (
        <div className="rounded border border-neutral-200 bg-neutral-50 p-2 text-xs">
          <p className="mb-1 font-medium text-neutral-700">
            {matches.candidates.length === 0 ? "Aucun document correspondant trouvé." : `Correspondance : ${matches.status}`}
          </p>
          <ul className="flex flex-col gap-1">
            {matches.candidates.map((candidate) => (
              <li key={candidate.documentId} className="flex items-center justify-between gap-2">
                <span>
                  {candidate.label} (score {(candidate.score * 100).toFixed(0)}%)
                </span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    runAction(() =>
                      attachChecklistItemDocumentAction(tenderId, item.id, {
                        documentId: candidate.documentId,
                        documentVersionId: candidate.documentVersionId,
                        matchStatus: matches.status,
                        score: candidate.score,
                        reasons: candidate.reasons,
                        expiresAt: candidate.expiresAt,
                      }),
                    )
                  }
                  className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                >
                  Associer
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function ProgressSummary({ progress }: { progress: ChecklistProgress | null }) {
  if (!progress) return null;
  const { global } = progress;
  const percent = global.totalApplicable === 0 ? 100 : Math.round((global.validated / global.totalApplicable) * 100);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-neutral-200 bg-neutral-50 p-2 text-xs text-neutral-700">
      <span className="font-semibold text-neutral-900">{percent}% prête</span>
      <span>{global.totalApplicable} applicables</span>
      <span>{global.validated} validés</span>
      <span>{global.missing} manquants</span>
      {global.blockingMissing > 0 ? <span className="font-medium text-red-700">{global.blockingMissing} bloquant(s)</span> : null}
      <span>{global.expired} expirés</span>
      <span>{global.toReview} à vérifier</span>
    </div>
  );
}

export function ChecklistSection({
  tenderId,
  items,
  lots,
  progress,
}: {
  tenderId: string;
  items: ChecklistItem[];
  lots: TenderLot[];
  progress: ChecklistProgress | null;
}) {
  const boundAction = createChecklistItemAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);
  const [lotFilter, setLotFilter] = useState<string>("ALL");
  const [reconcileMessage, setReconcileMessage] = useState<string | undefined>();

  const filteredItems = useMemo(() => {
    if (lotFilter === "ALL") return items;
    if (lotFilter === "GLOBAL") return items.filter((item) => !item.lotId);
    return items.filter((item) => item.lotId === lotFilter);
  }, [items, lotFilter]);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-700">Checklist</h2>
        <button
          type="button"
          onClick={async () => {
            const result = await reconcileChecklistWithNewAnalysisAction(tenderId);
            if (result.error) {
              setReconcileMessage(result.error);
            } else if (result.result) {
              setReconcileMessage(
                `${result.result.newRequirementSuggestionsCreated} nouvelle(s) suggestion(s), ${result.result.possibleRemovals.length} élément(s) à vérifier.`,
              );
            }
          }}
          className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
        >
          Comparer avec la dernière analyse
        </button>
      </div>
      {reconcileMessage ? <p className="text-xs text-neutral-600">{reconcileMessage}</p> : null}
      <ProgressSummary progress={progress} />
      {lots.length > 0 ? (
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          Filtrer par lot
          <select value={lotFilter} onChange={(event) => setLotFilter(event.target.value)} className="rounded border border-neutral-300 px-2 py-1">
            <option value="ALL">Tous</option>
            <option value="GLOBAL">Global</option>
            {lots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {filteredItems.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun element de checklist.</p>
      ) : (
        <ul>
          {filteredItems.map((item) => (
            <ChecklistItemRow key={item.id} tenderId={tenderId} item={item} lots={lots} />
          ))}
        </ul>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input
          name="title"
          type="text"
          required
          placeholder="Nouvel element..."
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <select name="type" defaultValue="OTHER" className="rounded border border-neutral-300 px-2 py-1 text-xs">
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {typeLabel(type)}
            </option>
          ))}
        </select>
        <select name="requirementLevel" defaultValue="MANDATORY" className="rounded border border-neutral-300 px-2 py-1 text-xs">
          {REQUIREMENT_LEVELS.map((level) => (
            <option key={level} value={level}>
              {requirementLevelLabel(level)}
            </option>
          ))}
        </select>
        <select name="criticality" defaultValue="MEDIUM" className="rounded border border-neutral-300 px-2 py-1 text-xs">
          {CRITICALITIES.map((criticality) => (
            <option key={criticality} value={criticality}>
              {criticality}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
        >
          Ajouter
        </button>
        {state.error ? (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
