import { InvalidFilenameError } from "./errors";

// eslint-disable-next-line no-control-regex -- neutralisation intentionnelle des caractères de contrôle (0x00-0x1f) dans un nom de fichier fourni par l'utilisateur.
const UNSAFE_CHARACTERS = /[/\\:*?"<>|\x00-\x1f]/g;
const MAX_FILENAME_LENGTH = 255;

/**
 * Même logique que `documents/domain/filename-sanitizer.ts` (délibérément dupliquée plutôt que
 * réutilisée à travers la frontière de module — voir le rapport final, section décisions
 * techniques : la clé de stockage physique n'est de toute façon jamais dérivée de ce nom, seul
 * l'affichage en dépend). Ne neutralise jamais la clé de stockage elle-même : la génération de
 * clé physique reste entièrement déléguée à Documents (buildStorageKey), jamais reconstruite ici.
 */
export function sanitizeFilename(originalFilename: string): string {
  const trimmed = originalFilename.trim();
  if (!trimmed) {
    throw new InvalidFilenameError({ filename: originalFilename });
  }

  const withoutPathSegments = trimmed.split(/[/\\]/).pop() ?? trimmed;
  const sanitized = withoutPathSegments.replace(UNSAFE_CHARACTERS, "_").slice(0, MAX_FILENAME_LENGTH);

  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new InvalidFilenameError({ filename: originalFilename });
  }

  return sanitized;
}

export function extractExtension(filename: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1]!.toLowerCase() : "";
}
