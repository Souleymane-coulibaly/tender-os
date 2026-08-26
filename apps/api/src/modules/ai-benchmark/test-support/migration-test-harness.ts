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

/** Préfixe EXCLUSIF des bases jetables de ce harness — jamais une base de développement. */
const THROWAWAY_PREFIX = "tenderos_migproof_";
/** Une base plus vieille que ce délai ne peut appartenir qu'à un run mort : la plus longue chaîne
 *  de migrations rejouée ici prend quelques minutes, jamais plusieurs heures. */
const STALE_THROWAWAY_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.3 (§18) — auto-réparation : les bases jetables sont bien
 * supprimées par `afterAll` en cas de succès ET d'échec, mais PAS quand le process de test est tué
 * (timeout global, interruption, crash) — le hook ne s'exécute alors jamais. Douze bases orphelines
 * s'étaient ainsi accumulées sur plusieurs jours, chacune de ~10 Mo, dégradant progressivement les
 * `CREATE DATABASE` suivants. Purge donc les résidus ANCIENS (jamais ceux d'un run concurrent en
 * cours) au moment de créer une nouvelle base : c'est le seul instant où l'on sait qu'un run de
 * migration démarre. Le nom porte son horodatage de création, aucune métadonnée externe n'est requise.
 */
async function dropStaleThrowawayDatabases(client: { $queryRawUnsafe: (sql: string) => Promise<unknown>; $executeRawUnsafe: (sql: string) => Promise<unknown> }): Promise<void> {
  const rows = (await client.$queryRawUnsafe(`SELECT datname FROM pg_database WHERE datname LIKE '${THROWAWAY_PREFIX}%'`)) as { datname: string }[];
  const now = Date.now();
  for (const { datname } of rows) {
    const timestamp = Number(/_(\d{10,})/.exec(datname)?.[1]);
    // Un nom non horodaté n'est jamais supprimé : on ne devine pas.
    if (!Number.isFinite(timestamp) || now - timestamp < STALE_THROWAWAY_AGE_MS) continue;
    await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
  }
}

export async function createThrowawayDatabase(name: string): Promise<void> {
  await withAdminClient(async (client) => {
    await dropStaleThrowawayDatabases(client);
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
