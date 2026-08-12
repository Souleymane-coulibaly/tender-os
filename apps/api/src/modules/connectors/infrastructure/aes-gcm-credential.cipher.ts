import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { getRequiredEnv } from "../../../shared-kernel/env";
import type { CredentialCipher } from "../application/ports/credential-cipher";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

/**
 * AES-256-GCM, clé applicative unique lue depuis `CONNECTOR_CREDENTIAL_ENCRYPTION_KEY` (32 octets
 * encodés en base64) — démarrage refusé si absente/mal formée (`getRequiredEnv`, même motif que
 * `AUTH_SECRET`, skills/platform-foundation/DEPLOYMENT_PATTERNS.md §11 "l'application refuse de
 * démarrer si une configuration critique est invalide"). Enveloppe auto-portée
 * `base64(iv[12] || authTag[16] || ciphertext)` — un seul champ à persister, jamais de colonnes IV/
 * tag séparées.
 */
@Injectable()
export class AesGcmCredentialCipher implements CredentialCipher {
  private readonly key: Buffer;

  constructor() {
    const raw = Buffer.from(getRequiredEnv("CONNECTOR_CREDENTIAL_ENCRYPTION_KEY"), "base64");
    if (raw.length !== 32) {
      throw new Error("CONNECTOR_CREDENTIAL_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes for AES-256-GCM.");
    }
    this.key = raw;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
  }

  decrypt(ciphertext: string): string {
    const buffer = Buffer.from(ciphertext, "base64");
    const iv = buffer.subarray(0, IV_LENGTH_BYTES);
    const authTag = buffer.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
    const encrypted = buffer.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }
}
