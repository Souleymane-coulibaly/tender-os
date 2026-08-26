import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider } from "../application/ports/storage-provider";
import type { R2Config } from "./r2-config";

/** Checkpoint TENDEROS-2.1-P2.3-E12 (P1) — voir le constructeur. Établissement de connexion court
 *  (une cible injoignable doit échouer vite) ; transfert plus long (un DCE volumineux traverse
 *  légitimement plusieurs dizaines de secondes). */
const R2_CONNECTION_TIMEOUT_MS = 5_000;
const R2_REQUEST_TIMEOUT_MS = 60_000;

function isNotFound(error: unknown): boolean {
  return error instanceof S3ServiceException && error.name === "NotFound";
}

function wrapError(operation: string, key: string, cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : String(cause);
  // Ne jamais interpoler la configuration (secretAccessKey, accessKeyId) dans un message d'erreur
  // — seuls l'opération et la clé objet (jamais un secret) apparaissent ici (mission §26.X.17).
  return new Error(`Failed to ${operation} object "${key}" in Cloudflare R2: ${message}`, { cause });
}

/**
 * Mission §26.X — adaptateur Cloudflare R2 (API S3-compatible) du port `StorageProvider`. Jamais
 * instancié directement par la DI Nest (voir `storage-provider.factory.ts` — construit uniquement
 * si `DOCUMENT_STORAGE_DRIVER=r2`, jamais par une liste `providers` qui forcerait Nest à
 * l'instancier même quand `local` est sélectionné). Le bucket reste privé par défaut (mission
 * §26.X.9) : `generateSignedUrl` produit une URL signée à durée de vie courte, jamais un accès
 * public permanent.
 */
export class CloudflareR2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2Config) {
    this.client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // Checkpoint TENDEROS-2.1-P2.3-E12 (P1, mission §50/§57) — `NodeHttpHandler` laisse
      // `requestTimeout` DÉSACTIVÉ par défaut : un socket semi-ouvert vers R2 (put/get/head/delete)
      // pouvait faire pendre INDÉFINIMENT la requête HTTP appelante (upload/téléchargement de
      // document, export), immobilisant une connexion du pool sans jamais échouer ni se libérer.
      // Seul adaptateur externe du dépôt sans borne temporelle explicite — tous les autres
      // (OpenAI/BOAMP/TED/Resend/webhooks/connecteurs) utilisent déjà `AbortSignal.timeout`.
      // Bornes distinctes : l'établissement de connexion doit échouer vite, le transfert d'un gros
      // DCE a besoin de plus de marge. `maxAttempts` explicite plutôt que le défaut implicite du
      // SDK — jamais un second moteur de retry, simplement la valeur rendue visible.
      requestHandler: { connectionTimeout: R2_CONNECTION_TIMEOUT_MS, requestTimeout: R2_REQUEST_TIMEOUT_MS },
      maxAttempts: 3,
    });
    this.bucket = config.bucketName;
  }

  async put(input: { key: string; content: Readable; contentType: string; sizeBytes: number }): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.content,
          ContentType: input.contentType,
          ContentLength: input.sizeBytes,
        }),
      );
    } catch (error) {
      throw wrapError("store", input.key, error);
    }
  }

  async openReadStream(key: string): Promise<Readable> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      // `Body` est typé en union par le SDK (compatibilité navigateur/Node), mais en environnement
      // Node.js `@aws-sdk/client-s3` renvoie toujours un `Readable` réel — garantie documentée du
      // runtime Node du SDK, jamais une simple supposition non vérifiée.
      return response.Body as Readable;
    } catch (error) {
      throw wrapError("read", key, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      throw wrapError("delete", key, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      // Une erreur autre que "objet absent" (panne réseau, permissions, throttling) ne doit jamais
      // être avalée en `false` — ce serait confondre une panne réelle avec une absence légitime
      // (mission §26.X.18 "jamais un succès silencieux").
      throw wrapError("check existence of", key, error);
    }
  }

  async getMetadata(key: string): Promise<{ sizeBytes: number; contentType: string } | null> {
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        sizeBytes: response.ContentLength ?? 0,
        contentType: response.ContentType ?? "application/octet-stream",
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw wrapError("read metadata of", key, error);
    }
  }

  async generateSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    try {
      return await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      });
    } catch (error) {
      throw wrapError("sign a URL for", key, error);
    }
  }
}
