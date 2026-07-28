import type { ZipImportLimits } from "../application/ports/zip-archive-inspector";

export type DceConfig = Readonly<{
  maxFileSizeBytes: number;
  maxFilesPerImport: number;
  zipLimits: ZipImportLimits;
}>;

export const DCE_CONFIG = Symbol("DCE_CONFIG");

const REQUIRED_ENV_VARS = [
  "DCE_MAX_FILE_SIZE_MB",
  "DCE_MAX_FILES_PER_IMPORT",
  "DCE_ZIP_MAX_ENTRIES",
  "DCE_ZIP_MAX_TOTAL_UNCOMPRESSED_MB",
  "DCE_ZIP_MAX_SINGLE_ENTRY_UNCOMPRESSED_MB",
  "DCE_ZIP_MAX_COMPRESSION_RATIO",
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

function readPositiveNumber(env: NodeJS.ProcessEnv, name: string): number {
  const raw = env[name];
  if (!raw) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid environment variable ${name}: "${raw}" must be a positive number.`);
  }
  return value;
}

/**
 * Mission P1-4 — la configuration du DCE (limites de taille, de nombre de fichiers, et de sécurité
 * ZIP) doit être validée une seule fois, au démarrage, jamais relue silencieusement à chaque
 * requête (l'ancien code appelait `getRequiredEnv` directement dans le contrôleur, à chaque appel,
 * sans jamais vérifier qu'une valeur numérique invalide ne produise pas un `NaN` désactivant
 * silencieusement toute limite — voir bible/04-architecture/system-architecture.md pour le détail
 * de l'audit). Une configuration absente ou incohérente doit empêcher le démarrage avec un message
 * explicite nommant la variable en cause, jamais échouer au milieu d'une requête utilisateur.
 */
export function loadDceConfig(env: NodeJS.ProcessEnv = process.env): DceConfig {
  for (const name of REQUIRED_ENV_VARS) {
    if (!env[name]) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }

  const maxFileSizeMb = readPositiveInteger(env, "DCE_MAX_FILE_SIZE_MB");
  const maxFilesPerImport = readPositiveInteger(env, "DCE_MAX_FILES_PER_IMPORT");
  const maxEntries = readPositiveInteger(env, "DCE_ZIP_MAX_ENTRIES");
  const maxTotalUncompressedMb = readPositiveInteger(env, "DCE_ZIP_MAX_TOTAL_UNCOMPRESSED_MB");
  const maxSingleEntryUncompressedMb = readPositiveInteger(env, "DCE_ZIP_MAX_SINGLE_ENTRY_UNCOMPRESSED_MB");
  const maxCompressionRatio = readPositiveNumber(env, "DCE_ZIP_MAX_COMPRESSION_RATIO");

  if (maxCompressionRatio <= 1) {
    throw new Error(
      `Invalid environment variable DCE_ZIP_MAX_COMPRESSION_RATIO: "${env.DCE_ZIP_MAX_COMPRESSION_RATIO}" ` +
        "must be greater than 1 (a ratio of 1 or less would reject every legitimate archive).",
    );
  }
  if (maxTotalUncompressedMb < maxSingleEntryUncompressedMb) {
    throw new Error(
      "Invalid DCE ZIP configuration: DCE_ZIP_MAX_TOTAL_UNCOMPRESSED_MB " +
        `(${maxTotalUncompressedMb}) must be greater than or equal to ` +
        `DCE_ZIP_MAX_SINGLE_ENTRY_UNCOMPRESSED_MB (${maxSingleEntryUncompressedMb}).`,
    );
  }

  return {
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
    maxFilesPerImport,
    zipLimits: {
      maxEntries,
      maxTotalUncompressedBytes: maxTotalUncompressedMb * 1024 * 1024,
      maxSingleEntryUncompressedBytes: maxSingleEntryUncompressedMb * 1024 * 1024,
      maxCompressionRatio,
    },
  };
}
