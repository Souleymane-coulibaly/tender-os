/**
 * Détection du type réel d'un fichier par ses octets (magic bytes) — jamais l'extension, jamais
 * le type MIME déclaré par le client (mission Sprint 1 §"contrôles fichiers" : "ne jamais faire
 * confiance seul au nom, à l'extension ou au MIME déclaré"). Un résultat `null` signifie que la
 * signature n'a pas pu être identifiée parmi les formats connus — pas nécessairement invalide,
 * simplement non reconnu par cette détection grossière ; le recoupement extension/MIME déclaré
 * (voir `isAllowedDceFileType`) reste le garde-fou principal, cette détection n'est qu'un
 * contrôle supplémentaire, tel que demandé par la mission ("détection MIME quand disponible").
 */
export interface FileSignatureDetector {
  detect(buffer: Buffer): DetectedFileSignature | null;
}

export type DetectedFileSignature = Readonly<{ mimeType: string }>;

export const FILE_SIGNATURE_DETECTOR = Symbol("FILE_SIGNATURE_DETECTOR");
