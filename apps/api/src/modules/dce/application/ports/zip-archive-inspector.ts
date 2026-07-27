export type ZipImportLimits = Readonly<{
  maxEntries: number;
  maxTotalUncompressedBytes: number;
  maxSingleEntryUncompressedBytes: number;
  /** Ratio maximal decompressé/compressé toléré par entrée — protection anti "zip bomb". */
  maxCompressionRatio: number;
}>;

export type ZipExtractedEntry = Readonly<{
  /** Nom d'entrée déjà validé structurellement (ni chemin absolu, ni traversal, ni lien
   *  symbolique) — reste un nom brut d'archive, PAS encore passé par `sanitizeFilename` ni par
   *  le contrôle de format DCE : ces contrôles, propres au domaine DCE, restent la responsabilité
   *  de l'appelant (ImportDceZipUseCase), pas de ce port purement structurel/sécurité. */
  entryName: string;
  buffer: Buffer;
}>;

/**
 * Service d'extraction d'archive durci (mission Sprint 1 §"sécurité ZIP obligatoire") — toute
 * anomalie structurelle (chemin absolu, traversal `../`, lien symbolique, nombre d'entrées, taille
 * totale décompressée, ratio de compression) rejette l'archive ENTIÈRE en levant
 * `ZipSecurityViolationError`, avant même que la plupart des octets ne soient décompressés
 * (les tailles/déclarées sont lues depuis le central directory avant extraction — voir
 * l'implémentation `YauzlArchiveInspector`). Ne connaît rien des formats autorisés par DCE
 * (PDF/DOCX/XLSX/XLS/PNG/JPEG) : cette vérification par-fichier reste hors de ce port.
 */
export interface ZipArchiveInspector {
  extract(input: { buffer: Buffer; limits: ZipImportLimits }): Promise<ZipExtractedEntry[]>;
}

export const ZIP_ARCHIVE_INSPECTOR = Symbol("ZIP_ARCHIVE_INSPECTOR");
