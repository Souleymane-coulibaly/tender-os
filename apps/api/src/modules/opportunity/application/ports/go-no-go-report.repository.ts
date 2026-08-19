import type { AnalysisFreshness } from "../../../analysis";
import { computeGoNoGoFreshness, type GoNoGoFreshness } from "../../domain/go-no-go-freshness";
import type { GoNoGoReportResult } from "../../domain/scoring/compute-go-no-go-report";

export type GoNoGoReportRecord = Readonly<{
  id: string;
  organizationId: string;
  tenderId: string;
  reportVersion: number;
  analysisVersion: number;
  calculationVersion: string;
  requestedByUserId?: string | undefined;
  generatedAt: string;
  /** Checkpoint 2.1-A6.2 (correctif audit — P2 "fraîcheur candidate") — `Tender.candidateCompanyId`
   *  AU MOMENT du calcul, instantané, jamais re-résolu. `undefined` si aucune CandidateCompany
   *  n'était résolue à ce moment (LEGACY FLOW ou rapport généré avant ce correctif). */
  candidateCompanyId?: string | undefined;
  /** Checkpoint 2.1-P2.1-FIX-C — `Dce.revision` (via `EffectiveTenderAnalysisSummary.dceRevision`)
   *  AU MOMENT du calcul, instantané. `undefined` pour un rapport généré avant ce checkpoint (voir
   *  `computeGoNoGoFreshness` — provenance insuffisante, jamais `CURRENT` par défaut). */
  dceRevision?: number | undefined;
  /** Checkpoint 2.1-A6.2 — calculé À LA LECTURE uniquement (jamais persisté), par les use cases de
   *  lecture (`GetGoNoGoReportUseCase`/`ListGoNoGoReportsUseCase`) qui connaissent le
   *  `candidateCompanyId` COURANT du Tender — le repository ne le renseigne jamais lui-même.
   *  `true` si la CandidateCompany du Tender a changé depuis ce calcul (mission "jamais présenté
   *  comme courant sans preuve") — jamais un recalcul automatique, seulement un signal honnête. */
  candidateStale?: boolean | undefined;
  /** Checkpoint 2.1-P2.1-FIX-C — signal composite calculé À LA LECTURE (jamais persisté), voir
   *  `computeGoNoGoFreshness`. Incorpore déjà `candidateStale` — ne jamais les combiner à nouveau
   *  côté appelant. */
  freshness?: GoNoGoFreshness | undefined;
  /** Checkpoint 2.1-P2.1-FIX-C — raison individuelle exposée pour l'UX (mission §22/§39), calculée
   *  À LA LECTURE : `true` si une analyse plus récente existe désormais pour ce Tender que celle
   *  utilisée par ce rapport. */
  analysisStale?: boolean | undefined;
  /** Checkpoint 2.1-P2.1-FIX-C — raison individuelle pour l'UX : `true` si l'analyse utilisée par ce
   *  rapport (même si toujours la dernière) est elle-même STALE/UNKNOWN vis-à-vis du DCE courant —
   *  capture "le DCE a changé, même avant toute nouvelle analyse" (mission §10). */
  dceStale?: boolean | undefined;
}> &
  GoNoGoReportResult;

export type CreateGoNoGoReportInput = Readonly<{
  id: string;
  organizationId: string;
  tenderId: string;
  /** Checkpoint 2.1-P2.1-FIX-C (correctif audit P1-FIXC-001) — réservé par l'appelant via
   *  `reserveVersion` AVANT le calcul coûteux, jamais recalculé à l'intérieur de `create()`. Voir
   *  la documentation de `reserveVersion` pour la garantie d'ordre que cela procure. */
  reportVersion: number;
  analysisVersion: number;
  /** Checkpoint 2.1-P2.1-FIX-C — voir `GoNoGoReportRecord.dceRevision`. */
  dceRevision?: number | undefined;
  calculationVersion: string;
  requestedByUserId?: string | undefined;
  generatedAt: Date;
  result: GoNoGoReportResult;
  /** Checkpoint 2.1-A6.2 — voir `GoNoGoReportRecord.candidateCompanyId`. */
  candidateCompanyId?: string | undefined;
}>;

/** Checkpoint 2.1-A6.2 — seul point de calcul de `candidateStale`, jamais dupliqué entre
 *  `GetGoNoGoReportUseCase`/`ListGoNoGoReportsUseCase` (mission CLAUDE.md "ne jamais dupliquer du
 *  code"). Comparaison stricte : un rapport sans candidate connue (LEGACY FLOW) sur un Tender qui
 *  EN a désormais une est également considéré `stale` (le contexte de calcul a changé), pas
 *  seulement Alpha→Beta. */
export function withGoNoGoCandidateStaleness(record: GoNoGoReportRecord, currentCandidateCompanyId: string | undefined): GoNoGoReportRecord {
  return { ...record, candidateStale: record.candidateCompanyId !== currentCandidateCompanyId };
}

/** Checkpoint 2.1-P2.1-FIX-C — seul point de calcul de la fraîcheur composite GO/NO-GO, jamais
 *  dupliqué entre `GetGoNoGoReportUseCase`/`ListGoNoGoReportsUseCase`. Compose
 *  `withGoNoGoCandidateStaleness` (A6.2, inchangée) avec `computeGoNoGoFreshness` (analyse
 *  courante, résolue une seule fois par l'appelant via `GetEffectiveTenderAnalysisSummaryUseCase`
 *  — jamais une seconde résolution divergente ici). */
export function withGoNoGoFreshness(
  record: GoNoGoReportRecord,
  context: Readonly<{
    currentCandidateCompanyId: string | undefined;
    currentAnalysisVersion: number | undefined;
    currentAnalysisFreshness: AnalysisFreshness | undefined;
  }>,
): GoNoGoReportRecord {
  const withCandidate = withGoNoGoCandidateStaleness(record, context.currentCandidateCompanyId);
  const candidateStale = withCandidate.candidateStale ?? false;
  const freshness = computeGoNoGoFreshness({
    reportDceRevision: record.dceRevision,
    reportAnalysisVersion: record.analysisVersion,
    currentAnalysisVersion: context.currentAnalysisVersion,
    currentAnalysisFreshness: context.currentAnalysisFreshness,
    candidateStale,
  });
  return {
    ...withCandidate,
    freshness,
    analysisStale: context.currentAnalysisVersion !== undefined && record.analysisVersion !== context.currentAnalysisVersion,
    dceStale: context.currentAnalysisFreshness !== undefined && context.currentAnalysisFreshness !== "CURRENT",
  };
}

export interface GoNoGoReportRepository {
  /** Checkpoint 2.1-P2.1-FIX-C (correctif audit P1-FIXC-001) — insère avec le `reportVersion` DÉJÀ
   *  réservé par `reserveVersion` (jamais recalculé ici). Le `@@unique([organizationId, tenderId,
   *  reportVersion])` du schéma reste un filet de sécurité, plus le mécanisme principal. */
  create(input: CreateGoNoGoReportInput): Promise<GoNoGoReportRecord>;
  /** Version la plus élevée déjà attribuée pour ce Tender — `0` si aucune n'existe encore (la
   *  prochaine sera `1`). Même motif que `OpportunityQuickScoreRepository.getLatestVersion`. Lecture
   *  seule, jamais sous verrou. */
  getLatestVersion(input: { organizationId: string; tenderId: string }): Promise<number>;
  /** Checkpoint 2.1-P2.1-FIX-C (correctif audit P1-FIXC-001) — réserve ATOMIQUEMENT (verrou
   *  consultatif Postgres scopé au Tender, même motif que
   *  `AnalysisJobRepository.runExclusiveForTarget`) le prochain `reportVersion`, en l'écrivant
   *  DURABLEMENT dans `GoNoGoReportVersionReservation` (jamais seulement lu/calculé en mémoire —
   *  c'est cette écriture qui rend la réservation opposable à un appel concurrent, contrairement à
   *  un simple "lire le max + 1" non persisté). À appeler AVANT le calcul coûteux (`Promise.all`
   *  findings/scoring), jamais à l'intérieur de `create()`. Garantit qu'un calcul démarré plus tôt
   *  (donc lisant un état DCE/analyse plus ancien) reçoit TOUJOURS un `reportVersion` plus petit
   *  qu'un calcul démarré plus tard, quel que soit l'ordre de complétion — même garantie que
   *  `AnalysisJob.analysisVersion` (assignée à l'ouverture), sans dupliquer son cycle de vie à deux
   *  phases : `GoNoGoReport` reste créé en un seul temps, complet, jamais un brouillon. */
  reserveVersion(input: { organizationId: string; tenderId: string }): Promise<number>;
  getLatest(input: { organizationId: string; tenderId: string }): Promise<GoNoGoReportRecord | null>;
  listVersions(input: { organizationId: string; tenderId: string }): Promise<GoNoGoReportRecord[]>;
  findById(input: { organizationId: string; tenderId: string; reportId: string }): Promise<GoNoGoReportRecord | null>;
}

export const GO_NO_GO_REPORT_REPOSITORY = Symbol("GO_NO_GO_REPORT_REPOSITORY");
