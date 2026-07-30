import type { AnalysisJob } from "../../domain/analysis-job.aggregate";
import type { PrismaTx } from "./business-analysis.repository";

export type PreparedAnalysisRequest = Readonly<{
  systemPrompt: string;
  userPrompt: string;
  responseSchemaName: string;
}>;

export type AnalysisSuccessResult = Readonly<{
  /** Résumé technique COURT (mission Sprint 4.1 §"Sortie du provider") persisté sur
   *  `AnalysisJob.resultSummary` — jamais la structure métier complète. */
  resultSummary: string;
  /** Doit être invoquée UNIQUEMENT comme `onSuccessTx` de `AnalysisJobRepository.finalizeAttempt`
   *  (même transaction courte que la finalisation du job) — jamais appelée directement, jamais hors
   *  transaction (mission §"atomicité du résultat métier"). */
  persist(tx: PrismaTx): Promise<void>;
}>;

/**
 * Résout le contenu métier réel d'un `AnalysisJob` (mission Sprint 4.2) — remplace le pipeline
 * technique placeholder de `ProcessAnalysisJobUseCase` (Sprint 4.1) par l'analyse documentaire
 * (scope DOCUMENT) et la consolidation Tender (scope TENDER) réelles, tout en préservant
 * intégralement le squelette 3-phases (réservation courte / appel provider hors transaction /
 * finalisation courte) hérité de Sprint 4.1 — cette abstraction ne fait JAMAIS d'E/S de base de
 * données elle-même dans `prepare()` au-delà de la lecture du corpus (via les contrats publics
 * Extraction/BusinessAnalysisRepository), et ne persiste JAMAIS rien avant `handleSuccess().persist`
 * ne soit invoquée dans la transaction de finalisation.
 */
export interface AnalysisContentResolver {
  /** Prépare la requête à envoyer au provider IA pour CE job — hors transaction, avant tout appel
   *  réseau (Phase 2). Doit lever une erreur de domaine explicite (jamais un rôle/contenu fabriqué)
   *  si les préconditions manquent (ex. `triggeredByRole` absent, aucun document analysé pour une
   *  consolidation Tender). */
  prepare(job: AnalysisJob): Promise<PreparedAnalysisRequest>;

  /** Valide strictement (Zod) la réponse brute du provider pour CE job et prépare sa persistance —
   *  lève `AiSchemaValidationFailedError` si la structure est invalide (jamais acceptée en l'état,
   *  jamais de retry ciblé automatique au-delà de ce que la mission autorise). */
  handleSuccess(job: AnalysisJob, rawContent: string): Promise<AnalysisSuccessResult>;
}

export const ANALYSIS_CONTENT_RESOLVER = Symbol("ANALYSIS_CONTENT_RESOLVER");
