/** Types cote frontend pour le module Opportunity / GO-NO-GO IA (V2 Sprint 5) — memes formes que
 *  les DTO exposes par l'API (voir apps/api/src/modules/opportunity/application/dtos.ts et
 *  application/ports/*.ts), jamais une redefinition divergente. */

export type OpportunityStatus = "DRAFT" | "TO_QUALIFY" | "QUALIFIED" | "GO" | "GO_CONDITIONAL" | "NO_GO" | "PROMOTED" | "DISMISSED" | "ARCHIVED";
export type OpportunitySource = "MANUAL" | "BOAMP" | "TED" | "PRIVATE";
export type GoNoGoDecisionValue = "GO" | "GO_CONDITIONAL" | "NO_GO";
export type GoNoGoDecisionLevel = "OPPORTUNITY" | "TENDER";

export type Opportunity = {
  id: string;
  organizationId: string;
  clientAccountId?: string | undefined;
  candidateCompanyId?: string | undefined;
  buyerId?: string | undefined;
  title: string;
  description?: string | undefined;
  source: OpportunitySource;
  externalReference?: string | undefined;
  buyerName?: string | undefined;
  sector?: string | undefined;
  cpvCode?: string | undefined;
  location?: string | undefined;
  geographicZone?: string | undefined;
  publicationDate?: string | undefined;
  submissionDeadline?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  procedureType?: string | undefined;
  status: OpportunityStatus;
  tenderId?: string | undefined;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | undefined;
  version: number;
};

/** Une catégorie de score — TOUJOURS affichée avec son poids et sa justification, jamais un simple
 *  pourcentage isolé (mission "montrer POURQUOI un score est ce qu'il est"). */
export type ScoredCategory = { score: number; weight: number; justification: string };
export type ScoreCause = { category: string; description: string; weight: number; source: string; justification: string };

export type Level1Category = "certifications" | "administratif" | "conformiteGenerale" | "technique" | "references" | "financier" | "ressources" | "planning";
export type Level2Category = "certifications" | "administratif" | "technique" | "references" | "financier" | "ressources" | "planning";

export type OpportunityQuickScore = {
  id: string;
  organizationId: string;
  opportunityId: string;
  scoreVersion: number;
  calculationVersion: string;
  requestedByUserId?: string | undefined;
  createdAt: string;
  globalScore: number;
  confidence: number;
  complexity: number;
  categoryScores: Record<Level1Category, ScoredCategory>;
  strengths: ScoreCause[];
  weaknesses: ScoreCause[];
  blockers: ScoreCause[];
  missingData: string[];
};

export type DocumentaryLoad = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type PrepTimeLevel = "LOW" | "MEDIUM" | "HIGH";
export type GoNoGoRecommendation = "GO" | "GO_CONDITIONAL" | "NO_GO";

/** Checkpoint 2.1-P2.1-FIX-C — jamais persistée côté backend, recalculée à chaque lecture en
 *  comparant les sources figées (candidate/analysisVersion/dceRevision) à l'état courant. Checklist
 *  est délibérément absente : depuis la fusion des « Pièces demandées », le GO/NO-GO lit les
 *  éléments documentaires de la checklist, mais leur évolution ne rend pas un rapport périmé —
 *  pas plus que celle des pièces demandées auparavant. */
export type GoNoGoFreshness = "CURRENT" | "STALE" | "UNKNOWN";

export type GoNoGoReport = {
  id: string;
  organizationId: string;
  tenderId: string;
  reportVersion: number;
  analysisVersion: number;
  dceRevision?: number | undefined;
  calculationVersion: string;
  requestedByUserId?: string | undefined;
  generatedAt: string;
  globalScore: number;
  confidence: number;
  complexity: number;
  documentaryLoad: DocumentaryLoad;
  estimatedPrepTime: { administratif: PrepTimeLevel; memoireTechnique: PrepTimeLevel; pricing: PrepTimeLevel; documents: PrepTimeLevel; validation: PrepTimeLevel };
  categoryScores: Record<Level2Category, ScoredCategory>;
  positiveCauses: ScoreCause[];
  negativeCauses: ScoreCause[];
  risks: ScoreCause[];
  blockers: ScoreCause[];
  missingInfo: string[];
  subcontractingFlags: string[];
  recommendation: GoNoGoRecommendation;
  recommendationRationale: string;
  candidateCompanyId?: string | undefined;
  candidateStale?: boolean | undefined;
  freshness?: GoNoGoFreshness | undefined;
  analysisStale?: boolean | undefined;
  dceStale?: boolean | undefined;
};

export type GoNoGoDecision = {
  id: string;
  organizationId: string;
  level: GoNoGoDecisionLevel;
  opportunityId?: string | undefined;
  tenderId?: string | undefined;
  linkedQuickScoreId?: string | undefined;
  linkedReportId?: string | undefined;
  decision: GoNoGoDecisionValue;
  justification?: string | undefined;
  conditions?: string | undefined;
  comment?: string | undefined;
  actorId: string;
  decidedAt: string;
};

export type PromoteOpportunityResult = { opportunity: Opportunity; tender: { id: string; [key: string]: unknown }; alreadyPromoted: boolean };

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  DRAFT: "Brouillon",
  TO_QUALIFY: "À qualifier",
  QUALIFIED: "Qualifiée",
  GO: "GO",
  GO_CONDITIONAL: "GO conditionnel",
  NO_GO: "NO GO",
  PROMOTED: "Promue en appel d'offres",
  DISMISSED: "Écartée",
  ARCHIVED: "Archivée",
};

export const OPPORTUNITY_STATUS_BADGE_CLASSES: Record<OpportunityStatus, string> = {
  DRAFT: "bg-neutral-100 text-neutral-700",
  TO_QUALIFY: "bg-blue-100 text-blue-800",
  QUALIFIED: "bg-blue-100 text-blue-800",
  GO: "bg-green-100 text-green-800",
  GO_CONDITIONAL: "bg-amber-100 text-amber-800",
  NO_GO: "bg-red-100 text-red-800",
  PROMOTED: "bg-purple-100 text-purple-800",
  DISMISSED: "bg-neutral-200 text-neutral-600",
  ARCHIVED: "bg-neutral-200 text-neutral-600",
};

/** Funnel amont manuel uniquement (mission §5) — GO/GO_CONDITIONAL/NO_GO/PROMOTED ne sont JAMAIS
 *  atteignables via ce sélecteur générique (backend : `ChangeOpportunityStatusUseCase`), seulement
 *  via une décision GO/NO-GO ou la promotion. Même motif que `ALLOWED_TENDER_TRANSITIONS`. */
export const ALLOWED_OPPORTUNITY_MANUAL_TRANSITIONS: Partial<Record<OpportunityStatus, OpportunityStatus[]>> = {
  DRAFT: ["TO_QUALIFY", "DISMISSED"],
  TO_QUALIFY: ["QUALIFIED", "DRAFT", "DISMISSED"],
  QUALIFIED: ["TO_QUALIFY", "DISMISSED"],
  NO_GO: ["DISMISSED"],
  DISMISSED: [],
  ARCHIVED: ["DRAFT"],
};

export const OPPORTUNITY_SOURCE_LABELS: Record<OpportunitySource, string> = {
  MANUAL: "Saisie manuelle",
  BOAMP: "BOAMP",
  TED: "TED",
  PRIVATE: "Marché privé",
};

export const LEVEL_1_CATEGORY_LABELS: Record<Level1Category, string> = {
  certifications: "Certifications",
  administratif: "Administratif",
  conformiteGenerale: "Conformité générale",
  technique: "Technique",
  references: "Références",
  financier: "Financier",
  ressources: "Ressources",
  planning: "Planning",
};

export const LEVEL_2_CATEGORY_LABELS: Record<Level2Category, string> = {
  certifications: "Certifications",
  administratif: "Administratif",
  technique: "Technique",
  references: "Références",
  financier: "Financier",
  ressources: "Ressources",
  planning: "Planning",
};

export const GO_NO_GO_DECISION_LABELS: Record<GoNoGoDecisionValue, string> = {
  GO: "GO",
  GO_CONDITIONAL: "GO conditionnel",
  NO_GO: "NO GO",
};

export const GO_NO_GO_FRESHNESS_LABELS: Record<GoNoGoFreshness, string> = {
  CURRENT: "À jour",
  STALE: "Actualisation requise",
  UNKNOWN: "Fraîcheur inconnue",
};

export const DOCUMENTARY_LOAD_LABELS: Record<DocumentaryLoad, string> = {
  LOW: "Faible",
  MEDIUM: "Moyenne",
  HIGH: "Élevée",
  VERY_HIGH: "Très élevée",
};

export const PREP_TIME_LABELS: Record<PrepTimeLevel, string> = {
  LOW: "Faible",
  MEDIUM: "Moyen",
  HIGH: "Élevé",
};

export function goNoGoBadgeClass(value: GoNoGoDecisionValue | GoNoGoRecommendation): string {
  switch (value) {
    case "GO":
      return "bg-green-100 text-green-800";
    case "GO_CONDITIONAL":
      return "bg-amber-100 text-amber-800";
    case "NO_GO":
      return "bg-red-100 text-red-800";
  }
}

/** Vérifications UI uniquement, jamais l'autorité — le backend revalide systématiquement
 *  (`OpportunityPermission`/`ClientPermission`/`TenderPermission`) quoi que montre l'interface. */
const ROLES_ALLOWED_TO_MANAGE_OPPORTUNITY = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER", "CONTRIBUTOR"];
export function canManageOpportunity(role: string | undefined): boolean {
  return role !== undefined && ROLES_ALLOWED_TO_MANAGE_OPPORTUNITY.includes(role);
}

const ROLES_ALLOWED_TO_DECIDE = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"];
export function canRecordGoNoGoDecision(role: string | undefined): boolean {
  return role !== undefined && ROLES_ALLOWED_TO_DECIDE.includes(role);
}
export function canPromoteOpportunity(role: string | undefined): boolean {
  return role !== undefined && ROLES_ALLOWED_TO_DECIDE.includes(role);
}
export function canGenerateGoNoGoReport(role: string | undefined): boolean {
  return role !== undefined && ROLES_ALLOWED_TO_DECIDE.includes(role);
}
