export type R2Config = Readonly<{
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
}>;

const REQUIRED_ENV_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_ENDPOINT"] as const;

/**
 * Mission §26.X — configuration Cloudflare R2, validée une seule fois au moment où elle est
 * réellement chargée (jamais relue silencieusement à chaque requête), même discipline que
 * `dce-config.ts` (`loadDceConfig`) : une variable absente empêche le démarrage avec un message
 * explicite nommant la variable en cause. Contrairement à DCE, cette configuration n'est chargée
 * QUE lorsque `DOCUMENT_STORAGE_DRIVER=r2` est explicitement sélectionné (voir
 * `storage-provider.factory.ts`) — en développement local (`DOCUMENT_STORAGE_DRIVER` absent ou
 * `local`), aucune de ces variables n'est jamais lue ni requise.
 */
export function loadR2Config(env: NodeJS.ProcessEnv = process.env): R2Config {
  for (const name of REQUIRED_ENV_VARS) {
    if (!env[name]) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }

  return {
    accountId: env.R2_ACCOUNT_ID!,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    bucketName: env.R2_BUCKET_NAME!,
    endpoint: env.R2_ENDPOINT!,
  };
}
