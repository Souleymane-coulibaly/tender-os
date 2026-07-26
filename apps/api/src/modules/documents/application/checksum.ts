import { createHash } from "node:crypto";

/** Utilitaire pur (aucune E/S) — `node:crypto` est un module de calcul du runtime Node, pas
 *  un SDK de stockage : son usage ici ne viole pas l'indépendance du Domain/Application vis-à-vis
 *  du fournisseur de stockage (conception §5/§L). */
export function computeChecksum(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
