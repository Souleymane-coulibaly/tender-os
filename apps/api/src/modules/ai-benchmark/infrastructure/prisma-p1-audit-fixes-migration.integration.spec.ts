import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigrationsThrough,
  applySingleMigration,
  buildDatabaseUrl,
  cloneDatabase,
  createThrowawayDatabase,
  dropThrowawayDatabase,
  TARGET_MIGRATION,
} from "../test-support/migration-test-harness";

/** Base MODÈLE construite une seule fois (migrations 1..N-1, jamais la migration sous audit) —
 *  chaque scénario B/E/F en clone une copie PostgreSQL native indépendante via `cloneDatabase`,
 *  jamais une réutilisation de la même base entre répétitions (chaque clone est jetable et détruit
 *  après son propre test). */
const TEMPLATE_DB_NAME = `tenderos_migproof_template_${Date.now()}`;

/**
 * Preuve PostgreSQL RÉELLE (réaudit Codex) de la migration
 * `20260731124812_p1_audit_fixes/migration.sql` — jamais une relecture statique du SQL. Chaque
 * test crée une base PostgreSQL locale JETABLE dédiée (jamais la base de développement partagée,
 * jamais Railway/une base distante), y rejoue les migrations réelles via
 * `prisma db execute --file ... --url ...` (confirmé transactionnel : un fichier multi-instructions
 * est intégralement annulé si une instruction échoue — voir le test "rollback" ci-dessous), insère
 * des fixtures via SQL brut représentatives d'un état de production réel, puis vérifie le résultat
 * par des requêtes SQL directes.
 *
 * Design du backfill sous audit : contrairement à une reconstruction par date
 * (`effective_from <= date_run AND (effective_to IS NULL OR > date_run) ORDER BY effective_from
 * DESC`), la migration utilise l'ID EXACT déjà enregistré dans
 * `benchmark_run_models.pricing_snapshot_id` (colonne NOT NULL + FK vers
 * `ai_model_pricing_snapshots`, présente depuis la migration précédente) — c'est le snapshot
 * RÉELLEMENT utilisé au lancement du run, jamais une estimation par date. Cette conception rend un
 * "tie-break par date" sans objet : il n'y a pas d'ambiguïté à lever, la référence est déjà unique
 * et exacte. Les tests ci-dessous le démontrent explicitement plutôt que de supposer une stratégie
 * différente.
 */
describe("Migration 20260731124812_p1_audit_fixes — preuve PostgreSQL réelle (réaudit Codex)", () => {
  const createdDatabases: string[] = [];

  beforeAll(async () => {
    await createThrowawayDatabase(TEMPLATE_DB_NAME);
    applyMigrationsThrough(buildDatabaseUrl(TEMPLATE_DB_NAME), TARGET_MIGRATION, false);
  }, 180000);

  afterAll(async () => {
    await dropThrowawayDatabase(TEMPLATE_DB_NAME);
  }, 30000);

  afterEach(async () => {
    for (const name of createdDatabases.splice(0)) {
      await dropThrowawayDatabase(name);
    }
  });

  function freshDatabaseName(label: string): string {
    const name = `tenderos_migproof_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    createdDatabases.push(name);
    return name;
  }

  async function assertPricingColumns(databaseUrl: string): Promise<void> {
    const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const cols = (await client.$queryRawUnsafe(
        `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'benchmark_run_models' AND column_name LIKE 'pricing%' ORDER BY column_name`,
      )) as { column_name: string; is_nullable: string }[];
      const byName = Object.fromEntries(cols.map((c) => [c.column_name, c.is_nullable]));
      expect(byName["pricing_currency"]).toBe("NO");
      expect(byName["pricing_effective_from"]).toBe("NO");
      expect(byName["pricing_input_price_per_million_tokens"]).toBe("NO");
      expect(byName["pricing_output_price_per_million_tokens"]).toBe("NO");
      expect(byName["pricing_cached_input_price_per_million_tokens"]).toBe("YES");
    } finally {
      await client.$disconnect();
    }
  }

  it(
    "Scénario A — base vide : la chaîne complète des 21 migrations s'applique sans erreur, colonnes NOT NULL présentes",
    async () => {
      const dbName = freshDatabaseName("empty");
      await createThrowawayDatabase(dbName);
      const url = buildDatabaseUrl(dbName);

      // Si une seule des 21 migrations échoue, `applyMigrationsThrough` lève et le test échoue
      // naturellement — jamais une erreur avalée silencieusement.
      await applyMigrationsThrough(url, TARGET_MIGRATION, true);
      await assertPricingColumns(url);
    },
    // Rejeu réel des 21 migrations via 21 appels `npx prisma db execute` séquentiels (overhead
    // node/npx à chaque appel) — délai généreux, jamais un raccourci qui réduirait la rigueur.
    300000,
  );

  it(
    "Scénario B — base existante avec plusieurs modèles et plusieurs snapshots : chaque ligne reçoit EXACTEMENT le tarif qu'elle référençait déjà, jamais celui d'un autre modèle ni un tarif plus récent",
    async () => {
      const dbName = freshDatabaseName("multimodel");
      // Clone PostgreSQL natif de la base modèle (migrations 1..N-1 déjà appliquées) — base réelle
      // indépendante, jamais une réutilisation partagée entre tests.
      await cloneDatabase(TEMPLATE_DB_NAME, dbName);
      const url = buildDatabaseUrl(dbName);

      const client = new PrismaClient({ datasources: { db: { url } } });
      try {
        const orgId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO organizations (id, name, slug, default_timezone, status, created_at, updated_at) VALUES ($1::uuid, $2, $3, $4, $5, now(), now())`,
          orgId,
          "Migration Proof Org",
          `migration-proof-org-${orgId}`,
          "Europe/Paris",
          "TRIAL",
        );

        // Trois modèles, tarifs très différents.
        const modelA = randomUUID();
        const modelB = randomUUID();
        const modelC = randomUUID();
        for (const [id, key] of [
          [modelA, "gpt-4o-mini"],
          [modelB, "gpt-4o"],
          [modelC, "gpt-4.1-mini"],
        ] as const) {
          await client.$executeRawUnsafe(
            `INSERT INTO ai_models (id, provider, model_key, display_name, status, capabilities_structured_output, capabilities_tool_calling, capabilities_vision, enabled_for_benchmark, enabled_for_production, created_at, updated_at) VALUES ($1::uuid, 'OPENAI', $2, $2, 'ENABLED', false, false, false, true, true, now(), now())`,
            id,
            key,
          );
        }

        // Modèle A : ancien snapshot (utilisé par un run passé) ET un snapshot futur (jamais
        // référencé par aucune ligne existante — ne doit jamais être choisi).
        const oldSnapA = randomUUID();
        const futureSnapA = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO ai_model_pricing_snapshots (id, ai_model_id, input_price_per_million_tokens, output_price_per_million_tokens, currency, effective_from, effective_to, created_at) VALUES ($1::uuid, $2::uuid, 5, 15, 'USD', '2026-07-01'::timestamp, '2026-07-20'::timestamp, now())`,
          oldSnapA,
          modelA,
        );
        await client.$executeRawUnsafe(
          `INSERT INTO ai_model_pricing_snapshots (id, ai_model_id, input_price_per_million_tokens, output_price_per_million_tokens, currency, effective_from, effective_to, created_at) VALUES ($1::uuid, $2::uuid, 777, 888, 'USD', '2099-01-01'::timestamp, NULL, now())`,
          futureSnapA,
          modelA,
        );

        // Modèle B : snapshot EUR distinct.
        const snapB = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO ai_model_pricing_snapshots (id, ai_model_id, input_price_per_million_tokens, output_price_per_million_tokens, currency, effective_from, effective_to, created_at) VALUES ($1::uuid, $2::uuid, 30, 60, 'EUR', '2026-07-10'::timestamp, NULL, now())`,
          snapB,
          modelB,
        );

        // Modèle C : deux snapshots avec le MÊME effective_from (cas explicitement demandé) — mais
        // seul l'un des deux est référencé par pricing_snapshot_id ; le backfill ne doit dépendre
        // d'aucun tie-break puisqu'il utilise l'ID exact, jamais une correspondance par date.
        const snapC1 = randomUUID();
        const snapC2 = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO ai_model_pricing_snapshots (id, ai_model_id, input_price_per_million_tokens, output_price_per_million_tokens, currency, effective_from, effective_to, created_at) VALUES ($1::uuid, $2::uuid, 10, 20, 'USD', '2026-07-05'::timestamp, NULL, now())`,
          snapC1,
          modelC,
        );
        await client.$executeRawUnsafe(
          `INSERT INTO ai_model_pricing_snapshots (id, ai_model_id, input_price_per_million_tokens, output_price_per_million_tokens, currency, effective_from, effective_to, created_at) VALUES ($1::uuid, $2::uuid, 12, 22, 'USD', '2026-07-05'::timestamp, NULL, now())`,
          snapC2,
          modelC,
        );

        const suiteId = randomUUID();
        const runId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO benchmark_runs (id, organization_id, suite_id, suite_version, status, repetitions, concurrency_limit, estimated_cost_amount, estimated_cost_currency, launched_by_user_id, launched_at, started_at, completed_at, created_at, updated_at) VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 'SUCCEEDED', 1, 1, 1, 'USD', $4::uuid, '2026-07-15'::timestamp, '2026-07-15'::timestamp, '2026-07-15'::timestamp, now(), now())`,
          runId,
          orgId,
          suiteId,
          randomUUID(),
        );

        const rmA = randomUUID();
        const rmB = randomUUID();
        const rmC = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO benchmark_run_models (id, run_id, ai_model_id, pricing_snapshot_id, created_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, '2026-07-15'::timestamp)`,
          rmA,
          runId,
          modelA,
          oldSnapA,
        );
        await client.$executeRawUnsafe(
          `INSERT INTO benchmark_run_models (id, run_id, ai_model_id, pricing_snapshot_id, created_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, '2026-07-15'::timestamp)`,
          rmB,
          runId,
          modelB,
          snapB,
        );
        await client.$executeRawUnsafe(
          `INSERT INTO benchmark_run_models (id, run_id, ai_model_id, pricing_snapshot_id, created_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, '2026-07-15'::timestamp)`,
          rmC,
          runId,
          modelC,
          snapC1,
        );

        const before = (await client.$queryRawUnsafe(`SELECT count(*)::int as c FROM benchmark_run_models`)) as { c: number }[];
        expect(before[0]!.c).toBe(3);

        // Applique la migration sous audit.
        await applySingleMigration(url, TARGET_MIGRATION);

        const rows = (await client.$queryRawUnsafe(
          `SELECT id, ai_model_id, pricing_snapshot_id, pricing_currency, pricing_input_price_per_million_tokens::text as input, pricing_output_price_per_million_tokens::text as output FROM benchmark_run_models ORDER BY id`,
        )) as { id: string; ai_model_id: string; pricing_snapshot_id: string; pricing_currency: string; input: string; output: string }[];

        expect(rows).toHaveLength(3);
        const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

        expect(byId[rmA]!.pricing_snapshot_id).toBe(oldSnapA);
        expect(byId[rmA]!.pricing_currency).toBe("USD");
        expect(Number(byId[rmA]!.input)).toBe(5);
        expect(Number(byId[rmA]!.output)).toBe(15);
        // Jamais le snapshot futur, même s'il existe pour le même modèle.
        expect(byId[rmA]!.pricing_snapshot_id).not.toBe(futureSnapA);

        expect(byId[rmB]!.pricing_snapshot_id).toBe(snapB);
        expect(byId[rmB]!.pricing_currency).toBe("EUR");
        expect(Number(byId[rmB]!.input)).toBe(30);
        expect(Number(byId[rmB]!.output)).toBe(60);

        expect(byId[rmC]!.pricing_snapshot_id).toBe(snapC1);
        expect(Number(byId[rmC]!.input)).toBe(10); // jamais snapC2 (12), même effective_from
        expect(Number(byId[rmC]!.output)).toBe(20);

        // Aucune ligne ne reçoit jamais un ai_model_id différent de celui déjà présent avant
        // migration — jamais une contamination inter-modèle.
        expect(byId[rmA]!.ai_model_id).toBe(modelA);
        expect(byId[rmB]!.ai_model_id).toBe(modelB);
        expect(byId[rmC]!.ai_model_id).toBe(modelC);

        await assertPricingColumns(url);
      } finally {
        await client.$disconnect();
      }
    },
    120000,
  );

  it(
    "Scénario E — référence orpheline (contrainte FK désactivée pour le test) : la migration échoue explicitement et annule intégralement ses changements (aucun faux zéro, aucune donnée perdue)",
    async () => {
      const dbName = freshDatabaseName("orphan");
      await cloneDatabase(TEMPLATE_DB_NAME, dbName);
      const url = buildDatabaseUrl(dbName);

      const client = new PrismaClient({ datasources: { db: { url } } });
      try {
        const orgId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO organizations (id, name, slug, default_timezone, status, created_at, updated_at) VALUES ($1::uuid, 'Orphan Org', $2, 'Europe/Paris', 'TRIAL', now(), now())`,
          orgId,
          `orphan-org-${orgId}`,
        );
        const modelId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO ai_models (id, provider, model_key, display_name, status, capabilities_structured_output, capabilities_tool_calling, capabilities_vision, enabled_for_benchmark, enabled_for_production, created_at, updated_at) VALUES ($1::uuid, 'OPENAI', 'gpt-4o-mini', 'GPT-4o mini', 'ENABLED', false, false, false, true, true, now(), now())`,
          modelId,
        );
        // Second modèle distinct pour la ligne orpheline — `benchmark_run_models` a une contrainte
        // unique (run_id, ai_model_id) : une même paire ne peut porter deux lignes.
        const orphanModelId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO ai_models (id, provider, model_key, display_name, status, capabilities_structured_output, capabilities_tool_calling, capabilities_vision, enabled_for_benchmark, enabled_for_production, created_at, updated_at) VALUES ($1::uuid, 'OPENAI', 'gpt-4o', 'GPT-4o', 'ENABLED', false, false, false, true, true, now(), now())`,
          orphanModelId,
        );
        const goodSnap = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO ai_model_pricing_snapshots (id, ai_model_id, input_price_per_million_tokens, output_price_per_million_tokens, currency, effective_from, effective_to, created_at) VALUES ($1::uuid, $2::uuid, 5, 15, 'USD', '2026-07-01'::timestamp, NULL, now())`,
          goodSnap,
          modelId,
        );
        const suiteId = randomUUID();
        const runId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO benchmark_runs (id, organization_id, suite_id, suite_version, status, repetitions, concurrency_limit, estimated_cost_amount, estimated_cost_currency, launched_by_user_id, launched_at, started_at, completed_at, created_at, updated_at) VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 'SUCCEEDED', 1, 1, 1, 'USD', $4::uuid, '2026-07-15'::timestamp, '2026-07-15'::timestamp, '2026-07-15'::timestamp, now(), now())`,
          runId,
          orgId,
          suiteId,
          randomUUID(),
        );

        // Ligne migrable normale (référence valide).
        const migratableId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO benchmark_run_models (id, run_id, ai_model_id, pricing_snapshot_id, created_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, '2026-07-15'::timestamp)`,
          migratableId,
          runId,
          modelId,
          goodSnap,
        );

        // Ligne orpheline — IMPOSSIBLE à créer normalement (contrainte FK), donc désactivée
        // temporairement UNIQUEMENT pour prouver le comportement défensif du garde-fou si cette
        // invariante était un jour violée par un autre chemin (bug, intervention manuelle en base).
        const fkNames = (await client.$queryRawUnsafe(
          `SELECT conname FROM pg_constraint WHERE conrelid = 'benchmark_run_models'::regclass AND confrelid = 'ai_model_pricing_snapshots'::regclass`,
        )) as { conname: string }[];
        expect(fkNames.length).toBeGreaterThan(0);
        const fkName = fkNames[0]!.conname;
        await client.$executeRawUnsafe(`ALTER TABLE benchmark_run_models DROP CONSTRAINT "${fkName}"`);

        const orphanId = randomUUID();
        const danglingSnapshotId = randomUUID(); // ne référence RIEN dans ai_model_pricing_snapshots
        await client.$executeRawUnsafe(
          `INSERT INTO benchmark_run_models (id, run_id, ai_model_id, pricing_snapshot_id, created_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, '2026-07-15'::timestamp)`,
          orphanId,
          runId,
          orphanModelId,
          danglingSnapshotId,
        );

        const beforeRows = (await client.$queryRawUnsafe(
          `SELECT id, ai_model_id, pricing_snapshot_id FROM benchmark_run_models ORDER BY id`,
        )) as { id: string; ai_model_id: string; pricing_snapshot_id: string }[];
        expect(beforeRows).toHaveLength(2);

        // La migration DOIT échouer (RAISE EXCEPTION du garde-fou) — jamais un succès silencieux.
        let migrationError: unknown;
        try {
          await applySingleMigration(url, TARGET_MIGRATION);
        } catch (error) {
          migrationError = error;
        }
        expect(migrationError).toBeDefined();
        const message = migrationError instanceof Error ? migrationError.message : String(migrationError);
        expect(message).toContain("Migration aborted");

        // Preuve du rollback intégral — aucune colonne pricing ne doit exister avec des données,
        // aucun faux zéro, aucune ligne perdue, les deux lignes originales sont intactes.
        const columnsAfter = (await client.$queryRawUnsafe(
          `SELECT column_name FROM information_schema.columns WHERE table_name = 'benchmark_run_models' AND column_name = 'pricing_currency'`,
        )) as { column_name: string }[];
        // Soit la colonne n'existe pas du tout (rollback complet de l'ALTER TABLE), soit — selon la
        // façon dont Postgres traite les DDL dans une transaction annulée — elle n'existe pas non
        // plus après ROLLBACK : les deux cas prouvent l'absence de changement persistant.
        expect(columnsAfter).toHaveLength(0);

        const afterRows = (await client.$queryRawUnsafe(
          `SELECT id, ai_model_id, pricing_snapshot_id FROM benchmark_run_models ORDER BY id`,
        )) as { id: string; ai_model_id: string; pricing_snapshot_id: string }[];
        expect(afterRows).toEqual(beforeRows);
        expect(afterRows.map((r) => r.id).sort()).toEqual([migratableId, orphanId].sort());
      } finally {
        await client.$disconnect();
      }
    },
    120000,
  );

  it(
    "Scénario F — un nouveau snapshot ajouté APRÈS la migration ne modifie jamais le tarif déjà figé d'un ancien run",
    async () => {
      const dbName = freshDatabaseName("frozen");
      await cloneDatabase(TEMPLATE_DB_NAME, dbName);
      const url = buildDatabaseUrl(dbName);

      const client = new PrismaClient({ datasources: { db: { url } } });
      try {
        const orgId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO organizations (id, name, slug, default_timezone, status, created_at, updated_at) VALUES ($1::uuid, 'Frozen Org', $2, 'Europe/Paris', 'TRIAL', now(), now())`,
          orgId,
          `frozen-org-${orgId}`,
        );
        const modelId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO ai_models (id, provider, model_key, display_name, status, capabilities_structured_output, capabilities_tool_calling, capabilities_vision, enabled_for_benchmark, enabled_for_production, created_at, updated_at) VALUES ($1::uuid, 'OPENAI', 'gpt-4o-mini', 'GPT-4o mini', 'ENABLED', false, false, false, true, true, now(), now())`,
          modelId,
        );
        const originalSnap = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO ai_model_pricing_snapshots (id, ai_model_id, input_price_per_million_tokens, output_price_per_million_tokens, currency, effective_from, effective_to, created_at) VALUES ($1::uuid, $2::uuid, 5, 15, 'USD', '2026-07-01'::timestamp, NULL, now())`,
          originalSnap,
          modelId,
        );
        const suiteId = randomUUID();
        const runId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO benchmark_runs (id, organization_id, suite_id, suite_version, status, repetitions, concurrency_limit, estimated_cost_amount, estimated_cost_currency, launched_by_user_id, launched_at, started_at, completed_at, created_at, updated_at) VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 'SUCCEEDED', 1, 1, 1, 'USD', $4::uuid, '2026-07-15'::timestamp, '2026-07-15'::timestamp, '2026-07-15'::timestamp, now(), now())`,
          runId,
          orgId,
          suiteId,
          randomUUID(),
        );
        const rmId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO benchmark_run_models (id, run_id, ai_model_id, pricing_snapshot_id, created_at) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, '2026-07-15'::timestamp)`,
          rmId,
          runId,
          modelId,
          originalSnap,
        );

        await applySingleMigration(url, TARGET_MIGRATION);

        const before = (await client.$queryRawUnsafe(
          `SELECT pricing_currency, pricing_input_price_per_million_tokens::text as input, pricing_output_price_per_million_tokens::text as output FROM benchmark_run_models WHERE id = $1::uuid`,
          rmId,
        )) as { pricing_currency: string; input: string; output: string }[];
        expect(before[0]!.pricing_currency).toBe("USD");
        expect(Number(before[0]!.input)).toBe(5);
        expect(Number(before[0]!.output)).toBe(15);

        // Un nouveau tarif, très différent, est ajouté APRÈS la migration — simule une évolution
        // tarifaire réelle survenant après le déploiement de cette correction.
        const newSnap = randomUUID();
        await client.$executeRawUnsafe(
          `UPDATE ai_model_pricing_snapshots SET effective_to = now() WHERE id = $1::uuid`,
          originalSnap,
        );
        await client.$executeRawUnsafe(
          `INSERT INTO ai_model_pricing_snapshots (id, ai_model_id, input_price_per_million_tokens, output_price_per_million_tokens, currency, effective_from, effective_to, created_at) VALUES ($1::uuid, $2::uuid, 500, 1500, 'USD', now(), NULL, now())`,
          newSnap,
          modelId,
        );

        const after = (await client.$queryRawUnsafe(
          `SELECT pricing_currency, pricing_input_price_per_million_tokens::text as input, pricing_output_price_per_million_tokens::text as output FROM benchmark_run_models WHERE id = $1::uuid`,
          rmId,
        )) as { pricing_currency: string; input: string; output: string }[];
        expect(after[0]!.pricing_currency).toBe("USD");
        expect(Number(after[0]!.input)).toBe(5); // toujours 5, jamais 500
        expect(Number(after[0]!.output)).toBe(15); // toujours 15, jamais 1500
      } finally {
        await client.$disconnect();
      }
    },
    120000,
  );
});
