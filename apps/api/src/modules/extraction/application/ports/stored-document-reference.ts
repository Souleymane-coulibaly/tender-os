/**
 * Référence à un fichier déjà stocké (mission Sprint 3 §6) — jamais le buffer lui-même dans le
 * type : chaque adaptateur décide comment le lire (`StorageProvider.openReadStream`), ce contrat
 * ne fait que désigner QUEL fichier lire, indépendamment du fournisseur de stockage concret.
 */
export type StoredDocumentReference = Readonly<{
  organizationId: string;
  documentId: string;
  /** Correctif audit Codex round 2 P1 (Chat IA conversationnel) — la version DE `Document` dont
   *  `storageKey` provient réellement, capturée au moment de la résolution (voir
   *  `resolveStoredDocumentReference`) : c'est cette valeur, jamais `Document.currentVersionId`
   *  relu après coup, qui doit être persistée sur `DocumentExtraction.documentVersionId`. */
  documentVersionId: string;
  storageKey: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
}>;
