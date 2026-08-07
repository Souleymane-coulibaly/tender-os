/**
 * Catalogue fermé (CHECK, migration) — mission Sprint 1 §3 "entityType doit utiliser un
 * catalogue fermé et contrôlé". Anticipe le vocabulaire des sprints V2 suivants
 * (TenderOS-V2.0-Blueprint-Technique-Final.md §3/§4) sans qu'aucun mapper métier associé
 * n'existe encore — une valeur du catalogue n'implique aucune logique consommatrice ce sprint.
 */
export const AiSuggestionEntityType = {
  TenderLot: "TENDER_LOT",
  ChecklistItem: "CHECKLIST_ITEM",
  SubcontractorProfile: "SUBCONTRACTOR_PROFILE",
  Dc1: "DC1",
  Dc2: "DC2",
  Dc4: "DC4",
  Attri1: "ATTRI1",
  TechnicalMemoSection: "TECHNICAL_MEMO_SECTION",
  PricingLine: "PRICING_LINE",
  CompanyLegalIdentity: "COMPANY_LEGAL_IDENTITY",
  // V2 Sprint 4 — mapping Finding → AiSuggestion (analyse IA du DCE). Additif, valeurs ci-dessus
  // conservées (y compris celles encore réservées à de futurs sprints).
  TenderField: "TENDER_FIELD",
  TenderLotField: "TENDER_LOT_FIELD",
  TenderAwardCriterion: "TENDER_AWARD_CRITERION",
  TenderRequestedDocument: "TENDER_REQUESTED_DOCUMENT",
  TenderMilestone: "TENDER_MILESTONE",
  TenderRisk: "TENDER_RISK",
  BuyerField: "BUYER_FIELD",
} as const;

export type AiSuggestionEntityType = (typeof AiSuggestionEntityType)[keyof typeof AiSuggestionEntityType];

export const AI_SUGGESTION_ENTITY_TYPES: readonly string[] = Object.values(AiSuggestionEntityType);
