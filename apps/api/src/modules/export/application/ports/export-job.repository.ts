import type { ExportArtifact } from "../../domain/export-artifact";
import type { ExportJob } from "../../domain/export-job.aggregate";

export type ExportJobWithArtifact = { job: ExportJob; artifact?: ExportArtifact | undefined };

export interface ExportJobRepository {
  /** Crée le job PENDING et ses sélections de section en une seule transaction courte (mission
   *  §69 "transaction courte : créer PENDING"). */
  create(job: ExportJob): Promise<void>;
  findById(input: { organizationId: string; exportJobId: string }): Promise<ExportJobWithArtifact | null>;
  /** Mission Sprint 8A bis §43 — permet à Signature de retrouver le job/artefact source d'une
   *  transaction à partir de l'artefact référencé (`SignatureTransaction.exportArtifactId`),
   *  sans dupliquer `exportJobId` sur la table Signature. */
  findByArtifactId(input: { organizationId: string; exportArtifactId: string }): Promise<ExportJobWithArtifact | null>;
  /** Numéro de version suivant, PAR (tenderId, documentType, format) — mission §22 "numérotation
   *  stable". */
  nextVersion(input: { organizationId: string; tenderId: string; documentType: string; format: string }): Promise<number>;
  list(input: { organizationId: string; tenderId: string; mode?: string | undefined; limit: number; offset: number }): Promise<{ items: readonly ExportJobWithArtifact[]; total: number }>;

  markGenerating(input: { organizationId: string; exportJobId: string }): Promise<void>;
  /** Transaction courte : enregistre l'artefact ET marque COMPLETED atomiquement (mission §69
   *  "transaction courte : enregistrer succès ou erreur"). */
  completeWithArtifact(input: { organizationId: string; exportJobId: string; artifact: ExportArtifact; occurredAt: Date }): Promise<void>;
  markFailed(input: { organizationId: string; exportJobId: string; errorCode: string; errorMessage: string; occurredAt: Date }): Promise<void>;
}

export const EXPORT_JOB_REPOSITORY = Symbol("EXPORT_JOB_REPOSITORY");
