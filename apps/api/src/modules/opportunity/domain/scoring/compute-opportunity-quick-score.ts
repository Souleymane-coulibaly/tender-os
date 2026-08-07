import { computeWeightedGlobalScore, LEVEL_1_CATEGORY_WEIGHTS, type Level1Category } from "./category-weights";
import {
  scoreCertificationsFromProfile,
  scoreFinancierMissingData,
  scorePlanningFromDeadline,
  scoreReferencesFromProfile,
  scoreRessourcesFromProfile,
} from "./shared-category-scorers";

export type ScoredCategory = Readonly<{ score: number; weight: number; justification: string }>;

export type ScoreCause = Readonly<{ category: string; description: string; weight: number; source: string; justification: string }>;

export type QuickScoreResult = Readonly<{
  globalScore: number;
  confidence: number;
  complexity: number;
  categoryScores: Readonly<Record<Level1Category, ScoredCategory>>;
  strengths: readonly ScoreCause[];
  weaknesses: readonly ScoreCause[];
  blockers: readonly ScoreCause[];
  missingData: readonly string[];
}>;

/** Sous-ensemble minimal et pertinent de `CompanyProfileSummary` (module `company-profile`) —
 *  jamais le type complet importé directement (frontière de module), la couche application mappe
 *  vers cette forme plate. */
export type QuickScoreCompanyProfileInput = Readonly<{
  hasLegalIdentity: boolean;
  region?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  validCertificationCount: number;
  expiredCertificationCount: number;
  validInsuranceCount: number;
  expiredInsuranceCount: number;
  matchingReferenceCount: number;
  totalReferenceCount: number;
  humanResourceCount: number;
  materialResourceCount: number;
  identityCompleteness: string;
}>;

export type ComputeQuickScoreInput = Readonly<{
  sector?: string | undefined;
  location?: string | undefined;
  geographicZone?: string | undefined;
  submissionDeadline?: Date | undefined;
  now: Date;
  companyProfile?: QuickScoreCompanyProfileInput | undefined;
}>;

const MISSING_COMPANY_PROFILE = "Aucune entreprise candidate n'est encore rattachée à cette Opportunity.";

function scoreAdministratif(input: ComputeQuickScoreInput, missingData: string[]): ScoredCategory {
  if (!input.companyProfile) {
    missingData.push(MISSING_COMPANY_PROFILE);
    return { score: 0, weight: LEVEL_1_CATEGORY_WEIGHTS.administratif, justification: "Aucun profil entreprise disponible — donnée manquante." };
  }
  const map: Record<string, number> = { COMPLETE: 100, TO_VERIFY: 70, PARTIAL: 55, EXPIRED: 20, MISSING: 0 };
  const score = map[input.companyProfile.identityCompleteness] ?? 0;
  return {
    score,
    weight: LEVEL_1_CATEGORY_WEIGHTS.administratif,
    justification: `Complétude de l'identité légale du candidat : ${input.companyProfile.identityCompleteness}.`,
  };
}

function scoreTechnique(input: ComputeQuickScoreInput, missingData: string[]): ScoredCategory {
  if (!input.companyProfile || input.companyProfile.totalReferenceCount === 0) {
    missingData.push("Aucune référence technique connue pour évaluer la compatibilité — score neutre par défaut.");
    return { score: 50, weight: LEVEL_1_CATEGORY_WEIGHTS.technique, justification: "Aucune référence connue — score neutre, jamais inventé." };
  }
  const ratio = input.companyProfile.totalReferenceCount > 0 ? input.companyProfile.matchingReferenceCount / input.companyProfile.totalReferenceCount : 0;
  return {
    score: Math.round(50 + ratio * 50),
    weight: LEVEL_1_CATEGORY_WEIGHTS.technique,
    justification: `${input.companyProfile.matchingReferenceCount}/${input.companyProfile.totalReferenceCount} référence(s) déclarée(s) dans un secteur proche.`,
  };
}

function scoreConformiteGenerale(administratif: ScoredCategory, certifications: ScoredCategory, insurances: { valid: number; expired: number } | undefined): ScoredCategory {
  const insuranceScore = !insurances ? 50 : insurances.valid > 0 ? 100 : insurances.expired > 0 ? 10 : 40;
  const score = Math.round((administratif.score + certifications.score + insuranceScore) / 3);
  return {
    score,
    weight: LEVEL_1_CATEGORY_WEIGHTS.conformiteGenerale,
    justification: "Moyenne de la complétude administrative, des certifications et des assurances.",
  };
}

/** Complexité indicative Niveau 1 (1..5, mission §9) — avant DCE, se limite aux signaux connus au
 *  moment de la préqualification (délai, montant... — ici volontairement simple : le détail
 *  documentaire réel n'existe qu'au Niveau 2). Jamais présentée comme une prédiction. */
function computeIndicativeComplexity(input: ComputeQuickScoreInput): number {
  let complexity = 2;
  if (input.submissionDeadline) {
    const daysRemaining = Math.floor((input.submissionDeadline.getTime() - input.now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysRemaining < 15) complexity += 1;
  }
  if (!input.companyProfile || input.companyProfile.totalReferenceCount === 0) complexity += 1;
  return Math.max(1, Math.min(5, complexity));
}

/** Confiance globale (mission §23) — réduite proportionnellement au nombre de données manquantes,
 *  jamais un chiffre arbitraire indépendant des `missingData` réellement listées. */
function computeConfidence(missingDataCount: number): number {
  const penalty = Math.min(0.7, missingDataCount * 0.12);
  return Math.round((1 - penalty) * 100) / 100;
}

export function computeOpportunityQuickScore(input: ComputeQuickScoreInput): QuickScoreResult {
  const missingData: string[] = [];

  const administratif = scoreAdministratif(input, missingData);
  const technique = scoreTechnique(input, missingData);
  const financier = scoreFinancierMissingData(LEVEL_1_CATEGORY_WEIGHTS.financier, missingData);
  const planning = scorePlanningFromDeadline(input.submissionDeadline, input.now, LEVEL_1_CATEGORY_WEIGHTS.planning, missingData);
  const ressources = scoreRessourcesFromProfile(input.companyProfile, LEVEL_1_CATEGORY_WEIGHTS.ressources, missingData);
  const references = scoreReferencesFromProfile(input.companyProfile, LEVEL_1_CATEGORY_WEIGHTS.references, missingData);
  const certifications = scoreCertificationsFromProfile(input.companyProfile, LEVEL_1_CATEGORY_WEIGHTS.certifications, missingData);
  const conformiteGenerale = scoreConformiteGenerale(
    administratif,
    certifications,
    input.companyProfile ? { valid: input.companyProfile.validInsuranceCount, expired: input.companyProfile.expiredInsuranceCount } : undefined,
  );

  const categoryScores: Record<Level1Category, ScoredCategory> = {
    administratif,
    technique,
    financier,
    planning,
    ressources,
    references,
    certifications,
    conformiteGenerale,
  };

  const globalScore = computeWeightedGlobalScore(new Map(Object.entries(categoryScores)));
  const complexity = computeIndicativeComplexity(input);
  const confidence = computeConfidence(missingData.length);

  const strengths: ScoreCause[] = [];
  const weaknesses: ScoreCause[] = [];
  const blockers: ScoreCause[] = [];

  for (const [category, entry] of Object.entries(categoryScores) as [Level1Category, ScoredCategory][]) {
    const cause: ScoreCause = { category, description: entry.justification, weight: entry.weight, source: "quick_score", justification: entry.justification };
    if (entry.score >= 70) strengths.push(cause);
    else if (entry.score <= 30) weaknesses.push(cause);
  }

  if (input.submissionDeadline && input.submissionDeadline.getTime() < input.now.getTime()) {
    blockers.push({
      category: "planning",
      description: "La date limite de dépôt est déjà passée.",
      weight: LEVEL_1_CATEGORY_WEIGHTS.planning,
      source: "quick_score",
      justification: `Date limite : ${input.submissionDeadline.toISOString()}.`,
    });
  }

  return { globalScore, confidence, complexity, categoryScores, strengths, weaknesses, blockers, missingData };
}
