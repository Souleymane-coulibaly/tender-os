import { createHash } from "node:crypto";

/** Utilitaire pur, identique à `documents/application/checksum.ts` (voir note de duplication
 *  volontaire dans `dce/domain/filename-sanitizer.ts`). */
export function computeChecksum(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
