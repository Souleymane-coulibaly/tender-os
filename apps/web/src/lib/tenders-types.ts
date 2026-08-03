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
  title: string;
  reference?: string;
  buyerName?: string;
  description?: string;
  publicationDate?: string;
  submissionDeadline?: string;
  procedureType?: string;
  marketType?: string;
  country?: string;
  language?: string;
  source?: string;
  estimatedAmount?: string;
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
  PRIVATE: "Prive",
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
  createdAt: string;
  updatedAt: string;
};

export type ChecklistItemStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "NOT_APPLICABLE";

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
};

export type AwardCriterion = {
  id: string;
  tenderId: string;
  name: string;
  description?: string;
  weight: string;
  parentCriterionId?: string;
  displayOrder: number;
};

export type RequestedDocumentStatus = "PENDING" | "PROVIDED" | "VALIDATED" | "REJECTED";

export type RequestedDocument = {
  id: string;
  tenderId: string;
  name: string;
  category?: string;
  documentType?: string;
  required: boolean;
  description?: string;
  expirationDate?: string;
  status: RequestedDocumentStatus;
  documentId?: string;
  displayOrder: number;
};

export type MilestoneType =
  | "SUBMISSION_DEADLINE"
  | "QUESTION_DEADLINE"
  | "MANDATORY_VISIT"
  | "INTERNAL_VALIDATION"
  | "CUSTOM";
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
};

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskStatus = "OPEN" | "MITIGATED" | "RESOLVED" | "ACCEPTED";

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
};

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";

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
  READY: "Pret",
  IN_PREPARATION: "En preparation",
  READY_TO_SUBMIT: "Pret a soumettre",
  SUBMITTED: "Soumis",
  WON: "Gagne",
  LOST: "Perdu",
  ARCHIVED: "Archive",
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
  ARCHIVED: [],
};

/** Colonnes actives du Kanban — ARCHIVED est un statut terminal retire du pilotage actif,
 *  meme decision que le backend (get-tender-board.use-case.ts). */
export const BOARD_STATUSES: TenderStatus[] = (Object.keys(TENDER_STATUS_LABELS) as TenderStatus[]).filter(
  (status) => status !== "ARCHIVED",
);

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

export type TenderFiltersState = {
  search?: string | undefined;
  status?: TenderStatus | undefined;
  internalOwnerId?: string | undefined;
  clientAccountId?: string | undefined;
  deadlineAfter?: string | undefined;
  deadlineBefore?: string | undefined;
  overdue?: boolean | undefined;
};
