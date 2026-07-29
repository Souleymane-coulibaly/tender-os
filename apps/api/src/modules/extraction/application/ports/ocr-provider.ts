/**
 * OCR d'une SEULE image (mission Sprint 3 §9) — jamais un PDF entier : un PDF scanné multi-page
 * est rasterisé page par page par l'orchestrateur (voir PdfRasterizer), qui appelle ce port une
 * fois par page. Garde le port simple et testable indépendamment du nombre de pages.
 */
export type OcrInput = Readonly<{
  imageBuffer: Buffer;
  mimeType: string;
  /**
   * Indications de langue, jamais une vérité absolue (mission §9 — "Utilise la langue du Tender
   * comme indication, pas comme vérité absolue") : la langue réellement détectée par le
   * fournisseur (`detectedLanguage` du résultat) prévaut toujours sur cette liste.
   */
  languageHints: readonly string[];
}>;

export type OcrBlock = Readonly<{ text: string; confidence?: number | undefined }>;

export type OcrResult = Readonly<{
  text: string;
  /** Blocs/lignes si le fournisseur les distingue — jamais une reconstruction de mise en page. */
  blocks?: readonly OcrBlock[] | undefined;
  /** 0-100, jamais garanti par tous les fournisseurs. */
  confidence?: number | undefined;
  detectedLanguage?: string | undefined;
  durationMs: number;
  /** Nom du moteur, jamais une clé/secret (mission §9 "sécurité"). */
  provider: string;
  providerVersion?: string | undefined;
  providerRequestId?: string | undefined;
  warnings: readonly string[];
}>;

export interface OcrProvider {
  extract(input: OcrInput): Promise<OcrResult>;
}

export const OCR_PROVIDER = Symbol("OCR_PROVIDER");
