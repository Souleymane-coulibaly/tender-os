import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CloudflareR2StorageProvider } from "./cloudflare-r2-storage.provider";
import { LocalFilesystemStorageProvider } from "./local-filesystem-storage.provider";
import { createStorageProvider } from "./storage-provider.factory";

const R2_ENV: NodeJS.ProcessEnv = {
  DOCUMENT_STORAGE_DRIVER: "r2",
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "bucket",
  R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
};

describe("createStorageProvider", () => {
  // `createStorageProvider(env)` sélectionne explicitement une implémentation à partir de `env`,
  // mais `LocalFilesystemStorageProvider` (jamais modifié, mission §26.X.12) lit
  // `DOCUMENT_LOCAL_STORAGE_PATH` directement sur le VRAI `process.env` dans son propre
  // constructeur — même motif que l'existant `local-filesystem-storage.provider.integration.spec.ts`.
  // Pour les cas "driver local", le `process.env` réel doit donc être positionné, pas seulement
  // l'objet `env` passé en paramètre.
  const originalPath = process.env.DOCUMENT_LOCAL_STORAGE_PATH;
  beforeEach(() => {
    process.env.DOCUMENT_LOCAL_STORAGE_PATH = "./.local-storage/factory-spec";
  });
  afterEach(() => {
    process.env.DOCUMENT_LOCAL_STORAGE_PATH = originalPath;
  });

  it("defaults to the local provider when DOCUMENT_STORAGE_DRIVER is unset — mission §26.X.2 explicit selection, but never a breaking default", () => {
    expect(createStorageProvider({})).toBeInstanceOf(LocalFilesystemStorageProvider);
  });

  it("returns the local provider when DOCUMENT_STORAGE_DRIVER=local", () => {
    expect(createStorageProvider({ DOCUMENT_STORAGE_DRIVER: "local" })).toBeInstanceOf(LocalFilesystemStorageProvider);
  });

  it("never constructs (or validates) the R2 provider when the local driver is selected", () => {
    // Aucune variable R2_* n'est présente ici — si la sélection instanciait quand même
    // CloudflareR2StorageProvider (même sans l'utiliser), `loadR2Config` lèverait une erreur.
    // L'absence d'erreur prouve que seule la branche retenue est jamais construite.
    expect(() => createStorageProvider({})).not.toThrow();
  });

  it("returns the R2 provider when DOCUMENT_STORAGE_DRIVER=r2 and all R2 variables are present", () => {
    expect(createStorageProvider(R2_ENV)).toBeInstanceOf(CloudflareR2StorageProvider);
  });

  it("fails fast, naming the missing variable, when DOCUMENT_STORAGE_DRIVER=r2 but R2 config is incomplete", () => {
    const incomplete = { ...R2_ENV, R2_SECRET_ACCESS_KEY: undefined };

    expect(() => createStorageProvider(incomplete)).toThrow(/R2_SECRET_ACCESS_KEY/);
  });

  it("throws naming the variable and the invalid value for an unrecognized driver — never a fragile heuristic", () => {
    expect(() => createStorageProvider({ DOCUMENT_STORAGE_DRIVER: "s3" })).toThrow(/DOCUMENT_STORAGE_DRIVER.*"s3"/);
  });
});
