import { describe } from "vitest";
import { runStorageProviderContractTests } from "../test-support/storage-provider.contract-tests";
import { CloudflareR2StorageProvider } from "./cloudflare-r2-storage.provider";
import { loadR2Config } from "./r2-config";

const REQUIRED_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_ENDPOINT"] as const;

function hasRealR2Credentials(env: NodeJS.ProcessEnv): boolean {
  return REQUIRED_VARS.every((name) => Boolean(env[name]));
}

/**
 * Mission §26.X.13/§26.X.14 — même suite de contract tests que l'adaptateur local, exécutée
 * contre un VRAI bucket R2 cette fois. `pnpm test:integration` (glob `integration.spec.ts`) sait
 * déjà ramasser ce fichier — sans les 5 variables `R2_*` réelles dans l'environnement, la suite se
 * SKIP proprement (jamais un échec) : ni `pnpm test` (exclut déjà les `*.integration.spec.ts`) ni
 * `pnpm test:integration` sans credentials ne dépendent d'Internet.
 */
describe.skipIf(!hasRealR2Credentials(process.env))("CloudflareR2StorageProvider — real R2 bucket", () => {
  runStorageProviderContractTests("r2", async () => {
    const provider = new CloudflareR2StorageProvider(loadR2Config());
    const cleanupKeys: string[] = [];

    // Enveloppe légère : les clés utilisées par la suite partagée sont préfixées de façon unique
    // par exécution, et chaque `put` réel est suivi jusqu'au nettoyage final (jamais d'objet
    // orphelin laissé sur le vrai bucket de test après la suite).
    const originalPut = provider.put.bind(provider);
    provider.put = async (input) => {
      cleanupKeys.push(input.key);
      return originalPut(input);
    };

    return {
      provider,
      cleanup: async () => {
        await Promise.all(cleanupKeys.map((key) => provider.delete(key).catch(() => undefined)));
      },
    };
  });
});
