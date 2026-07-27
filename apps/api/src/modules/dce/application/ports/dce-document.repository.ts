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
}

export const DCE_DOCUMENT_REPOSITORY = Symbol("DCE_DOCUMENT_REPOSITORY");
