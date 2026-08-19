import type { AnalysisFreshness } from "../../analysis";

/**
 * Checkpoint 2.1-P2.1-FIX-D — jamais persistée (même discipline que `computeAnalysisFreshness`/
 * `computeChecklistFreshness`/`computeGoNoGoFreshness`), calculée en LECTURE SEULE à partir de la
 * provenance figée sur la DERNIÈRE `TechnicalMemoSectionRevision` d'une section.
 *
 * Dimensions réellement consommées (audit ciblé, §4-7 de la mission) :
 * - CANDIDATE — `Tender.candidateCompanyId` résolu à CHAQUE génération/édition (identité candidate,
 *   `buildCandidateBlock`), jamais optionnel : toujours comparé.
 * - ANALYSIS/DCE — uniquement si la section avait au moins un lien
 *   `TechnicalMemoSectionRequirement` au moment de la génération (`buildFindingsBlock`) : une
 *   section sans exigence DCE liée ne dépend structurellement pas de l'Analyse, jamais une
 *   dépendance fabriquée (mission §12/§13).
 *
 * Checklist et GO/NO-GO sont délibérément ABSENTS : audit confirmé qu'aucun des deux n'est jamais
 * lu par `TechnicalMemoSectionContextAssembler` (mission §12/§13 "workflow order ≠ data
 * dependency"). Knowledge Base reste une dette documentée (`KNOWN_GAPS`), jamais une fausse
 * fraîcheur inventée pour cette dimension.
 */
export const TechnicalMemoFreshness = { Current: "CURRENT", Stale: "STALE", Unknown: "UNKNOWN" } as const;
export type TechnicalMemoFreshness = (typeof TechnicalMemoFreshness)[keyof typeof TechnicalMemoFreshness];

export type TechnicalMemoSectionFreshnessInput = Readonly<{
  /** `null` si la section n'a jamais été générée/éditée (aucune révision) — mission §19 "jamais
   *  CURRENT inventé pour une provenance insuffisante". */
  latestRevision:
    | Readonly<{
        candidateCompanyId: string | undefined;
        analysisVersion: number | undefined;
      }>
    | null;
  currentCandidateCompanyId: string | undefined;
  /** `EffectiveTenderAnalysisSummary.analysisVersion`/`analysisFreshness` résolue À LA LECTURE —
   *  `undefined` uniquement si la section n'avait pas de dépendance Analyse au moment de la
   *  révision (dans ce cas ces valeurs ne sont de toute façon jamais consultées, voir la logique
   *  ci-dessous). */
  currentAnalysisVersion: number | undefined;
  currentAnalysisFreshness: AnalysisFreshness | undefined;
}>;

export function computeTechnicalMemoSectionFreshness(input: TechnicalMemoSectionFreshnessInput): TechnicalMemoFreshness {
  if (!input.latestRevision) return TechnicalMemoFreshness.Unknown;

  // Mission §11 — un changement de Candidate rend la section STALE, que celle-ci dépende ou non du
  // DCE (l'identité candidate est TOUJOURS résolue, voir la documentation de ce module).
  if (input.latestRevision.candidateCompanyId !== input.currentCandidateCompanyId) {
    return TechnicalMemoFreshness.Stale;
  }

  // Mission §12/§13 — aucune dépendance Analyse fabriquée : une section qui n'avait aucun lien DCE
  // au moment de sa génération n'a rien à comparer, elle reste CURRENT sur cette dimension.
  if (input.latestRevision.analysisVersion === undefined) {
    return TechnicalMemoFreshness.Current;
  }

  // Mission §26 (audit P1-FIXC-001, même discipline) — jamais CURRENT si le signal de fraîcheur de
  // l'analyse courante n'est pas lui-même résolu.
  if (input.currentAnalysisVersion === undefined || input.currentAnalysisFreshness === undefined) {
    return TechnicalMemoFreshness.Unknown;
  }

  if (input.latestRevision.analysisVersion !== input.currentAnalysisVersion) {
    return TechnicalMemoFreshness.Stale;
  }
  if (input.currentAnalysisFreshness !== "CURRENT") {
    return TechnicalMemoFreshness.Stale;
  }
  return TechnicalMemoFreshness.Current;
}

/**
 * Mission §28-29 "mixed version risk" — le mémoire global n'est JAMAIS CURRENT par défaut : il
 * faut que TOUTES les sections du mémoire soient elles-mêmes CURRENT, y compris celles jamais
 * générées (`latestRevision: null` -> `UNKNOWN`, voir `computeTechnicalMemoSectionFreshness`) —
 * une section encore vide n'est jamais silencieusement ignorée de l'agrégat (mission §29 "si TOUTES
 * les sections nécessaires doivent correspondre au snapshot courant, l'imposer") : un mémoire
 * partiellement rédigé ne peut jamais être présenté comme globalement à jour.
 */
export function computeTechnicalMemoGlobalFreshness(sectionFreshnesses: readonly TechnicalMemoFreshness[]): TechnicalMemoFreshness {
  if (sectionFreshnesses.length === 0) return TechnicalMemoFreshness.Unknown;
  if (sectionFreshnesses.some((f) => f === TechnicalMemoFreshness.Stale)) return TechnicalMemoFreshness.Stale;
  if (sectionFreshnesses.some((f) => f === TechnicalMemoFreshness.Unknown)) return TechnicalMemoFreshness.Unknown;
  return TechnicalMemoFreshness.Current;
}
