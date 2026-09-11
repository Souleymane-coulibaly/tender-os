export type PageResponse<T> = {
  items: T[];
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
};

export type TenderStatus =
  | "DRAFT"
  | "IN_ANALYSIS"
  | "READY"
  | "IN_PREPARATION"
  | "READY_TO_SUBMIT"
  | "SUBMITTED"
  | "WON"
  | "LOST"
  | "ARCHIVED";

export type Tender = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  candidateCompanyId?: string;
  title: string;
  reference?: string;
  buyerName?: string;
  buyerId?: string;
  description?: string;
  publicationDate?: string;
  submissionDeadline?: string;
  submissionDeadlineTimezone?: string;
  questionsDeadline?: string;
  visitDate?: string;
  visitMandatory?: boolean;
  contractDurationMonths?: number;
  renewalDurationMonths?: number;
  renewalCount?: number;
  estimatedStartDate?: string;
  executionLocation?: string;
  geographicZone?: string;
  isFrameworkAgreement?: boolean;
  awardType?: string;
  variantsAllowed?: boolean;
  pseAllowed?: boolean;
  electronicResponseMandatory?: boolean;
  signatureRequired?: boolean;
  submissionPlatformUrl?: string;
  internalNotes?: string;
  procedureType?: string;
  marketType?: string;
  country?: string;
  language?: string;
  source?: string;
  estimatedAmount?: string;
  minimumAmount?: string;
  maximumAmount?: string;
  currency?: string;
  internalOwnerId?: string;
  status: TenderStatus;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  version: number;
};

/** V2 Sprint 3 §5 — acheteur/donneur d'ordre, jamais un ClientAccount, reutilisable par plusieurs
 *  Tenders de la meme organisation (voir apps/api/.../domain/buyer.entity.ts). */
export type Buyer = {
  id: string;
  organizationId: string;
  name: string;
  legalName?: string;
  identifier?: string;
  siret?: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  buyerType?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  profileUrl?: string;
  notes?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export const AWARD_TYPES = ["MONO_AWARDEE", "MULTI_AWARDEE"] as const;
export type AwardType = (typeof AWARD_TYPES)[number];
export const AWARD_TYPE_LABELS: Record<AwardType, string> = {
  MONO_AWARDEE: "Mono-attributaire",
  MULTI_AWARDEE: "Multi-attributaire",
};

/** V2 Sprint 3 §15 — indicateur de completude par categorie, jamais un score global ni GO/NO-GO. */
export const TENDER_COMPLETENESS_STATUSES = [
  "COMPLETE",
  "PARTIAL",
  "MISSING",
  "INCONSISTENT",
  "TO_VERIFY",
] as const;
export type TenderCompletenessStatus = (typeof TENDER_COMPLETENESS_STATUSES)[number];
export const TENDER_COMPLETENESS_STATUS_LABELS: Record<TenderCompletenessStatus, string> = {
  COMPLETE: "Complet",
  PARTIAL: "Partiel",
  MISSING: "Manquant",
  INCONSISTENT: "Incohérent",
  TO_VERIFY: "À vérifier",
};

export type TenderCompleteness = {
  generalInformation: TenderCompletenessStatus;
  candidate: TenderCompletenessStatus;
  buyer: TenderCompletenessStatus;
  dates: TenderCompletenessStatus;
  lots: TenderCompletenessStatus;
  criteria: TenderCompletenessStatus;
  checklist: TenderCompletenessStatus;
  milestones: TenderCompletenessStatus;
  risks: TenderCompletenessStatus;
};

export const TENDER_COMPLETENESS_CATEGORY_LABELS: Record<keyof TenderCompleteness, string> = {
  generalInformation: "Informations générales",
  // Checkpoint 2.1-A5 — ce champ backend s'appelle "candidate" par convention historique (avant
  // l'introduction de CandidateCompany, A1-A4) mais porte en réalité la complétude de la fiche
  // légale du CLIENT (ClientAccount). Libellé corrigé ici ; la clé reste inchangée pour matcher le
  // JSON de l'API (aucune modification backend en A5).
  candidate: "Client",
  buyer: "Acheteur",
  dates: "Dates",
  lots: "Lots",
  criteria: "Critères",
  checklist: "Checklist",
  milestones: "Jalons",
  risks: "Risques",
};

/** Profil consolide (mission §14) — jamais les donnees bancaires/sensibles du candidat, jamais un
 *  score GO/NO-GO, jamais d'analyse IA. */
export type TenderProfile = {
  tender: Tender;
  candidate: { id: string; name: string; status: string };
  buyer: Buyer | null;
  lots: TenderLot[];
  criteria: AwardCriterion[];
  milestones: Milestone[];
  risks: Risk[];
  statusHistory: StatusHistoryEntry[];
  completeness: TenderCompleteness;
};

/**
 * Enums Tender (miroir cote frontend de apps/api/src/modules/tenders/interfaces/http/schemas.ts —
 * MARKET_TYPES/TENDER_COUNTRIES/TENDER_LANGUAGES/TENDER_SOURCES — et des value objects domain
 * correspondants : market-type.ts, tender-country.ts, tender-language.ts, tender-source.ts).
 * Aucun package partage n'existe entre apps/web et apps/api dans cette tranche : ce fichier reste
 * la SEULE source cote frontend, jamais dupliquee ailleurs dans apps/web.
 */
export const MARKET_TYPES = ["PUBLIC", "PRIVATE"] as const;
export type MarketType = (typeof MARKET_TYPES)[number];
export const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  PUBLIC: "Public",
  PRIVATE: "Privé",
};

export const TENDER_COUNTRIES = ["FR", "BE", "DE", "ES", "IT", "LU", "NL", "EU", "OTHER"] as const;
export type TenderCountry = (typeof TENDER_COUNTRIES)[number];
export const TENDER_COUNTRY_LABELS: Record<TenderCountry, string> = {
  FR: "France",
  BE: "Belgique",
  DE: "Allemagne",
  ES: "Espagne",
  IT: "Italie",
  LU: "Luxembourg",
  NL: "Pays-Bas",
  EU: "Union europeenne",
  OTHER: "Autre",
};

export const TENDER_LANGUAGES = ["fr", "en", "de", "es", "it", "nl"] as const;
export type TenderLanguage = (typeof TENDER_LANGUAGES)[number];
export const TENDER_LANGUAGE_LABELS: Record<TenderLanguage, string> = {
  fr: "Francais",
  en: "Anglais",
  de: "Allemand",
  es: "Espagnol",
  it: "Italien",
  nl: "Neerlandais",
};

export const TENDER_SOURCES = ["MANUAL", "BOAMP", "TED", "PRIVATE", "OTHER"] as const;
export type TenderSource = (typeof TENDER_SOURCES)[number];
export const TENDER_SOURCE_LABELS: Record<TenderSource, string> = {
  MANUAL: "Saisie manuelle",
  BOAMP: "BOAMP",
  TED: "TED",
  PRIVATE: "Plateforme privee",
  OTHER: "Autre",
};

/** Devise : aucun enum backend (simple chaine ISO 4217 sur 3 caracteres, voir
 *  CreateTenderBodySchema) — liste restreinte aux devises les plus courantes pour cette tranche,
 *  jamais une contrainte plus stricte que le backend (n'importe quelle chaine de 3 lettres reste
 *  acceptee par l'API). */
export const TENDER_CURRENCIES = ["EUR", "USD", "GBP", "CHF"] as const;
export type TenderCurrencyOption = (typeof TENDER_CURRENCIES)[number];

// Valeurs par defaut d'une creation manuelle standard en France (mission "Valeurs par defaut
// attendues") — identiques a celles deja appliquees cote backend (create-tender.use-case.ts) si le
// champ est omis : les fixer aussi cote formulaire n'ajoute qu'un confort de saisie explicite,
// jamais une divergence avec le backend.
export const DEFAULT_TENDER_MARKET_TYPE: MarketType = "PUBLIC";
export const DEFAULT_TENDER_COUNTRY: TenderCountry = "FR";
export const DEFAULT_TENDER_LANGUAGE: TenderLanguage = "fr";
export const DEFAULT_TENDER_CURRENCY: TenderCurrencyOption = "EUR";
export const DEFAULT_TENDER_SOURCE: TenderSource = "MANUAL";

/** Meme regle que TenderLot (domain/estimated-amount.ts, AUDIT-003) — Decimal(19,4) cote Prisma :
 *  jusqu'a 15 chiffres avant la virgule, 4 apres, strictement positif. Le Tender racine n'impose
 *  pas encore cette regle cote backend (seul TenderLot l'applique), mais l'appliquer cote
 *  formulaire evite d'envoyer une chaine qu'aucune Decimal Postgres ne peut de toute facon
 *  representer correctement. */
const ESTIMATED_AMOUNT_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

export function isValidEstimatedAmount(value: string): boolean {
  if (!ESTIMATED_AMOUNT_PATTERN.test(value)) return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

export type TenderLot = {
  id: string;
  tenderId: string;
  lotNumber: string;
  title: string;
  description?: string;
  estimatedAmount?: string;
  currency?: string;
  displayOrder: number;
  code?: string;
  cpvMain?: string;
  cpvSecondary: string[];
  executionLocation?: string;
  durationMonths?: number;
  estimatedStartDate?: string;
  minimumAmount?: string;
  maximumAmount?: string;
  selectedForResponse: boolean;
  soloAllowed: boolean;
  groupAllowed: boolean;
  variantsAllowed?: boolean;
  pseAllowed?: boolean;
  specificVisitRequired?: boolean;
  specificVisitDate?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
};

export type ChecklistItemStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "NOT_APPLICABLE";

// V2 Sprint 6 — catalogues gouvernés, doivent rester synchronisés avec
// `tenders/domain/checklist-item.entity.ts` (API).
export type ChecklistItemType =
  | "ADMINISTRATIVE_DOCUMENT"
  | "TECHNICAL_DOCUMENT"
  | "FINANCIAL_DOCUMENT"
  | "CERTIFICATION"
  | "INSURANCE"
  | "DECLARATION"
  | "FORM"
  | "SIGNATURE"
  | "VISIT"
  | "REFERENCE"
  | "TECHNICAL_REQUIREMENT"
  | "FINANCIAL_REQUIREMENT"
  | "DEADLINE"
  | "DELIVERABLE"
  | "OTHER";
export type ChecklistRequirementLevel = "MANDATORY" | "CONDITIONAL" | "INFORMATIONAL";
export type ChecklistItemCriticality = "BLOCKING" | "HIGH" | "MEDIUM" | "LOW";

/** Criticité d'un élément de checklist, telle qu'affichée. */
export const CHECKLIST_CRITICALITY_LABELS: Record<ChecklistItemCriticality, string> = {
  BLOCKING: "Bloquante",
  HIGH: "Élevée",
  MEDIUM: "Moyenne",
  LOW: "Faible",
};
export type ChecklistComplianceStatus =
  "TO_REVIEW" | "NON_COMPLIANT" | "READY" | "VALIDATED" | "NOT_APPLICABLE";
export type ChecklistDocumentStatus = "MISSING" | "AVAILABLE" | "EXPIRED";
export type ChecklistItemOrigin = "MANUAL" | "AI_SUGGESTION" | "SYSTEM";
export type ChecklistSubjectType =
  "CANDIDATE" | "GROUP_MEMBER" | "SUBCONTRACTOR" | "ANY_MEMBER" | "TENDER" | "LOT";
export type ChecklistDocumentMatchStatus =
  | "NOT_SEARCHED"
  | "EXACT_MATCH"
  | "PROBABLE_MATCH"
  | "MULTIPLE_CANDIDATES"
  | "NO_MATCH"
  | "MANUALLY_ATTACHED";

/** Checkpoint 2.1-P2.1-FIX-B — axe ORTHOGONAL à `complianceStatus` (jamais confondus, mission
 *  §15) : reflète si CETTE exigence a été retrouvée dans la dernière analyse réconciliée, jamais
 *  si elle est conforme. `undefined` uniquement pour un item créé avant ce checkpoint. */
export type ChecklistRequirementFreshness = "CURRENT" | "STALE";

export type ChecklistItem = {
  id: string;
  tenderId: string;
  title: string;
  description?: string;
  required: boolean;
  status: ChecklistItemStatus;
  assignedTo?: string;
  dueDate?: string;
  comment?: string;
  completedAt?: string;
  completedBy?: string;
  displayOrder: number;
  type: ChecklistItemType;
  requirementLevel: ChecklistRequirementLevel;
  conditionText?: string;
  criticality: ChecklistItemCriticality;
  complianceStatus: ChecklistComplianceStatus;
  documentStatus: ChecklistDocumentStatus;
  origin: ChecklistItemOrigin;
  subjectType: ChecklistSubjectType;
  subjectSubcontractorProfileId?: string;
  lotId?: string;
  matchedDocumentId?: string;
  matchedDocumentVersionId?: string;
  documentMatchStatus: ChecklistDocumentMatchStatus;
  documentMatchScore?: number;
  documentMatchReasons?: string[];
  documentExpiresAt?: string;
  documentValidityCheckedAt?: string;
  requirementFreshness?: ChecklistRequirementFreshness;
};

/** Checkpoint 2.1-P2.1-FIX-B — lecture seule, jamais un 404 (l'onglet Checklist doit s'afficher
 *  même avant la première analyse). Deux axes délibérément distincts (mission §31) :
 *  `analysisFreshness` ("l'analyse est-elle à jour vs le DCE ?") et `checklistFreshness` ("la
 *  Checklist a-t-elle été réconciliée contre la DERNIÈRE analyse ?") — une Checklist peut avoir
 *  besoin d'une réconciliation même quand l'analyse est déjà CURRENT. */
export type ChecklistFreshness = "CURRENT" | "RECONCILIATION_REQUIRED";

export type ChecklistFreshnessResult = {
  analysisVersion?: number;
  analysisFreshness?: "CURRENT" | "STALE" | "UNKNOWN";
  lastReconciledAnalysisVersion?: number;
  checklistFreshness: ChecklistFreshness;
};

export const CHECKLIST_FRESHNESS_LABELS: Record<ChecklistFreshness, string> = {
  CURRENT: "Réconciliée",
  RECONCILIATION_REQUIRED: "Réconciliation requise",
};

export const CHECKLIST_REQUIREMENT_FRESHNESS_LABELS: Record<ChecklistRequirementFreshness, string> =
  {
    CURRENT: "Retrouvée dans la dernière analyse",
    STALE: "Absente de la dernière analyse",
  };

export type ChecklistProgressCounts = {
  totalApplicable: number;
  ready: number;
  validated: number;
  missing: number;
  blockingMissing: number;
  expired: number;
  toReview: number;
};

export type ChecklistProgress = {
  global: ChecklistProgressCounts;
  byLot: Record<string, ChecklistProgressCounts>;
};

export type ChecklistDocumentMatchCandidate = {
  documentId: string;
  documentVersionId?: string;
  label: string;
  expiresAt?: string;
  score: number;
  reasons: string[];
};

export type ChecklistDocumentMatchResult = {
  status: ChecklistDocumentMatchStatus;
  candidates: ChecklistDocumentMatchCandidate[];
};

export type AwardCriterion = {
  id: string;
  tenderId: string;
  name: string;
  description?: string;
  weight: string;
  parentCriterionId?: string;
  displayOrder: number;
  lotId?: string;
  type?: string;
  scoringMethod?: string;
  eliminationThreshold?: string;
  status: string;
};

export type MilestoneType =
  | "SUBMISSION_DEADLINE"
  | "QUESTION_DEADLINE"
  | "MANDATORY_VISIT"
  | "INTERNAL_VALIDATION"
  | "CUSTOM";

/** Type d'échéance, tel qu'affiché. */
export const MILESTONE_TYPE_LABELS: Record<MilestoneType, string> = {
  SUBMISSION_DEADLINE: "Date limite de dépôt",
  QUESTION_DEADLINE: "Date limite des questions",
  MANDATORY_VISIT: "Visite obligatoire",
  INTERNAL_VALIDATION: "Validation interne",
  CUSTOM: "Autre",
};
export type MilestoneStatus = "PENDING" | "DONE";

export type Milestone = {
  id: string;
  tenderId: string;
  title: string;
  description?: string;
  date: string;
  type: MilestoneType;
  status: MilestoneStatus;
  responsibleUserId?: string;
  overdue: boolean;
  timezone?: string;
  lotId?: string;
  mandatory: boolean;
  completedAt?: string;
};

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Gravité d'un risque, telle qu'affichée. */
export const RISK_SEVERITY_LABELS: Record<RiskSeverity, string> = {
  LOW: "Faible",
  MEDIUM: "Moyenne",
  HIGH: "Élevée",
  CRITICAL: "Critique",
};
export type RiskStatus = "OPEN" | "MITIGATED" | "RESOLVED" | "ACCEPTED";

/** Statut d'un risque, tel qu'affiché. */
export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
  OPEN: "Ouvert",
  MITIGATED: "Atténué",
  RESOLVED: "Résolu",
  ACCEPTED: "Accepté",
};

export type Risk = {
  id: string;
  tenderId: string;
  title: string;
  description?: string;
  severity: RiskSeverity;
  source?: string;
  status: RiskStatus;
  mitigation?: string;
  assignedTo?: string;
  resolvedAt?: string;
  category?: string;
  probability?: string;
  impact?: string;
  lotId?: string;
  origin: string;
};

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";

/** Gravité d'une alerte, telle qu'affichée. */
export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  CRITICAL: "Critique",
  WARNING: "Avertissement",
  INFO: "Information",
};

export type Alert = {
  id: string;
  tenderId: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  source?: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
};

export type StatusHistoryEntry = {
  id: string;
  previousStatus: string | null;
  newStatus: string;
  reason: string | null;
  changedBy: string;
  changedAt: string;
};

export type ReadinessStatus = "NOT_READY" | "IN_PROGRESS" | "READY_WITH_WARNINGS" | "READY";

export type ReadinessBreakdownEntry = {
  label: string;
  weight: number;
  achievedRatio: number;
  points: number;
};

export type Readiness = {
  score: number;
  status: ReadinessStatus;
  completedItems: number;
  remainingItems: number;
  criticalAlerts: number;
  warnings: number;
  breakdown: ReadinessBreakdownEntry[];
  disclaimer: string;
};

export type MyMembership = {
  id: string;
  role: string;
  status: string;
  organization: { id: string; name: string; slug: string };
};

export const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  DRAFT: "Brouillon",
  IN_ANALYSIS: "En analyse",
  READY: "Prêt",
  IN_PREPARATION: "En préparation",
  READY_TO_SUBMIT: "Prêt à soumettre",
  SUBMITTED: "Soumis",
  WON: "Gagné",
  LOST: "Perdu",
  ARCHIVED: "Archivé",
};

export const ALLOWED_TENDER_TRANSITIONS: Record<TenderStatus, TenderStatus[]> = {
  DRAFT: ["IN_ANALYSIS", "ARCHIVED"],
  IN_ANALYSIS: ["READY", "DRAFT", "ARCHIVED"],
  READY: ["IN_PREPARATION", "IN_ANALYSIS", "ARCHIVED"],
  IN_PREPARATION: ["READY_TO_SUBMIT", "READY", "ARCHIVED"],
  READY_TO_SUBMIT: ["SUBMITTED", "IN_PREPARATION", "ARCHIVED"],
  SUBMITTED: ["WON", "LOST", "ARCHIVED"],
  WON: ["ARCHIVED"],
  LOST: ["ARCHIVED"],
  // V2 Sprint 3 §7/§29 — correctif : la restauration (ARCHIVED -> DRAFT) est desormais possible,
  // via une action dediee (bouton "Restaurer"), jamais via ce selecteur de statut generique.
  ARCHIVED: ["DRAFT"],
};

/** Colonnes actives du Kanban — ARCHIVED est un statut terminal retire du pilotage actif,
 *  meme decision que le backend (get-tender-board.use-case.ts). */
export const BOARD_STATUSES: TenderStatus[] = (
  Object.keys(TENDER_STATUS_LABELS) as TenderStatus[]
).filter((status) => status !== "ARCHIVED");

export type TenderBoardItem = {
  id: string;
  clientAccountId: string;
  title: string;
  reference?: string;
  buyerName?: string;
  submissionDeadline?: string;
  internalOwnerId?: string;
  status: TenderStatus;
  readinessScore: number;
  readinessStatus: ReadinessStatus;
  openRisksCount: number;
  incompleteChecklistCount: number;
  overdue: boolean;
  updatedAt: string;
};

export type TenderListItem = TenderBoardItem & { createdAt: string; version: number };

export type TenderBoardColumn = {
  status: TenderStatus;
  totalCount: number;
  items: TenderBoardItem[];
};

export type TenderBoard = { columns: TenderBoardColumn[] };

export type TenderStatistics = {
  totalActive: number;
  byStatus: Record<string, number>;
  deadlinesNext7Days: number;
  overdueCount: number;
  readyToSubmitCount: number;
  atRiskCount: number;
  averageReadinessScore: number;
  disclaimer: string;
};

/** Miroir cote UI de ROLE_TENDER_PERMISSIONS (tender-permission.ts) pour ce seul role
 *  "tender:update" — sert uniquement a griser le glisser-depose / masquer l'action ;
 *  la seule autorite reelle reste la revalidation backend a chaque requete. */
// Mission Sprint 8A.2 (audit Cockpit Bid Manager) — OWNER manquait ici (miroir jamais mis à jour
// après le correctif backend OWNER de tender-permission.ts), masquant le changement de statut/le
// glisser-déposer pour un propriétaire d'organisation bien qu'autorisé côté API.
const ROLES_ALLOWED_TO_CHANGE_STATUS = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"];

export function canChangeTenderStatus(role: string | undefined): boolean {
  return role !== undefined && ROLES_ALLOWED_TO_CHANGE_STATUS.includes(role);
}

/** AUDIT-005 : les lots reutilisent la permission tender:update (aucune permission dediee,
 *  decision validee) — memes roles habilites que canChangeTenderStatus. Gate d'affichage
 *  uniquement ; le backend revalide tender:update a chaque requete quoi que montre l'UI. */
export function canManageTenderLots(role: string | undefined): boolean {
  return role !== undefined && ROLES_ALLOWED_TO_CHANGE_STATUS.includes(role);
}

/** Meme permission backend que canManageTenderLots (tender:update) — reutilisee telle quelle,
 *  jamais une seconde matrice de roles dupliquee : editer les champs Tender (titre, acheteur,
 *  type de marche, pays...) exige la meme permission que gerer les lots. */
export function canEditTenderDetails(role: string | undefined): boolean {
  return canManageTenderLots(role);
}

/** Miroir de ClientPermission.ChangeTenderCandidate (mission §4/§16) — reserve au palier
 *  organisation ici (le detail fin CLIENT_MANAGER-vs-CONTRIBUTOR reste une decision serveur,
 *  cette fonction ne fait que grossierement afficher/masquer le controle cote UI).
 *  Checkpoint 2.1-A5 — renomme depuis `canChangeTenderCandidate` : cette permission gouverne le
 *  changement du CLIENT (ClientAccount) du Tender (route legacy `/tenders/:id/candidate`, nom
 *  backend historique), jamais la CandidateCompany (route distincte `/tenders/:id/candidate-company`,
 *  voir `canChangeTenderCandidateCompany`). */
const ROLES_ALLOWED_TO_CHANGE_CLIENT = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"];

export function canChangeTenderClient(role: string | undefined): boolean {
  return role !== undefined && ROLES_ALLOWED_TO_CHANGE_CLIENT.includes(role);
}

/** Miroir de Tender.CANDIDATE_CHANGE_ALLOWED_STATUSES (domain/tender.aggregate.ts) — le
 *  changement de CLIENT n'est propose que tant que la preparation de la reponse n'a pas vraiment
 *  commence. Affichage seul ; le backend revalide systematiquement.
 *  Checkpoint 2.1-A5 — renomme depuis `canOfferCandidateChange`/`CANDIDATE_CHANGE_ALLOWED_STATUSES`. */
const CLIENT_CHANGE_ALLOWED_STATUSES: TenderStatus[] = ["DRAFT", "IN_ANALYSIS"];

export function canOfferClientChange(status: TenderStatus): boolean {
  return CLIENT_CHANGE_ALLOWED_STATUSES.includes(status);
}

/** Checkpoint 2.1-A5 — même discipline que `canChangeTenderClient` mais pour la vraie
 *  CandidateCompany (A1-A4), route `/tenders/:id/candidate-company`
 *  (`ChangeTenderCandidateCompanyUseCase`, garde client-tier `assertTenderMutationAllowed`). */
export function canChangeTenderCandidateCompany(role: string | undefined): boolean {
  return role !== undefined && ROLES_ALLOWED_TO_CHANGE_CLIENT.includes(role);
}

export function canOfferCandidateCompanyChange(status: TenderStatus): boolean {
  return CLIENT_CHANGE_ALLOWED_STATUSES.includes(status);
}

export type TenderFiltersState = {
  search?: string | undefined;
  status?: TenderStatus | undefined;
  internalOwnerId?: string | undefined;
  clientAccountId?: string | undefined;
  deadlineAfter?: string | undefined;
  deadlineBefore?: string | undefined;
  overdue?: boolean | undefined;
};
