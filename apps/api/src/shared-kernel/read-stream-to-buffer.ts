import type { Readable } from "node:stream";

/** Utilitaire partagé (déplacé du module Extraction vers le Shared Kernel pour Sprint 8A.2,
 *  correction bugs #7/#8 — Export en a besoin pour charger un logo de thème depuis le stockage,
 *  jamais une seconde implémentation dupliquée) — convertit un flux en buffer complet. */
export async function readStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
