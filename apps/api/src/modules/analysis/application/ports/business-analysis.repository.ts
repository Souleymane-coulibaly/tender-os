import type { Prisma } from "@prisma/client";
import type { DocumentAnalysisOutput } from "../schemas/business/document-analysis-output.schema";
import type { TenderConsolidationOutput } from "../schemas/business/tender-consolidation-output.schema";

/** Client de transaction Prisma — utilisé pour persister le résultat métier DANS LA MÊME
 *  transaction que la finalisation de l'`AnalysisJob` (mission Sprint 4.2, même exigence
 *  d'atomicité que la correction P1-02 Sprint 4.1 pour `AnalysisAttempt`) : un job ne doit jamais
 *  devenir `SUCCEEDED` sans que son résultat métier soit également écrit. */
export type PrismaTx = Prisma.TransactionClient;

export type PersistDocumentAnalysisInput = Readonly<{
  organizationId: string;
  analysisJobId: string;
  analysisVersion: number;
  tenderId: string;
  dceId: string;
  documentId: string;
  extractionVersion: number;
  /** V2 Sprint 4 (audit Codex P1-004) — version EXACTE du document analysée (jamais recalculée
   *  après coup), même motif que `extractionVersion`. */
  documentVersionId: string;
  output: DocumentAnalysisOutput;
}>;

export type PersistTenderConsolidationInput = Readonly<{
  organizationId: string;
  analysisJobId: string;
  analysisVersion: number;
  tenderId: string;
  output: TenderConsolidationOutput;
  /** V2 Sprint 4 (audit Codex P1-004, round 3) — snapshot `documentId -> documentVersionId` des
   *  documents réellement consolidés, résolu UNE SEULE FOIS par l'appelant (`documentVersionId`
   *  déjà porté par chaque `DocumentAnalysisRecord` de `consolidatedAnalyses`) et gravé sur chaque
   *  Finding créée par cet appel — jamais re-dérivé plus tard, donc immunisé contre un remplacement
   *  du document survenant après cette consolidation. Absent d'un `documentId` cité par une Finding
   *  → `documentVersionId` reste `null` sur cette ligne (dégradation silencieuse de la provenance
   *  uniquement, jamais un blocage de la persistance). */
  documentVersionsByDocumentId: Readonly<Record<string, string | undefined>>;
  /** Checkpoint 2.1-P2.1-FIX-A — `Dce.revision` lue UNE SEULE FOIS par l'appelant
   *  (`BusinessAnalysisContentResolver`, même point de résolution que `documentVersionsByDocumentId`
   *  ci-dessus), jamais recalculée après coup. `undefined` si aucun Dce n'existe pour ce Tender
   *  (dégradation silencieuse — jamais un blocage de la persistance d'une consolidation par ailleurs
   *  valide). */
  dceRevision?: number | undefined;
}>;

export type DocumentAnalysisRecord = Readonly<{
  documentId: string;
  /** V2 Sprint 4 (audit Codex P1-004) — `undefined` uniquement pour une ligne écrite avant ce
   *  sprint (colonne additive nullable). */
  documentVersionId?: string | undefined;
  analysisVersion: number;
  documentType: string;
  language: string;
  metadata: DocumentAnalysisOutput["metadata"];
  deadlines: DocumentAnalysisOutput["deadlines"];
  criteria: DocumentAnalysisOutput["criteria"];
  requirements: DocumentAnalysisOutput["requirements"];
  clauses: DocumentAnalysisOutput["clauses"];
  warnings: readonly string[];
}>;

export type PageResult<T> = Readonly<{ items: readonly T[]; total: number }>;

export type ListPage = Readonly<{ limit: number; offset: number }>;

export type DeadlineFindingRecord = Readonly<{
  id: string;
  kind: string;
  label: string;
  date?: string | null | undefined;
  rawText?: string | null | undefined;
  documentId?: string | null | undefined;
  /** V2 Sprint 4 (audit Codex P1-004, round 3) — version exacte du document, capturée au moment de
   *  la persistance de la consolidation (jamais recalculée après coup). */
  documentVersionId?: string | null | undefined;
  chunkSequence?: number | null | undefined;
  pageStart?: number | null | undefined;
  pageEnd?: number | null | undefined;
  sheetName?: string | null | undefined;
  sectionTitle?: string | null | undefined;
  citation?: string | null | undefined;
  isInferred: boolean;
  confidence: number;
  createdAt: string;
}>;

export type CriterionFindingRecord = Readonly<{
  id: string;
  name: string;
  weight?: number | null | undefined;
  subCriteria?: unknown;
  scoringMethod?: string | null | undefined;
  priceFormula?: string | null | undefined;
  threshold?: string | null | undefined;
  isEliminatory: boolean;
  documentId?: string | null | undefined;
  /** V2 Sprint 4 (audit Codex P1-004, round 3) — voir DeadlineFindingRecord.documentVersionId. */
  documentVersionId?: string | null | undefined;
  chunkSequence?: number | null | undefined;
  pageStart?: number | null | undefined;
  pageEnd?: number | null | undefined;
  sheetName?: string | null | undefined;
  sectionTitle?: string | null | undefined;
  citation?: string | null | undefined;
  isInferred: boolean;
  confidence: number;
  createdAt: string;
}>;

export type RequirementFindingRecord = Readonly<{
  id: string;
  category: string;
  label: string;
  expectedFormat?: string | null | undefined;
  isMandatory: boolean;
  documentId?: string | null | undefined;
  /** V2 Sprint 4 (audit Codex P1-004, round 3) — voir DeadlineFindingRecord.documentVersionId. */
  documentVersionId?: string | null | undefined;
  chunkSequence?: number | null | undefined;
  pageStart?: number | null | undefined;
  pageEnd?: number | null | undefined;
  sheetName?: string | null | undefined;
  sectionTitle?: string | null | undefined;
  citation?: string | null | undefined;
  isInferred: boolean;
  confidence: number;
  createdAt: string;
}>;

export type ClauseFindingRecord = Readonly<{
  id: string;
  category: string;
  summary: string;
  documentId?: string | null | undefined;
  chunkSequence?: number | null | undefined;
  pageStart?: number | null | undefined;
  pageEnd?: number | null | undefined;
  sheetName?: string | null | undefined;
  sectionTitle?: string | null | undefined;
  citation?: string | null | undefined;
  isInferred: boolean;
  confidence: number;
  createdAt: string;
}>;

export type RiskFindingRecord = Readonly<{
  id: string;
  title: string;
  category: string;
  severity: string;
  probability?: number | null | undefined;
  explanation: string;
  recommendation: string;
  documentId?: string | null | undefined;
  /** V2 Sprint 4 (audit Codex P1-004, round 3) — voir DeadlineFindingRecord.documentVersionId. */
  documentVersionId?: string | null | undefined;
  chunkSequence?: number | null | undefined;
  pageStart?: number | null | undefined;
  pageEnd?: number | null | undefined;
  sheetName?: string | null | undefined;
  sectionTitle?: string | null | undefined;
  citation?: string | null | undefined;
  isInferred: boolean;
  confidence: number;
  createdAt: string;
}>;

export type QuestionFindingRecord = Readonly<{
  id: string;
  question: string;
  justification: string;
  priority: string;
  theme: string;
  documentId?: string | null | undefined;
  chunkSequence?: number | null | undefined;
  pageStart?: number | null | undefined;
  pageEnd?: number | null | undefined;
  sheetName?: string | null | undefined;
  sectionTitle?: string | null | undefined;
  citation?: string | null | undefined;
  isInferred: boolean;
  confidence: number;
  createdAt: string;
}>;

export type TenderAnalysisSummaryRecord = Readonly<{
  id: string;
  analysisVersion: number;
  /** Checkpoint 2.1-P2.1-FIX-A — `Dce.revision` au moment de la persistance de CETTE synthèse.
   *  `undefined` pour toute ligne écrite avant ce checkpoint (colonne additive nullable) — jamais
   *  une précision historique fabriquée (mission §22). */
  dceRevision?: number | undefined;
  opportunitySummary: string;
  complexityLevel: string;
  mainCriteria: readonly string[];
  mainRisks: readonly string[];
  mainObligations: readonly string[];
  missingElements: readonly string[];
  pointsToClarify: readonly string[];
  conflicts: unknown;
  goNoGoRecommendation: string;
  goNoGoRationale: string;
  createdAt: string;
}>;

export interface BusinessAnalysisRepository {
  /** Persiste le résultat de l'étape 1 (analyse d'un document) — appelé DANS la transaction de
   *  `AnalysisJobRepository.finalizeAttempt` (voir `onSuccessTx`). */
  persistDocumentAnalysis(tx: PrismaTx, input: PersistDocumentAnalysisInput): Promise<void>;

  /** Persiste le résultat de l'étape 2 (consolidation Tender) — même contrat d'atomicité. */
  persistTenderConsolidation(tx: PrismaTx, input: PersistTenderConsolidationInput): Promise<void>;

  /** Dernière analyse RÉUSSIE de chaque document du tender (une par documentId, la plus récente
   *  `analysisVersion`) — c'est ce que consomme la consolidation (étape 2). Un document jamais
   *  analysé, ou dont la dernière tentative a échoué, n'apparaît simplement pas ici (mission
   *  §"Ne fais pas échouer tout le Tender si un seul document est inutilisable"). */
  findLatestDocumentAnalyses(input: { organizationId: string; tenderId: string }): Promise<DocumentAnalysisRecord[]>;

  listDeadlines(input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage): Promise<PageResult<DeadlineFindingRecord>>;
  listCriteria(input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage): Promise<PageResult<CriterionFindingRecord>>;
  listRequirements(input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage): Promise<PageResult<RequirementFindingRecord>>;
  listClauses(input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage): Promise<PageResult<ClauseFindingRecord>>;
  listRisks(input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage): Promise<PageResult<RiskFindingRecord>>;
  listQuestions(input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage): Promise<PageResult<QuestionFindingRecord>>;
  getSummary(input: { organizationId: string; tenderId: string; analysisVersion: number }): Promise<TenderAnalysisSummaryRecord | null>;

  /** Résout "la dernière analyse consultable" (mission §"GET .../analysis") — la plus récente
   *  `TenderAnalysisSummary` existante pour ce tender, tous statuts de job confondus (une
   *  consolidation ne peut être persistée que si le job a atteint SUCCEEDED/PARTIALLY_SUCCEEDED,
   *  donc sa seule présence suffit à la qualifier de "consultable"). `null` si aucune consolidation
   *  n'a encore jamais réussi pour ce tender. */
  getLatestSummary(input: { organizationId: string; tenderId: string }): Promise<TenderAnalysisSummaryRecord | null>;
}

export const BUSINESS_ANALYSIS_REPOSITORY = Symbol("BUSINESS_ANALYSIS_REPOSITORY");
