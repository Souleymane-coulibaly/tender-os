/**
 * V2 Sprint 4 — un adaptateur par `entityType` du catalogue AiSuggestion mappable à une donnée
 * métier réelle (TENDER_FIELD, TENDER_LOT_FIELD, TENDER_AWARD_CRITERION,
 * TENDER_REQUESTED_DOCUMENT, TENDER_MILESTONE, TENDER_RISK, BUYER_FIELD). Chaque adaptateur :
 * - lit l'état courant via un port/repository en LECTURE SEULE (jamais Prisma directement) ;
 * - écrit UNIQUEMENT via le use case public du module cible (jamais un repository pour écrire,
 *   jamais un second système de vérité) ;
 * - déclare quels noms de champs sont éligibles à une fusion simple (§12 — jamais dates, montants,
 *   statuts, booléens, SIRET, pondérations, identifiants juridiques, relations métier).
 *
 * Convention `fieldName` : soit un vrai nom de champ de l'entité cible (mise à jour d'une entité
 * EXISTANTE, `entityId` renseigné), soit le sentinel `"__create__"` (proposition de CRÉATION,
 * `entityId` absent) — `proposedValue` porte alors un objet complet correspondant à la commande de
 * création du module cible, jamais un scalaire.
 */
export const CREATE_FIELD_SENTINEL = "__create__";

export type EntityTargetReadInput = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  parentTenderId: string;
  parentLotId: string | undefined;
  entityId: string | undefined;
  fieldName: string;
}>;

export type EntityTargetReadResult = Readonly<{
  /** `false` si l'entité elle-même n'existe pas encore (création) ou si le champ n'a jamais été
   *  renseigné — dans les deux cas, aucun conflit à trancher, l'application est directe. */
  exists: boolean;
  currentValue: unknown;
}>;

export type EntityTargetApplyInput = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  parentTenderId: string;
  parentLotId: string | undefined;
  entityId: string | undefined;
  fieldName: string;
  value: unknown;
  requestId: string | undefined;
}>;

export type EntityTargetApplyResult = Readonly<{ entityId: string }>;

export interface AiSuggestionEntityTargetAdapter {
  readCurrentValue(input: EntityTargetReadInput): Promise<EntityTargetReadResult>;
  applyValue(input: EntityTargetApplyInput): Promise<EntityTargetApplyResult>;
  /** §12 — vrai uniquement pour les champs textuels/listes simples de CETTE entité (jamais
   *  dates/montants/statuts/booléens/SIRET/pondérations/identifiants juridiques). */
  isFieldMergeable(fieldName: string): boolean;
}

/** Registre entityType -> adaptateur, construit par `ai-suggestion-bridge.module.ts`. */
export type AiSuggestionEntityTargetAdapterRegistry = ReadonlyMap<string, AiSuggestionEntityTargetAdapter>;

export const AI_SUGGESTION_ENTITY_TARGET_ADAPTER_REGISTRY = Symbol("AI_SUGGESTION_ENTITY_TARGET_ADAPTER_REGISTRY");
