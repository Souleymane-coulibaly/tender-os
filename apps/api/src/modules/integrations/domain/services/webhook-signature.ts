import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

const SECRET_BYTE_LENGTH = 32;
const SECRET_PREFIX = "whsec_";

export function generateWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(SECRET_BYTE_LENGTH).toString("base64url")}`;
}

/** Mission §28 — signature calculée sur `timestamp + "." + rawBody`, format documenté et
 *  reproductible côté n8n/intégration custom (mission §76). HMAC-SHA256, hex. */
export function signWebhookPayload(input: { secret: string; timestampSeconds: number; rawBody: string }): string {
  const signedPayload = `${input.timestampSeconds}.${input.rawBody}`;
  return createHmac("sha256", input.secret).update(signedPayload, "utf8").digest("hex");
}

export function verifyWebhookSignature(input: { secret: string; timestampSeconds: number; rawBody: string; signature: string }): boolean {
  const expected = signWebhookPayload({ secret: input.secret, timestampSeconds: input.timestampSeconds, rawBody: input.rawBody });
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(input.signature, "hex");
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export const WEBHOOK_HEADERS = {
  Event: "X-TenderOS-Event",
  Delivery: "X-TenderOS-Delivery",
  Timestamp: "X-TenderOS-Timestamp",
  Signature: "X-TenderOS-Signature",
} as const;

/** Mission §29 — tolérance recommandée documentée pour le consommateur (rejeter un événement dont
 *  le timestamp dépasse cette fenêtre, anti-replay). */
export const RECOMMENDED_REPLAY_TOLERANCE_SECONDS = 5 * 60;
