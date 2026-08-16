import type { StorageProvider } from "../application/ports/storage-provider";
import { CloudflareR2StorageProvider } from "./cloudflare-r2-storage.provider";
import { LocalFilesystemStorageProvider } from "./local-filesystem-storage.provider";
import { loadR2Config } from "./r2-config";

/**
 * Mission §26.X.2 — sélection EXPLICITE du provider de stockage via `DOCUMENT_STORAGE_DRIVER`,
 * jamais déduite d'une heuristique fragile (ex. présence de variables R2). Construit directement
 * (`new`, jamais via `providers: [...]` de Nest) uniquement l'implémentation sélectionnée : lister
 * les deux classes comme providers Nest forcerait leur instanciation systématique pendant la
 * construction du graphe DI, y compris celle non retenue — `CloudflareR2StorageProvider` valide sa
 * configuration dans son constructeur (mission §26.X fail-fast), ce qui ferait échouer le
 * démarrage même quand `local` est sélectionné et qu'aucune variable R2 n'est configurée.
 */
export function createStorageProvider(env: NodeJS.ProcessEnv = process.env): StorageProvider {
  const driver = env.DOCUMENT_STORAGE_DRIVER ?? "local";

  if (driver === "local") {
    return new LocalFilesystemStorageProvider();
  }
  if (driver === "r2") {
    return new CloudflareR2StorageProvider(loadR2Config(env));
  }

  throw new Error(`Invalid environment variable DOCUMENT_STORAGE_DRIVER: "${driver}" — must be "local" or "r2".`);
}
