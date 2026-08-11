import { UnsafeArchivePathError } from "./errors";

// eslint-disable-next-line no-control-regex -- neutralisation intentionnelle des caractères de contrôle.
const UNSAFE_CHARACTERS = /[<>:"|?*\x00-\x1f]/g;
const RESERVED_WINDOWS_NAMES = new Set(["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"]);
const MAX_SEGMENT_LENGTH = 200;

/** Technique copiée telle quelle depuis `submission-package/domain/archive-path-safety.ts`
 *  (Sprint 8A §52/§54, décision utilisateur explicite Sprint 14 : "réutiliser impérativement le
 *  mécanisme ZIP/manifest/checksum/zip-slip déjà éprouvé") — dupliquée volontairement (même motif
 *  que `AtomicTransactionRunner`/`AuditLogWriter` partout dans ce dépôt), jamais importée à
 *  travers la frontière du module `submission-package` qui ne l'exporte pas publiquement. Rejette
 *  explicitement : chemins absolus, `..`, backslash, caractères interdits, noms réservés Windows,
 *  segments vides (protection zip slip + compatibilité cross-platform). */
export function buildSafeArchivePath(rawSegments: readonly string[]): string {
  if (rawSegments.length === 0) {
    throw new UnsafeArchivePathError("(empty)");
  }
  const segments = rawSegments.map((segment) => sanitizeSegment(segment));
  return segments.join("/");
}

function sanitizeSegment(segment: string): string {
  const trimmed = segment.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") {
    throw new UnsafeArchivePathError(segment);
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new UnsafeArchivePathError(segment);
  }
  const sanitized = trimmed.replace(UNSAFE_CHARACTERS, "_").slice(0, MAX_SEGMENT_LENGTH);
  const withoutExtension = sanitized.split(".")[0]?.toUpperCase() ?? "";
  if (RESERVED_WINDOWS_NAMES.has(withoutExtension)) {
    throw new UnsafeArchivePathError(segment);
  }
  if (!sanitized) {
    throw new UnsafeArchivePathError(segment);
  }
  return sanitized;
}

/** Seconde barrière défensive contre le zip-slip, même si chaque `archivePath` a déjà été validé
 *  par `buildSafeArchivePath` en amont. */
export function assertArchivePathIsContained(path: string): void {
  if (path.startsWith("/") || path.startsWith("\\") || /^[a-zA-Z]:/.test(path) || path.split("/").includes("..")) {
    throw new UnsafeArchivePathError(path);
  }
}
