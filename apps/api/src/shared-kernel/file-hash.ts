import { createHash } from "node:crypto";

/**
 * Sprint 8A/8A bis — utilitaire pur (aucune E/S), partagé par Export/Signature/Package : le hash
 * d'un artefact doit TOUJOURS être calculé côté serveur sur les bytes réellement stockés, jamais
 * reçu ni fait confiance depuis le frontend (mission §26 "ne jamais faire confiance à un hash
 * envoyé par le frontend"). Même motif que `documents/application/checksum.ts`, partagé ici car
 * utilisé par plusieurs modules (shared-kernel accueille déjà `Clock`/`IdGenerator`).
 */
export function computeSha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export const FILE_HASH_ALGORITHM = "SHA-256";
