import { InvalidFilenameError } from "./errors";

// eslint-disable-next-line no-control-regex -- neutralisation intentionnelle des caractères de contrôle (0x00-0x1f) dans un nom de fichier fourni par l'utilisateur.
const UNSAFE_CHARACTERS = /[/\\:*?"<>|\x00-\x1f]/g;
const MAX_FILENAME_LENGTH = 255;

/**
 * Nettoie le nom de fichier fourni par l'utilisateur pour un usage d'affichage sûr
 * (jamais utilisé comme clé de stockage — voir `StorageProvider`, la clé physique est
 * toujours générée côté serveur à partir d'identifiants, indépendamment de ce nom).
 * Neutralise les séparateurs de chemin et caractères de contrôle (protection path traversal
 * au niveau de l'affichage, en complément de la génération serveur des clés de stockage).
 */
export function sanitizeFilename(originalFilename: string): string {
  const trimmed = originalFilename.trim();
  if (!trimmed) {
    throw new InvalidFilenameError();
  }

  const withoutPathSegments = trimmed.split(/[/\\]/).pop() ?? trimmed;
  const sanitized = withoutPathSegments.replace(UNSAFE_CHARACTERS, "_").slice(0, MAX_FILENAME_LENGTH);

  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new InvalidFilenameError();
  }

  return sanitized;
}

export function extractExtension(filename: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1]!.toLowerCase() : "";
}
