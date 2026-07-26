import type { DocumentVersion } from "../../domain/document-version.entity";

/** Lecture seule — toute écriture d'une DocumentVersion passe par les méthodes composites de
 *  `DocumentRepository` (`createWithInitialVersion`/`addVersionAndPromote`), jamais d'ici :
 *  une version n'est jamais créée sans que le Document ne soit mis à jour dans la même
 *  transaction (voir conception §F, §G). */
export interface DocumentVersionRepository {
  findById(input: { organizationId: string; documentId: string; versionId: string }): Promise<DocumentVersion | null>;
  listByDocument(input: { organizationId: string; documentId: string }): Promise<DocumentVersion[]>;
  /** Chargement groupé pour plusieurs versions courantes en une requête — évite le N+1 lors de
   *  l'enrichissement d'une page de résultats (mêmes principes que le module Tenders). */
  findByIds(input: { organizationId: string; versionIds: readonly string[] }): Promise<DocumentVersion[]>;
  /** Plus haut `versionNumber` existant pour ce document (0 si aucune) — sert à calculer le
   *  prochain numéro ; la contrainte unique (documentId, versionNumber) reste le véritable
   *  garde-fou de concurrence, cette lecture n'est qu'une aide au calcul optimiste. */
  getHighestVersionNumber(input: { organizationId: string; documentId: string }): Promise<number>;
}

export const DOCUMENT_VERSION_REPOSITORY = Symbol("DOCUMENT_VERSION_REPOSITORY");
