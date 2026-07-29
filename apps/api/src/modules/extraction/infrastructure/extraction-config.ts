export type ExtractionConfig = Readonly<{
  ocrProvider: string;
  ocrTimeoutMs: number;
  ocrMaxRetries: number;
  ocrRetryDelayMs: number;
  ocrMaxFileSizeBytes: number;
  ocrSupportedMimeTypes: readonly string[];
  extractionMaxPages: number;
  extractionMaxCharacters: number;
  extractionChunkSize: number;
  extractionChunkOverlap: number;
  extractionMinTextLength: number;
  /** Correction P1-03 — taille de fichier maximale, tous formats confondus, contrôlée sur la
   *  seule métadonnée déjà connue (`DocumentVersion.sizeBytes`) avant toute lecture. */
  extractionMaxFileSizeBytes: number;
  extractionMaxSheets: number;
  extractionMaxRowsPerSheet: number;
  extractionMaxImageDimensionPx: number;
}>;

export const EXTRACTION_CONFIG = Symbol("EXTRACTION_CONFIG");

const REQUIRED_ENV_VARS = [
  "OCR_PROVIDER",
  "OCR_TIMEOUT_MS",
  "OCR_MAX_RETRIES",
  "OCR_RETRY_DELAY_MS",
  "OCR_MAX_FILE_SIZE_MB",
  "OCR_SUPPORTED_MIME_TYPES",
  "EXTRACTION_MAX_PAGES",
  "EXTRACTION_MAX_CHARACTERS",
  "EXTRACTION_CHUNK_SIZE",
  "EXTRACTION_CHUNK_OVERLAP",
  "EXTRACTION_MIN_TEXT_LENGTH",
  "EXTRACTION_MAX_FILE_SIZE_MB",
  "EXTRACTION_MAX_SHEETS",
  "EXTRACTION_MAX_ROWS_PER_SHEET",
  "EXTRACTION_MAX_IMAGE_DIMENSION_PX",
] as const;

function readPositiveInteger(env: NodeJS.ProcessEnv, name: string): number {
  const raw = env[name];
  if (!raw) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid environment variable ${name}: "${raw}" must be a positive integer.`);
  }
  return value;
}

function readNonNegativeInteger(env: NodeJS.ProcessEnv, name: string): number {
  const raw = env[name];
  if (!raw) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid environment variable ${name}: "${raw}" must be a non-negative integer.`);
  }
  return value;
}

/**
 * Mission Sprint 3 §20 — validée une seule fois au démarrage, même stratégie que
 * `dce-config.ts` (Lot 2) : une configuration absente ou incohérente empêche le boot avec un
 * message explicite nommant la variable en cause, jamais un échec silencieux au milieu d'une
 * extraction. Aucun secret ici (`OCR_PROVIDER` ne nomme qu'un moteur, jamais une clé — voir
 * TesseractOcrProvider, qui ne requiert aucune clé fournisseur pour cette tranche).
 */
export function loadExtractionConfig(env: NodeJS.ProcessEnv = process.env): ExtractionConfig {
  for (const name of REQUIRED_ENV_VARS) {
    if (!env[name]) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }

  const ocrProvider = env.OCR_PROVIDER!;
  const ocrTimeoutMs = readPositiveInteger(env, "OCR_TIMEOUT_MS");
  const ocrMaxRetries = readNonNegativeInteger(env, "OCR_MAX_RETRIES");
  const ocrRetryDelayMs = readNonNegativeInteger(env, "OCR_RETRY_DELAY_MS");
  const ocrMaxFileSizeMb = readPositiveInteger(env, "OCR_MAX_FILE_SIZE_MB");
  const ocrSupportedMimeTypes = env.OCR_SUPPORTED_MIME_TYPES!.split(",").map((entry) => entry.trim()).filter(Boolean);
  const extractionMaxPages = readPositiveInteger(env, "EXTRACTION_MAX_PAGES");
  const extractionMaxCharacters = readPositiveInteger(env, "EXTRACTION_MAX_CHARACTERS");
  const extractionChunkSize = readPositiveInteger(env, "EXTRACTION_CHUNK_SIZE");
  const extractionChunkOverlap = readNonNegativeInteger(env, "EXTRACTION_CHUNK_OVERLAP");
  const extractionMinTextLength = readNonNegativeInteger(env, "EXTRACTION_MIN_TEXT_LENGTH");
  const extractionMaxFileSizeMb = readPositiveInteger(env, "EXTRACTION_MAX_FILE_SIZE_MB");
  const extractionMaxSheets = readPositiveInteger(env, "EXTRACTION_MAX_SHEETS");
  const extractionMaxRowsPerSheet = readPositiveInteger(env, "EXTRACTION_MAX_ROWS_PER_SHEET");
  const extractionMaxImageDimensionPx = readPositiveInteger(env, "EXTRACTION_MAX_IMAGE_DIMENSION_PX");

  if (ocrSupportedMimeTypes.length === 0) {
    throw new Error("Invalid environment variable OCR_SUPPORTED_MIME_TYPES: must list at least one MIME type.");
  }
  if (extractionChunkOverlap >= extractionChunkSize) {
    throw new Error(
      `Invalid extraction configuration: EXTRACTION_CHUNK_OVERLAP (${extractionChunkOverlap}) must be smaller ` +
        `than EXTRACTION_CHUNK_SIZE (${extractionChunkSize}).`,
    );
  }

  return {
    ocrProvider,
    ocrTimeoutMs,
    ocrMaxRetries,
    ocrRetryDelayMs,
    ocrMaxFileSizeBytes: ocrMaxFileSizeMb * 1024 * 1024,
    ocrSupportedMimeTypes,
    extractionMaxPages,
    extractionMaxCharacters,
    extractionChunkSize,
    extractionChunkOverlap,
    extractionMinTextLength,
    extractionMaxFileSizeBytes: extractionMaxFileSizeMb * 1024 * 1024,
    extractionMaxSheets,
    extractionMaxRowsPerSheet,
    extractionMaxImageDimensionPx,
  };
}
