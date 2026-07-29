import type { Readable } from "node:stream";

/** Les bibliothèques d'extraction (pdf-parse, mammoth, xlsx) attendent un buffer complet, jamais
 *  un flux — utilitaire partagé par tous les adaptateurs de ce module plutôt que dupliqué. */
export async function readStreamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
