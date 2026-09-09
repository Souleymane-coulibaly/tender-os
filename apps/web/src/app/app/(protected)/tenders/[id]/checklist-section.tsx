"use client";

import { useActionState, useMemo, useState } from "react";
import {
  attachChecklistItemDocumentAction,
  changeChecklistItemStatusAction,
  createChecklistItemAction,
  detachChecklistItemDocumentAction,
  findChecklistItemDocumentMatchesAction,
  markChecklistItemNotApplicableAction,
  promoteChecklistItemToKnowledgeAction,
  reconcileChecklistWithNewAnalysisAction,
  validateChecklistItemAction,
  type FormActionState,
} from "../../../actions";
import { createTaskFromChecklistItemAction } from "../../../workspace-actions";
import { KNOWLEDGE_CATEGORY_LABELS } from "../../../../../lib/knowledge-types";
import {
  CHECKLIST_FRESHNESS_LABELS,
  type ChecklistComplianceStatus,
  type ChecklistDocumentMatchResult,
  type ChecklistFreshnessResult,
  type ChecklistItem,
  type ChecklistItemCriticality,
  type ChecklistItemStatus,
  type ChecklistItemType,
  type ChecklistProgress,
  type ChecklistRequirementLevel,
  type TenderLot,
} from "../../../../../lib/tenders-types";
import { Badge, type BadgeTone } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { EmptyState } from "../../../../../components/ui/empty-state";

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
const REQUIREMENT_LEVELS: ChecklistRequirementLevel[] = [
  "MANDATORY",
  "CONDITIONAL",
  "INFORMATIONAL",
];
const CRITICALITIES: ChecklistItemCriticality[] = ["BLOCKING", "HIGH", "MEDIUM", "LOW"];

const INPUT_CLASS =
  "rounded-lg border border-tenderos-navy/15 px-2.5 py-1.5 text-xs text-tenderos-navy";

function statusLabel(status: ChecklistItemStatus): string {
  switch (status) {
    case "TODO":
      return "À faire";
    case "IN_PROGRESS":
      return "En cours";
    case "COMPLETED":
      return "Terminé";
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

function criticalityTone(criticality: ChecklistItemCriticality): BadgeTone {
  switch (criticality) {
    case "BLOCKING":
      return "danger";
    case "HIGH":
      return "warning";
    case "MEDIUM":
      return "gold";
    case "LOW":
      return "neutral";
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

function complianceTone(status: ChecklistComplianceStatus): BadgeTone {
  switch (status) {
    case "VALIDATED":
      return "success";
    case "READY":
      return "info";
    case "NON_COMPLIANT":
      return "danger";
    case "NOT_APPLICABLE":
      return "neutral";
    case "TO_REVIEW":
      return "warning";
  }
}

/** V2 Sprint 6 §7 -> V2 Sprint 7 §12 — une criticité BLOCKING peut SUGGÉRER une priorité URGENT à
 *  la création depuis la checklist, jamais recopiée automatiquement : l'utilisateur confirme
 *  toujours (mission §14), voir le <select> priority ci-dessous, jamais désactivé. */
const CRITICALITY_TO_SUGGESTED_PRIORITY: Record<string, string> = {
  BLOCKING: "URGENT",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

function ChecklistItemRow({
  tenderId,
  item,
  lots,
}: {
  tenderId: string;
  item: ChecklistItem;
  lots: TenderLot[];
}) {
  const [status, setStatus] = useState(item.status);
  const [error, setError] = useState<string | undefined>();
  const [isPending, setIsPending] = useState(false);
  const [matches, setMatches] = useState<ChecklistDocumentMatchResult | undefined>();
  const [isSearchingMatches, setIsSearchingMatches] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);
  const [showPromoteForm, setShowPromoteForm] = useState(false);
  const [promotedEntryId, setPromotedEntryId] = useState<string | undefined>();

  const lot = item.lotId ? lots.find((candidate) => candidate.id === item.lotId) : undefined;

  async function runAction(action: () => Promise<{ error?: string }>): Promise<void> {
    setIsPending(true);
    setError(undefined);
    const result = await action();
    setIsPending(false);
    setError(result.error);
  }

  return (
    <li className="flex flex-col gap-2 border-b border-tenderos-navy/5 py-3 text-sm last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold text-tenderos-navy">{item.title}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{typeLabel(item.type)}</Badge>
            <Badge tone={criticalityTone(item.criticality)}>{item.criticality}</Badge>
            <Badge tone="neutral">{requirementLevelLabel(item.requirementLevel)}</Badge>
            <Badge tone={complianceTone(item.complianceStatus)}>
              {complianceStatusLabel(item.complianceStatus)}
            </Badge>
            {lot ? <Badge tone="info">{lot.title}</Badge> : <Badge tone="neutral">Global</Badge>}
            {item.origin === "AI_SUGGESTION" ? (
              <Badge tone="gold">Suggéré par l&apos;IA</Badge>
            ) : null}
            {/* Checkpoint 2.1-P2.1-FIX-B — signal ADDITIF, jamais une rétrogradation de
                complianceStatus (mission §20/§21) : un item validé reste affiché "Validé" ci-dessus,
                ce badge attire seulement l'attention sur une exigence disparue/changée depuis. */}
            {item.requirementFreshness === "STALE" ? (
              <Badge tone="warning">Absente de la dernière analyse</Badge>
            ) : null}
          </div>
          {item.conditionText ? (
            <p className="text-xs italic text-tenderos-slate">Condition : {item.conditionText}</p>
          ) : null}
          {item.matchedDocumentId ? (
            <p className="text-xs text-tenderos-slate">
              Document associé — statut :{" "}
              <span className="font-medium text-tenderos-navy">{item.documentStatus}</span>
              {item.documentExpiresAt
                ? ` (expire le ${new Date(item.documentExpiresAt).toLocaleDateString("fr-FR")})`
                : ""}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-danger-fg">
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
          className={INPUT_CLASS}
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
          // Checkpoint TENDEROS-2.1-P2.3-E5.1 (Design System V2, audit hardcode) — remplace
          // `border-green-200 bg-green-50 text-success-fg` (couleur brute) par les jetons sémantiques
          // `success` (Checkpoint A/B), les mêmes que `Badge tone="success"` — jamais un vert propre
          // à cet écran.
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(() => validateChecklistItemAction(tenderId, item.id))}
            className="rounded-lg border border-success-fg/20 bg-success-bg px-2.5 py-1 text-xs font-medium text-success-fg hover:bg-success-fg/10 disabled:opacity-50"
          >
            Valider
          </button>
        ) : null}
        {item.complianceStatus !== "NOT_APPLICABLE" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(() => markChecklistItemNotApplicableAction(tenderId, item.id))}
            className="rounded-lg border border-tenderos-navy/15 px-2.5 py-1 text-xs font-medium text-tenderos-navy hover:bg-tenderos-light disabled:opacity-50"
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
            className="rounded-lg border border-tenderos-navy/15 px-2.5 py-1 text-xs font-medium text-tenderos-navy hover:bg-tenderos-light disabled:opacity-50"
          >
            {isSearchingMatches ? "Recherche…" : "Rechercher un document"}
          </button>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction(() => detachChecklistItemDocumentAction(tenderId, item.id))}
            className="rounded-lg border border-tenderos-navy/15 px-2.5 py-1 text-xs font-medium text-tenderos-navy hover:bg-tenderos-light disabled:opacity-50"
          >
            Dissocier le document
          </button>
        )}
        {!taskCreated ? (
          <button
            type="button"
            onClick={() => setShowTaskForm((v) => !v)}
            className="rounded-lg border border-tenderos-navy/15 px-2.5 py-1 text-xs font-medium text-tenderos-navy hover:bg-tenderos-light"
          >
            Créer une tâche
          </button>
        ) : (
          <span className="text-xs text-tenderos-slate">
            Tâche créée — voir l&apos;onglet Workspace.
          </span>
        )}
        {item.complianceStatus === "VALIDATED" ? (
          !promotedEntryId ? (
            <button
              type="button"
              onClick={() => setShowPromoteForm((v) => !v)}
              className="rounded-lg border border-tenderos-navy/15 px-2.5 py-1 text-xs font-medium text-tenderos-navy hover:bg-tenderos-light"
            >
              Ajouter à la bibliothèque
            </button>
          ) : (
            <a
              href={`/app/knowledge/${promotedEntryId}`}
              className="text-xs font-medium text-tenderos-blue hover:underline"
            >
              Ajoutée à la bibliothèque — voir l&apos;entrée
            </a>
          )
        ) : null}
      </div>

      {showTaskForm ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl bg-tenderos-light p-3"
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
          <input
            name="title"
            defaultValue={item.title}
            required
            className={`min-w-56 ${INPUT_CLASS}`}
          />
          <select
            name="priority"
            defaultValue={CRITICALITY_TO_SUGGESTED_PRIORITY[item.criticality] ?? "MEDIUM"}
            className={INPUT_CLASS}
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="URGENT">URGENT</option>
          </select>
          <input name="dueDate" type="date" className={INPUT_CLASS} />
          <Button type="submit" disabled={isPending}>
            Créer
          </Button>
        </form>
      ) : null}

      {showPromoteForm ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl bg-tenderos-light p-3"
          action={async (formData: FormData) => {
            setIsPending(true);
            setError(undefined);
            const tagsRaw = String(formData.get("tags") ?? "");
            const tags = tagsRaw
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0);
            const result = await promoteChecklistItemToKnowledgeAction(tenderId, item.id, {
              title: String(formData.get("title")),
              category: String(formData.get("category")),
              ...(tags.length > 0 ? { tags } : {}),
            });
            setIsPending(false);
            if (result.error) {
              setError(result.error);
            } else {
              setPromotedEntryId(result.knowledgeEntryId);
              setShowPromoteForm(false);
            }
          }}
        >
          {/* Mission §19/§53 — jamais un titre/une catégorie hérités silencieusement : préremplissage
              indicatif uniquement (titre de l'item), l'utilisateur confirme ou modifie avant l'envoi. */}
          <input
            name="title"
            defaultValue={item.title}
            required
            className={`min-w-56 ${INPUT_CLASS}`}
          />
          <select name="category" defaultValue="ADMINISTRATIVE" className={INPUT_CLASS}>
            {Object.entries(KNOWLEDGE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            name="tags"
            type="text"
            placeholder="Tags (séparés par virgule)"
            className={INPUT_CLASS}
          />
          <Button type="submit" disabled={isPending}>
            Enregistrer
          </Button>
        </form>
      ) : null}

      {matches ? (
        <div className="rounded-xl bg-tenderos-light p-3 text-xs">
          <p className="mb-1 font-semibold text-tenderos-navy">
            {matches.candidates.length === 0
              ? "Aucun document correspondant trouvé."
              : `Correspondance : ${matches.status}`}
          </p>
          <ul className="flex flex-col gap-1">
            {matches.candidates.map((candidate) => (
              <li key={candidate.documentId} className="flex items-center justify-between gap-2">
                <span className="text-tenderos-slate">
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
                  className="rounded-lg border border-tenderos-blue/30 bg-tenderos-blue/10 px-2 py-0.5 font-medium text-tenderos-blue hover:bg-tenderos-blue/20 disabled:opacity-50"
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
  const percent =
    global.totalApplicable === 0
      ? 100
      : Math.round((global.validated / global.totalApplicable) * 100);

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-tenderos-light p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-tenderos-navy">
          {global.validated} / {global.totalApplicable} validés ({percent}%)
        </span>
        {global.blockingMissing > 0 ? (
          <Badge tone="danger">
            {global.blockingMissing} bloquant{global.blockingMissing > 1 ? "s" : ""}
          </Badge>
        ) : null}
      </div>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-white">
        <span
          className="block h-full rounded-full bg-tenderos-blue"
          style={{ width: `${percent}%` }}
        />
      </span>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tenderos-slate">
        <span>
          {global.missing} manquant{global.missing > 1 ? "s" : ""}
        </span>
        <span>
          {global.expired} expiré{global.expired > 1 ? "s" : ""}
        </span>
        <span>{global.toReview} à vérifier</span>
      </div>
    </div>
  );
}

export function ChecklistSection({
  tenderId,
  items,
  lots,
  progress,
  freshness,
}: {
  tenderId: string;
  items: ChecklistItem[];
  lots: TenderLot[];
  progress: ChecklistProgress | null;
  /** Checkpoint 2.1-P2.1-FIX-B — optionnel : `undefined` pour les tests existants et tout appelant
   *  antérieur à ce checkpoint, jamais un bandeau fabriqué en son absence. */
  freshness?: ChecklistFreshnessResult | null;
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
    <Card
      title="Checklist"
      actions={
        <div className="flex items-center gap-2">
          {/* Checkpoint 2.1-P2.1-FIX-B (mission §31) — axe distinct de la fraîcheur de l'analyse
              elle-même (déjà affichée dans l'onglet Analyse) : la Checklist peut avoir besoin
              d'une réconciliation même quand l'analyse est déjà à jour. */}
          {freshness?.checklistFreshness === "RECONCILIATION_REQUIRED" ? (
            <Badge tone="warning">{CHECKLIST_FRESHNESS_LABELS.RECONCILIATION_REQUIRED}</Badge>
          ) : null}
          <Button
            variant="secondary"
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
          >
            Comparer avec la dernière analyse
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {reconcileMessage ? (
          <p className="text-xs text-tenderos-slate">{reconcileMessage}</p>
        ) : null}
        <ProgressSummary progress={progress} />
        {lots.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-tenderos-slate">
            Filtrer par lot
            <select
              value={lotFilter}
              onChange={(event) => setLotFilter(event.target.value)}
              className={INPUT_CLASS}
            >
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
          <EmptyState
            title="Aucun élément de checklist"
            description="Ajoutez un élément manuellement ci-dessous, ou comparez avec la dernière analyse IA pour en suggérer."
          />
        ) : (
          <ul>
            {filteredItems.map((item) => (
              <ChecklistItemRow key={item.id} tenderId={tenderId} item={item} lots={lots} />
            ))}
          </ul>
        )}
        <form
          action={formAction}
          className="flex flex-wrap items-end gap-2 border-t border-tenderos-navy/10 pt-3"
        >
          <input
            name="title"
            type="text"
            required
            placeholder="Nouvel element..."
            className={`text-sm ${INPUT_CLASS}`}
          />
          <select name="type" defaultValue="OTHER" className={INPUT_CLASS}>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {typeLabel(type)}
              </option>
            ))}
          </select>
          <select name="requirementLevel" defaultValue="MANDATORY" className={INPUT_CLASS}>
            {REQUIREMENT_LEVELS.map((level) => (
              <option key={level} value={level}>
                {requirementLevelLabel(level)}
              </option>
            ))}
          </select>
          <select name="criticality" defaultValue="MEDIUM" className={INPUT_CLASS}>
            {CRITICALITIES.map((criticality) => (
              <option key={criticality} value={criticality}>
                {criticality}
              </option>
            ))}
          </select>
          <Button type="submit" variant="primary" disabled={isPending}>
            Ajouter
          </Button>
          {state.error ? (
            <p role="alert" className="text-xs text-danger-fg">
              {state.error}
            </p>
          ) : null}
        </form>
      </div>
    </Card>
  );
}
