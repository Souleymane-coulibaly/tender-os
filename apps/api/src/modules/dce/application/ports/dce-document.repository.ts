import type { DceDocument } from "../../domain/dce-document.entity";
import type { DceDocumentSummary } from "../dtos";

/**
 * Écritures : lignes de lien pur (création/suppression), jamais de duplication du fichier
 * physique — la donnée réelle (nom, mime, taille, checksum...) reste portée par Document/
 * DocumentVersion (module Documents). Lectures : vues enrichies produites par jointure
 * (documents + document_versions), pour éviter un N+1 vers Documents (décision d'architecture
 * "lecture hybride" — voir rapport final).
 */
export interface DceDocumentRepository {
  create(link: DceDocument): Promise<DceDocument>;
  findByDceIdAndDocumentId(input: {
    organizationId: string;
    dceId: string;
    documentId: string;
  }): Promise<DceDocument | null>;
  /** Fichiers actifs du DCE (exclut les documents dont le Document sous-jacent est
   *  soft-deleted — même stratégie de suppression que Documents, aucun état dupliqué ici). */
  listSummariesByDceId(input: { organizationId: string; dceId: string }): Promise<DceDocumentSummary[]>;
  getSummaryByDocumentId(input: {
    organizationId: string;
    dceId: string;
    documentId: string;
  }): Promise<DceDocumentSummary | null>;
  /** Détection de doublon par hash (mission §"contrôles fichiers") — ne considère que les
   *  fichiers actifs (Document non supprimé) de ce DCE. */
  findActiveByChecksum(input: {
    organizationId: string;
    dceId: string;
    checksum: string;
  }): Promise<DceDocumentSummary | null>;
  countActiveByDceId(input: { organizationId: string; dceId: string }): Promise<number>;
  /**
   * Mission Sprint 3 — met à jour uniquement `processingStatus` (jamais `category`, jamais
   * recréé) : le module Extraction fait progresser ce statut vers READY_FOR_ANALYSIS /
   * READY_FOR_ANALYSIS_WITH_WARNINGS en miroir d'un DocumentExtraction terminé avec succès,
   * jamais l'inverse (une seule source de vérité par sens de dépendance : DCE → Extraction lit,
   * Extraction → DCE n'écrit que ce seul champ).
   */
  updateProcessingStatus(input: {
    organizationId: string;
    dceId: string;
    documentId: string;
    processingStatus: string;
    updatedAt: Date;
  }): Promise<void>;
  /** V2 Sprint 4 — met à jour uniquement `category` (jamais `processingStatus`), symétrique de
   *  `updateProcessingStatus` ci-dessus : la valeur précédente n'est jamais lue ici (le use case
   *  appelant la connaît déjà via le lien chargé avant l'appel, et l'écrit dans l'AuditLog). */
  updateCategory(input: {
    organizationId: string;
    dceId: string;
    documentId: string;
    category: string;
    updatedAt: Date;
  }): Promise<void>;
  /**
   * Mission P1-2 — sérialise, pour un même DCE, tout le cycle "vérifier l'absence de doublon actif
   * puis créer" derrière un verrou consultatif transactionnel Postgres (`pg_advisory_xact_lock`,
   * même mécanisme que `MembershipRepository.runExclusiveForOrganization`) : un `find` suivi d'un
   * `insert` hors verrou serait une race condition check-then-insert. `fn` ne doit jamais supposer
   * qu'aucun import concurrent du même fichier n'est en cours — il doit relire l'absence de
   * doublon via `dceDocumentRepository.findActiveByChecksum` après l'acquisition du verrou (donc
   * depuis l'intérieur de `fn`), jamais avant d'appeler cette méthode.
   */
  runExclusiveForDce<T>(input: { dceId: string; fn: () => Promise<T> }): Promise<T>;
}

export const DCE_DOCUMENT_REPOSITORY = Symbol("DCE_DOCUMENT_REPOSITORY");
