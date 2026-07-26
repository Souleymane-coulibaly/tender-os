/**
 * Génère une clé de stockage exclusivement à partir d'identifiants contrôlés par le serveur —
 * jamais à partir du nom de fichier fourni par le client (mission §9, §22 : protection contre
 * le path traversal, noms physiques générés côté serveur).
 */
export function buildStorageKey(input: {
  organizationId: string;
  documentId: string;
  versionId: string;
  extension: string;
}): string {
  const safeExtension = input.extension.replace(/[^a-z0-9]/gi, "");
  return `${input.organizationId}/${input.documentId}/${input.versionId}${safeExtension ? `.${safeExtension}` : ""}`;
}
