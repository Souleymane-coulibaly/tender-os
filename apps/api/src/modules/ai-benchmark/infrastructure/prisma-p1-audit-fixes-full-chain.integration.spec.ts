import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  applyMigrationsFrom,
  applyMigrationsThrough,
  buildDatabaseUrl,
  createThrowawayDatabase,
  dropThrowawayDatabase,
  TARGET_MIGRATION,
} from "../test-support/migration-test-harness";

const CLIENT_PORTFOLIO_MIGRATION = "20260730194351_add_client_portfolio";

/**
 * Preuve PostgreSQL réelle (réaudit Codex, §11) — chaîne complète des migrations
 * (Sprint 5 → Sprint 5.1 → correction du backfill de rôle → Sprint 5.2 → `p1_audit_fixes`) rejouée
 * depuis zéro sur une base PostgreSQL locale jetable, avec des données représentatives des Sprints
 * 4/5/5.1 déjà en place AVANT la migration Sprint 5.1 elle-même (pour que son propre backfill
 * s'exécute réellement), puis démarrage de la VRAIE application NestJS contre cette base
 * fraîchement migrée — jamais uniquement `prisma migrate status`.
 */
describe("Chaîne complète des migrations + démarrage API — preuve PostgreSQL réelle (réaudit Codex §11)", () => {
  const dbName = `tenderos_migproof_chain_${Date.now()}`;
  let app: INestApplication | undefined;

  afterAll(async () => {
    await app?.close();
    await dropThrowawayDatabase(dbName);
  }, 60000);

  it(
    "rejoue Sprint 5 → 5.1 (avec backfill de rôle réel) → 5.2 → p1_audit_fixes depuis zéro, préserve les données, puis démarre l'API réelle",
    async () => {
      await createThrowawayDatabase(dbName);
      const url = buildDatabaseUrl(dbName);

      // Migrations jusqu'à Sprint 5 inclus (juste avant Sprint 5.1 / add_client_portfolio), pour
      // insérer des données Sprint 4/5 réalistes AVANT que le backfill de rôle Sprint 5.1 ne
      // s'exécute — sinon son propre test n'aurait aucune ligne à backfiller.
      applyMigrationsThrough(url, CLIENT_PORTFOLIO_MIGRATION, false);

      const client = new PrismaClient({ datasources: { db: { url } } });
      let orgId: string;
      let userId: string;
      let tenderId: string;
      try {
        orgId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO organizations (id, name, slug, default_timezone, status, created_at, updated_at) VALUES ($1::uuid, 'Chain Proof Org', $2, 'Europe/Paris', 'TRIAL', now(), now())`,
          orgId,
          `chain-proof-org-${orgId}`,
        );

        userId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO users (id, email, display_name, status, password_hash, created_at, updated_at) VALUES ($1::uuid, $2, 'Chain Proof User', 'ACTIVE', 'irrelevant-hash', now(), now())`,
          userId,
          `chain-proof-${userId}@example.test`,
        );

        const membershipId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO organization_memberships (id, organization_id, user_id, status, joined_at, created_at, updated_at) VALUES ($1::uuid, $2::uuid, $3::uuid, 'ACTIVE', now(), now(), now())`,
          membershipId,
          orgId,
          userId,
        );

        // Rôle OWNER via la table de jonction membership_roles/roles — jamais une colonne "role"
        // directe sur organization_memberships (qui n'a jamais existé, voir la correction du
        // backfill Sprint 5.1 analysée dans ce même audit).
        const roleId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO roles (id, organization_id, code, name, scope, is_system, created_at, updated_at) VALUES ($1::uuid, NULL, 'OWNER', 'Owner', 'ORGANIZATION', true, now(), now())`,
          roleId,
        );
        await client.$executeRawUnsafe(
          `INSERT INTO membership_roles (membership_id, role_id, assigned_at) VALUES ($1::uuid, $2::uuid, now())`,
          membershipId,
          roleId,
        );

        // Un Tender Sprint 4/5 déjà existant (avant que Sprint 5.1 n'exige client_account_id).
        tenderId = randomUUID();
        await client.$executeRawUnsafe(
          `INSERT INTO tenders (id, organization_id, title, status, tags, created_by, created_at, updated_at) VALUES ($1::uuid, $2::uuid, 'Chain Proof Tender', 'DRAFT', '{}', $3::uuid, now(), now())`,
          tenderId,
          orgId,
          userId,
        );
      } finally {
        await client.$disconnect();
      }

      // Applique Sprint 5.1 (add_client_portfolio inclus, avec le backfill de rôle corrigé) puis
      // Sprint 5.2 + p1_audit_fixes — UNIQUEMENT les migrations restantes, jamais un rejeu depuis
      // le début (déjà appliqué ci-dessus) et jamais une migration sautée.
      applyMigrationsFrom(url, CLIENT_PORTFOLIO_MIGRATION, TARGET_MIGRATION);

      const verifyClient = new PrismaClient({ datasources: { db: { url } } });
      try {
        // Le Tender préexistant a bien reçu un client_account_id (backfill Sprint 5.1), jamais
        // supprimé ni recréé (même ID).
        const tenderRows = (await verifyClient.$queryRawUnsafe(
          `SELECT id, client_account_id FROM tenders WHERE id = $1::uuid`,
          tenderId!,
        )) as { id: string; client_account_id: string | null }[];
        expect(tenderRows).toHaveLength(1);
        expect(tenderRows[0]!.id).toBe(tenderId!);
        expect(tenderRows[0]!.client_account_id).not.toBeNull();

        // Un ClientAccount "Compte principal" a été créé pour l'organisation.
        const clientAccounts = (await verifyClient.$queryRawUnsafe(
          `SELECT id, name_normalized FROM client_accounts WHERE organization_id = $1::uuid`,
          orgId!,
        )) as { id: string; name_normalized: string }[];
        expect(clientAccounts.length).toBeGreaterThanOrEqual(1);
        expect(clientAccounts.some((c) => c.name_normalized === "compte principal")).toBe(true);

        // Le rôle OWNER de la Membership a été correctement traduit en CLIENT_MANAGER (jamais un
        // rôle par défaut arbitraire, jamais une élévation de droits) sur l'affectation backfillée.
        const assignments = (await verifyClient.$queryRawUnsafe(
          `SELECT role FROM client_assignments WHERE organization_id = $1::uuid AND user_id = $2::uuid`,
          orgId!,
          userId!,
        )) as { role: string }[];
        expect(assignments).toHaveLength(1);
        expect(assignments[0]!.role).toBe("CLIENT_MANAGER");

        // Les colonnes de tarif figé Sprint 5.2 sont bien présentes et NOT NULL après la chaîne
        // complète (aucune régression du correctif p1_audit_fixes dans une chaîne réaliste).
        const pricingCols = (await verifyClient.$queryRawUnsafe(
          `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'benchmark_run_models' AND column_name = 'pricing_currency'`,
        )) as { column_name: string; is_nullable: string }[];
        expect(pricingCols[0]!.is_nullable).toBe("NO");
      } finally {
        await verifyClient.$disconnect();
      }

      // Démarrage de la VRAIE application NestJS contre cette base fraîchement migrée — jamais
      // uniquement `prisma migrate status`. `DATABASE_URL` est redirigé UNIQUEMENT pour ce module
      // de test (jamais la base de développement partagée, jamais Railway).
      const previousDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = url;
      try {
        const moduleRef = await Test.createTestingModule({
          imports: [(await import("../../../app.module")).AppModule],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
        expect(app).toBeDefined();
      } finally {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    },
    300000,
  );
});
