import { UnsafeArchivePathError } from "./errors";

// eslint-disable-next-line no-control-regex -- neutralisation intentionnelle des caractères de contrôle.
const UNSAFE_CHARACTERS = /[<>:"|?*\x00-\x1f]/g;
const RESERVED_WINDOWS_NAMES = new Set(["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"]);
const MAX_SEGMENT_LENGTH = 200;

/**
 * Mission Sprint 8A §52/§54 — convention de nommage sûre pour un chemin À L'INTÉRIEUR du ZIP final.
 * Rejette explicitement : chemins absolus, `..`, backslash, caractères interdits, noms réservés
 * Windows, segments vides (protection zip slip + compatibilité cross-platform).
 */
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

/** Vérifie qu'un chemin déjà construit ne sort jamais de la racine de l'archive (défense en
 *  profondeur, même si `buildSafeArchivePath` ne produit normalement jamais un tel chemin). */
export function assertArchivePathIsContained(path: string): void {
  if (path.startsWith("/") || path.startsWith("\\") || /^[a-zA-Z]:/.test(path) || path.split("/").includes("..")) {
    throw new UnsafeArchivePathError(path);
  }
}
