/** Types cote frontend pour le pont Analyse IA -> Suggestions (V2 Sprint 4) — memes formes que
 *  les DTO exposes par l'API (voir apps/api/src/modules/ai-suggestion/application/dtos.ts),
 *  jamais une redefinition divergente. Une `AiSuggestion` reste TOUJOURS une proposition : aucun
 *  champ detecte dans le DCE n'est jamais injecte silencieusement dans le Tender — seule une
 *  decision humaine explicite (Appliquer/Rejeter) ecrit une donnee metier reelle. */

export type AiSuggestionStatus = "PENDING" | "ACCEPTED" | "MODIFIED" | "REJECTED";

export type AiSuggestion = {
  id: string;
  organizationId: string;
  entityType: string;
  entityId?: string;
  fieldName: string;
  parentTenderId: string;
  parentLotId?: string;
  proposedValue: unknown;
  confidence: number;
  sourceDocumentId?: string;
  sourcePage?: number;
  sourceChunkReference?: string;
  status: AiSuggestionStatus;
  createdByProcess: string;
  validatedByUserId?: string;
  validatedAt?: string;
  rejectedAt?: string;
  decisionReason?: string;
  conflictResolution?: string;
  appliedValue?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ConflictResolution = "KEEP_CURRENT" | "REPLACE" | "MERGE" | "REJECT";

/** Libelles FR du catalogue fermé `AiSuggestionEntityType` (backend) — seules les valeurs
 *  effectivement produites par le mapping Sprint 4 (Finding -> AiSuggestion) sont couvertes ;
 *  une valeur inconnue retombe sur elle-meme, jamais une erreur d'affichage. */
export const AI_SUGGESTION_ENTITY_TYPE_LABELS: Record<string, string> = {
  TENDER_FIELD: "Fiche de l'appel d'offres",
  TENDER_LOT_FIELD: "Lot",
  TENDER_AWARD_CRITERION: "Nouveau critère d'attribution",
  TENDER_REQUESTED_DOCUMENT: "Nouvelle pièce demandée",
  TENDER_MILESTONE: "Nouveau jalon",
  TENDER_RISK: "Nouveau risque",
  BUYER_FIELD: "Acheteur",
  CHECKLIST_ITEM: "Nouvel élément de checklist",
};

const CREATE_FIELD_SENTINEL = "__create__";

/** Libellé lisible d'un champ cible — le sentinel de création n'est jamais montré tel quel. */
export function describeSuggestionField(entityType: string, fieldName: string): string {
  if (fieldName === CREATE_FIELD_SENTINEL) {
    return AI_SUGGESTION_ENTITY_TYPE_LABELS[entityType] ?? entityType;
  }
  return fieldName;
}

export function isCreationSuggestion(fieldName: string): boolean {
  return fieldName === CREATE_FIELD_SENTINEL;
}

/** Rendu textuel court d'une valeur proposée, quelle que soit sa forme (scalaire ou objet de
 *  création) — jamais un `[object Object]` brut. */
export function formatSuggestionValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => formatSuggestionValue(item)).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, v]) => `${key} : ${formatSuggestionValue(v)}`)
      .join(" · ");
  }
  return String(value);
}

/** Même palier que `canTriggerAnalysis` (analysis-types.ts) — ROLE_AI_SUGGESTION_PERMISSIONS
 *  (backend) accorde Decide/Trigger exactement aux mêmes rôles. Gate d'affichage uniquement,
 *  jamais l'autorité réelle (revalidée par l'API à chaque requête). */
const ROLES_ALLOWED_TO_MANAGE_AI_SUGGESTIONS = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER", "CONTRIBUTOR"];

export function canManageAiSuggestions(role: string | undefined): boolean {
  return role !== undefined && ROLES_ALLOWED_TO_MANAGE_AI_SUGGESTIONS.includes(role);
}
