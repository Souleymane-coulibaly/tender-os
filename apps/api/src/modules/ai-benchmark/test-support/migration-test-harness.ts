import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Harnais de test — preuve PostgreSQL réelle de la migration `20260731124812_p1_audit_fixes`.
 *
 * Rejoue les fichiers `migration.sql` un par un, via `prisma db execute --file ... --url ...`,
 * contre une base PostgreSQL locale JETABLE créée pour l'occasion — jamais la base de
 * développement partagée, jamais Railway/une base distante, jamais un mock/SQLite. Confirmé
 * empiriquement transactionnel (un fichier multi-instructions est intégralement annulé si une
 * instruction échoue). Note : `$executeRawUnsafe` du client Prisma a été essayé pour accélérer le
 * rejeu, mais échoue sur du DDL pur multi-instructions ("cannot insert multiple commands into a
 * prepared statement" — Postgres bascule en protocole étendu/prepared statement dès qu'aucun bloc
 * `DO $$...$$` ne force le protocole simple) ; `prisma db execute --file` reste donc la méthode
 * utilisée pour CHAQUE application de fichier de migration, jamais contournée par un raccourci qui
 * changerait le comportement réel testé.
 *
 * Pour les répétitions rapides sur un état "juste avant la migration sous audit" (scénarios B/E/F),
 * une base MODÈLE est construite une seule fois via ce même mécanisme, puis clonée par
 * `CREATE DATABASE ... TEMPLATE ...` (clonage natif PostgreSQL, aucun raccourci applicatif) pour
 * chaque répétition — chaque clone est une base PostgreSQL réelle, indépendante, jetable.
 */
const API_ROOT = path.resolve(__dirname, "../../../..");
const MIGRATIONS_DIR = path.join(API_ROOT, "prisma", "migrations");

export function listMigrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => statSync(path.join(MIGRATIONS_DIR, entry)).isDirectory())
    .sort();
}

function adminDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL must be set to derive the local Postgres connection for throwaway test databases.");
  return raw;
}

export function buildDatabaseUrl(databaseName: string): string {
  const url = new URL(adminDatabaseUrl());
  url.pathname = `/${databaseName}`;
  return url.toString();
}

/** Masque le mot de passe pour tout affichage/log — jamais un secret en clair dans un rapport. */
export function maskedAdminUrl(): string {
  const url = new URL(adminDatabaseUrl());
  if (url.password) url.password = "***";
  return url.toString();
}

async function withAdminClient<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = new PrismaClient({ datasources: { db: { url: adminDatabaseUrl() } } });
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

export async function createThrowawayDatabase(name: string): Promise<void> {
  await withAdminClient(async (client) => {
    await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  });
}

export async function dropThrowawayDatabase(name: string): Promise<void> {
  await withAdminClient(async (client) => {
    await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  });
}

/** Clone natif PostgreSQL (`CREATE DATABASE ... TEMPLATE ...`) — jamais un raccourci applicatif :
 *  le résultat est une base réelle indépendante, bit-à-bit identique à la base modèle au moment du
 *  clonage. Exige qu'aucune connexion active ne subsiste sur la base modèle (WITH (FORCE) sur le
 *  DROP éventuel + déconnexion préalable du modèle par l'appelant). */
export async function cloneDatabase(templateName: string, newName: string): Promise<void> {
  await withAdminClient(async (client) => {
    await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${newName}" WITH (FORCE)`);
    await client.$executeRawUnsafe(`CREATE DATABASE "${newName}" TEMPLATE "${templateName}"`);
  });
}

function applyMigrationFile(databaseUrl: string, migrationName: string): void {
  const sqlPath = path.join(MIGRATIONS_DIR, migrationName, "migration.sql");
  // `shell: true` est nécessaire sous Windows pour résoudre `npx.cmd` via le PATH (execFileSync ne
  // résout pas les shims .cmd sans passer par un shell).
  execFileSync("npx", ["prisma", "db", "execute", "--file", sqlPath, "--url", databaseUrl], {
    cwd: API_ROOT,
    stdio: "pipe",
    shell: true,
  });
}

/** Rejoue les migrations dans l'ordre, jusqu'à `throughMigration` (inclus ou exclu). Lève si l'une
 *  d'elles échoue — jamais une erreur avalée silencieusement. */
export function applyMigrationsThrough(databaseUrl: string, throughMigration: string, inclusive: boolean): void {
  const all = listMigrationNames();
  const idx = all.indexOf(throughMigration);
  if (idx === -1) throw new Error(`Unknown migration: ${throughMigration}`);
  const slice = all.slice(0, inclusive ? idx + 1 : idx);
  for (const name of slice) {
    applyMigrationFile(databaseUrl, name);
  }
}

/** Rejoue UNIQUEMENT les migrations de `fromInclusive` à `throughInclusive` (les deux bornes
 *  comprises) — jamais depuis le début. Utilisé pour reprendre une chaîne partiellement rejouée
 *  (ex. après un premier appel `applyMigrationsThrough(..., fromInclusive, false)` suivi de
 *  fixtures manuelles) sans reproduire les migrations déjà appliquées ni en sauter aucune. */
export function applyMigrationsFrom(databaseUrl: string, fromInclusive: string, throughInclusive: string): void {
  const all = listMigrationNames();
  const fromIdx = all.indexOf(fromInclusive);
  const throughIdx = all.indexOf(throughInclusive);
  if (fromIdx === -1) throw new Error(`Unknown migration: ${fromInclusive}`);
  if (throughIdx === -1) throw new Error(`Unknown migration: ${throughInclusive}`);
  const slice = all.slice(fromIdx, throughIdx + 1);
  for (const name of slice) {
    applyMigrationFile(databaseUrl, name);
  }
}

/** Applique explicitement UNE migration nommée (jamais implicite) — utilisé pour appliquer la
 *  migration sous audit après avoir préparé un état "juste avant" avec des fixtures. */
export function applySingleMigration(databaseUrl: string, migrationName: string): void {
  applyMigrationFile(databaseUrl, migrationName);
}

export const TARGET_MIGRATION = "20260731124812_p1_audit_fixes";
