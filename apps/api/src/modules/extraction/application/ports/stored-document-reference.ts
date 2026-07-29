/**
 * Référence à un fichier déjà stocké (mission Sprint 3 §6) — jamais le buffer lui-même dans le
 * type : chaque adaptateur décide comment le lire (`StorageProvider.openReadStream`), ce contrat
 * ne fait que désigner QUEL fichier lire, indépendamment du fournisseur de stockage concret.
 */
export type StoredDocumentReference = Readonly<{
  organizationId: string;
  documentId: string;
  storageKey: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
}>;
