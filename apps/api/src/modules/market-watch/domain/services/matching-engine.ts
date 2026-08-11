import { anyCpvMatches } from "./cpv-matching";
import { countMatchedIncludeKeywords, keywordFilterPasses } from "./keyword-matching";

export type MatchableTender = Readonly<{
  title: string;
  description?: string | undefined;
  marketType: string;
  source: string;
  cpvCodes: readonly string[];
  country?: string | undefined;
  region?: string | undefined;
  department?: string | undefined;
  city?: string | undefined;
  estimatedAmount?: number | undefined;
  publicationDate?: Date | undefined;
  submissionDeadline?: Date | undefined;
  procedureType?: string | undefined;
}>;

export type SavedSearchCriteria = Readonly<{
  includeKeywords: readonly string[];
  excludeKeywords: readonly string[];
  cpvCodes: readonly string[];
  countries: readonly string[];
  regions: readonly string[];
  departments: readonly string[];
  cities: readonly string[];
  marketTypes: readonly string[];
  sources: readonly string[];
  minAmount?: number | undefined;
  maxAmount?: number | undefined;
  includeUnknownAmount: boolean;
  publishedAfter?: Date | undefined;
  deadlineAfterDays?: number | undefined;
  deadlineBeforeDate?: Date | undefined;
  procedureTypes: readonly string[];
}>;

/** Entrée de mise à jour partielle — délibérément distincte de `Partial<SavedSearchCriteria>` :
 *  sous `exactOptionalPropertyTypes: true`, `Partial<T>` rend chaque champ "absent-ou-T" mais
 *  n'accepte PAS un `undefined` explicite (ce que produit naturellement Zod `.optional()` à la
 *  frontière HTTP) — chaque champ est donc explicitement `X | undefined` ici. */
export type SavedSearchCriteriaInput = Readonly<{
  includeKeywords?: readonly string[] | undefined;
  excludeKeywords?: readonly string[] | undefined;
  cpvCodes?: readonly string[] | undefined;
  countries?: readonly string[] | undefined;
  regions?: readonly string[] | undefined;
  departments?: readonly string[] | undefined;
  cities?: readonly string[] | undefined;
  marketTypes?: readonly string[] | undefined;
  sources?: readonly string[] | undefined;
  minAmount?: number | undefined;
  maxAmount?: number | undefined;
  includeUnknownAmount?: boolean | undefined;
  publishedAfter?: Date | undefined;
  deadlineAfterDays?: number | undefined;
  deadlineBeforeDate?: Date | undefined;
  procedureTypes?: readonly string[] | undefined;
}>;

export type MatchReason = Readonly<{ criterion: string; label: string; matched: boolean }>;

export type MatchResult = Readonly<{ matched: true; score: number; reasons: readonly MatchReason[] }> | Readonly<{ matched: false; failedHardCriterion: string }>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Mission §26/§28 — règles déterministes d'abord. HARD = élimination (aucune contribution au
 * score, mission §29) ; SOFT = scoring, uniquement sur les critères réellement renseignés dans le
 * SavedSearch (un critère non renseigné ne dilue jamais le score, mission §29 "explicable").
 * Aucun enrichissement IA/sémantique ce sprint (mission §27, différé — voir rapport §"éléments
 * différés").
 */
export function evaluateMatch(criteria: SavedSearchCriteria, tender: MatchableTender, now: Date): MatchResult {
  const searchableText = `${tender.title} ${tender.description ?? ""}`;

  // --- HARD filters (mission §28) ---
  if (!keywordFilterPasses(searchableText, criteria.includeKeywords, criteria.excludeKeywords)) {
    return { matched: false, failedHardCriterion: "keywords" };
  }
  if (criteria.cpvCodes.length > 0 && !anyCpvMatches(criteria.cpvCodes, tender.cpvCodes)) {
    return { matched: false, failedHardCriterion: "cpv" };
  }
  if (criteria.marketTypes.length > 0 && !criteria.marketTypes.includes(tender.marketType)) {
    return { matched: false, failedHardCriterion: "marketType" };
  }
  if (criteria.sources.length > 0 && !criteria.sources.includes(tender.source)) {
    return { matched: false, failedHardCriterion: "source" };
  }
  // Mission §22/§122 — HARD, jamais un substring. Un pays inconnu ne peut pas confirmer la
  // conformité au filtre : exclu (même principe "exclure en cas d'incertitude" que Sprint 16).
  if (criteria.countries.length > 0 && (!tender.country || !criteria.countries.includes(tender.country))) {
    return { matched: false, failedHardCriterion: "country" };
  }
  if (criteria.regions.length > 0 && (!tender.region || !criteria.regions.includes(tender.region))) {
    return { matched: false, failedHardCriterion: "region" };
  }
  if (criteria.departments.length > 0 && (!tender.department || !criteria.departments.includes(tender.department))) {
    return { matched: false, failedHardCriterion: "department" };
  }
  if (criteria.cities.length > 0 && (!tender.city || !criteria.cities.includes(tender.city))) {
    return { matched: false, failedHardCriterion: "city" };
  }
  if (criteria.minAmount !== undefined || criteria.maxAmount !== undefined) {
    if (tender.estimatedAmount === undefined) {
      // Mission §23 — jamais une exclusion arbitraire, comportement explicite.
      if (!criteria.includeUnknownAmount) {
        return { matched: false, failedHardCriterion: "amount" };
      }
    } else {
      if (criteria.minAmount !== undefined && tender.estimatedAmount < criteria.minAmount) {
        return { matched: false, failedHardCriterion: "amount" };
      }
      if (criteria.maxAmount !== undefined && tender.estimatedAmount > criteria.maxAmount) {
        return { matched: false, failedHardCriterion: "amount" };
      }
    }
  }
  if (criteria.publishedAfter && (!tender.publicationDate || tender.publicationDate < criteria.publishedAfter)) {
    return { matched: false, failedHardCriterion: "publishedAfter" };
  }
  if (criteria.deadlineAfterDays !== undefined) {
    const minDeadline = new Date(now.getTime() + criteria.deadlineAfterDays * MS_PER_DAY);
    if (!tender.submissionDeadline || tender.submissionDeadline < minDeadline) {
      return { matched: false, failedHardCriterion: "deadlineAfterDays" };
    }
  }
  if (criteria.deadlineBeforeDate && (!tender.submissionDeadline || tender.submissionDeadline > criteria.deadlineBeforeDate)) {
    return { matched: false, failedHardCriterion: "deadlineBeforeDate" };
  }
  if (criteria.procedureTypes.length > 0 && (!tender.procedureType || !criteria.procedureTypes.includes(tender.procedureType))) {
    return { matched: false, failedHardCriterion: "procedureType" };
  }

  // --- SOFT scoring (mission §29/§30) — uniquement les critères réellement renseignés ---
  const reasons: MatchReason[] = [];
  let earnedPoints = 0;
  let applicableWeight = 0;

  if (criteria.includeKeywords.length > 0) {
    const weight = 40;
    applicableWeight += weight;
    const matchedCount = countMatchedIncludeKeywords(searchableText, criteria.includeKeywords);
    earnedPoints += weight * (matchedCount / criteria.includeKeywords.length);
    reasons.push({ criterion: "keywords", label: `Mots-clés : ${matchedCount}/${criteria.includeKeywords.length}`, matched: matchedCount > 0 });
  }

  if (criteria.cpvCodes.length > 0) {
    const weight = 20;
    applicableWeight += weight;
    const exactMatch = criteria.cpvCodes.some((code) => tender.cpvCodes.includes(code));
    earnedPoints += exactMatch ? weight : weight * 0.5;
    reasons.push({ criterion: "cpv", label: exactMatch ? "CPV : correspondance exacte" : "CPV : famille compatible", matched: true });
  }

  const hasGeographyCriteria = criteria.countries.length > 0 || criteria.regions.length > 0 || criteria.departments.length > 0 || criteria.cities.length > 0;
  if (hasGeographyCriteria) {
    const weight = 20;
    applicableWeight += weight;
    const preciseMatch = (criteria.departments.length > 0 && !!tender.department) || (criteria.cities.length > 0 && !!tender.city);
    const regionMatch = criteria.regions.length > 0 && !!tender.region;
    earnedPoints += preciseMatch ? weight : regionMatch ? weight * 0.7 : weight * 0.5;
    reasons.push({ criterion: "geography", label: tender.city ?? tender.department ?? tender.region ?? tender.country ?? "Zone géographique compatible", matched: true });
  }

  if (criteria.minAmount !== undefined || criteria.maxAmount !== undefined) {
    const weight = 10;
    applicableWeight += weight;
    const known = tender.estimatedAmount !== undefined;
    earnedPoints += known ? weight : weight * 0.5;
    reasons.push({ criterion: "amount", label: known ? "Montant dans la fourchette" : "Montant non communiqué par la source", matched: true });
  }

  if (tender.publicationDate) {
    const weight = 10;
    applicableWeight += weight;
    const ageDays = Math.max(0, (now.getTime() - tender.publicationDate.getTime()) / MS_PER_DAY);
    const recencyFactor = Math.max(0, 1 - ageDays / 30);
    earnedPoints += weight * recencyFactor;
    reasons.push({ criterion: "recency", label: ageDays <= 7 ? "Publié récemment" : "Publié il y a plus d'une semaine", matched: ageDays <= 7 });
  }

  const score = applicableWeight > 0 ? Math.round(Math.min(100, Math.max(0, (earnedPoints / applicableWeight) * 100))) : 0;

  return { matched: true, score, reasons };
}
