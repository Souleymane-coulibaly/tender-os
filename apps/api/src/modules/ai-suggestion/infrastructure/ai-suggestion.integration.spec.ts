import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { OutboxEventInput, OutboxWriter } from "../../outbox";
import { AiSuggestionEntityType } from "../domain/ai-suggestion-entity-type";
import { AiSuggestionFieldSchemaRegistry } from "../application/services/ai-suggestion-field-schema-registry";
import { CreateAiSuggestionUseCase } from "../application/use-cases/create-ai-suggestion.use-case";
import type { AiSuggestionAuditLogEntry, AuditLogWriter } from "../application/ports/audit-log-writer";
import { PrismaAiSuggestionRepository } from "./prisma-ai-suggestion.repository";

class SystemClock {
  now(): Date {
    return new Date();
  }
}

class FakeAuditLogWriter implements AuditLogWriter {
  async record(_entry: AiSuggestionAuditLogEntry): Promise<void> {
    return Promise.resolve();
  }
}

class FakeOutboxWriter implements OutboxWriter {
  async write(_input: { organizationId: string; events: OutboxEventInput[] }): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Preuve PostgreSQL réelle — un fake en mémoire ne peut pas démontrer les CHECK constraints
 * hand-appended (status/entity_type/confidence/conflict_resolution) ni les FK composées
 * (parent_tender_id/parent_lot_id) ni l'isolation inter-tenant au niveau requête SQL.
 */
describe("AiSuggestion repository (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaAiSuggestionRepository(prisma);
  const schemaRegistry = new AiSuggestionFieldSchemaRegistry();
  schemaRegistry.register(AiSuggestionEntityType.ChecklistItem, "label", z.string().min(1).max(300));
  schemaRegistry.register(AiSuggestionEntityType.TenderLot, "title", z.string());
  schemaRegistry.register(AiSuggestionEntityType.PricingLine, "amount", z.string());
  const createUseCase = new CreateAiSuggestionUseCase(repository, schemaRegistry, new SystemClock(), new FakeAuditLogWriter(), new FakeOutboxWriter());

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  let clientAccountId: string;
  let tenderId: string;
  /** V2 Sprint 4 (audit Codex P1-003) — un second Tender de la MÊME organisation, pour distinguer
   *  "même tenant" (déjà couvert par la FK organization_id) de "même Tender" (le vrai gap). */
  let otherTenderId: string;
  let lotOfTenderId: string;
  let lotOfOtherTenderId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "AiSuggestion Repo Test Org", slug: `ai-suggestion-repo-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: otherOrganizationId, name: "AiSuggestion Repo Test Org (other)", slug: `ai-suggestion-repo-test-org-other-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId, name: "Client AiSuggestion Repo Test", nameNormalized: "client ai suggestion repo test", status: "ACTIVE", createdBy: userId },
    });
    clientAccountId = clientAccount.id;
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId, clientAccountId, title: "Tender AiSuggestion Repo Test", status: "DRAFT", tags: [], createdBy: userId },
    });
    tenderId = tender.id;
    const otherTender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId, clientAccountId, title: "Tender AiSuggestion Repo Test (other Tender, same org)", status: "DRAFT", tags: [], createdBy: userId },
    });
    otherTenderId = otherTender.id;
    const lotOfTender = await prisma.tenderLot.create({
      data: { id: randomUUID(), organizationId, tenderId, lotNumber: "1", title: "Lot du Tender principal" },
    });
    lotOfTenderId = lotOfTender.id;
    const lotOfOtherTender = await prisma.tenderLot.create({
      data: { id: randomUUID(), organizationId, tenderId: otherTenderId, lotNumber: "1", title: "Lot de l'autre Tender" },
    });
    lotOfOtherTenderId = lotOfOtherTender.id;
  });

  afterAll(async () => {
    await prisma.aiSuggestion.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.aiSuggestion.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
  });

  it("creates a suggestion validated by the centrally-registered Zod schema and reads it back", async () => {
    const entityId = randomUUID();
    const created = await createUseCase.execute({
      organizationId,
      entityType: AiSuggestionEntityType.ChecklistItem,
      entityId,
      fieldName: "label",
      parentTenderId: tenderId,
      proposedValue: "Attestation d'assurance décennale",
      confidence: 0.72,
      createdByProcess: "test.integration",
    });

    const stored = await repository.findById({ id: created.id, organizationId });
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe("PENDING");
    expect(stored?.proposedValue).toBe("Attestation d'assurance décennale");
    expect(stored?.parentTenderId).toBe(tenderId);
  });

  it("mission Sprint 1 §4 — a suggestion is invisible to another organization (anti-IDOR)", async () => {
    const created = await createUseCase.execute({
      organizationId,
      entityType: AiSuggestionEntityType.TenderLot,
      entityId: randomUUID(),
      fieldName: "title",
      parentTenderId: tenderId,
      proposedValue: "Lot 1",
      confidence: 0.5,
      createdByProcess: "test.integration",
    });

    expect(await repository.findById({ id: created.id, organizationId: otherOrganizationId })).toBeNull();
    expect(await repository.list({ organizationId: otherOrganizationId })).toHaveLength(0);
  });

  it("V2 Sprint 4 — rejects a parentTenderId belonging to another organization at the database level (composite FK)", async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO ai_suggestions (id, organization_id, entity_type, entity_id, field_name, parent_tender_id, proposed_value, confidence, status, created_by_process, updated_at)
        VALUES (${randomUUID()}::uuid, ${otherOrganizationId}::uuid, 'TENDER_LOT', ${randomUUID()}::uuid, 'x', ${tenderId}::uuid, '"x"'::jsonb, 0.5, 'PENDING', 'test', now())`,
    ).rejects.toThrow();
  });

  it("V2 Sprint 4 (audit Codex P1-003) — rejects a parentLotId belonging to a DIFFERENT Tender of the same organization (composite FK)", async () => {
    // Même organisation que tenderId (donc la FK organization_id seule ne détecterait rien) —
    // seul un lot appartenant réellement à tenderId doit être acceptable.
    await expect(
      prisma.$executeRaw`INSERT INTO ai_suggestions (id, organization_id, entity_type, entity_id, field_name, parent_tender_id, parent_lot_id, proposed_value, confidence, status, created_by_process, updated_at)
        VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, 'TENDER_LOT_FIELD', ${randomUUID()}::uuid, 'x', ${tenderId}::uuid, ${lotOfOtherTenderId}::uuid, '"x"'::jsonb, 0.5, 'PENDING', 'test', now())`,
    ).rejects.toThrow();
  });

  it("V2 Sprint 4 (audit Codex P1-003) — accepts a parentLotId that genuinely belongs to parentTenderId", async () => {
    await prisma.$executeRaw`INSERT INTO ai_suggestions (id, organization_id, entity_type, entity_id, field_name, parent_tender_id, parent_lot_id, proposed_value, confidence, status, created_by_process, updated_at)
        VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, 'TENDER_LOT_FIELD', ${randomUUID()}::uuid, 'x', ${tenderId}::uuid, ${lotOfTenderId}::uuid, '"x"'::jsonb, 0.5, 'PENDING', 'test', now())`;
  });

  it("V2 Sprint 4 (audit Codex P1-002, round 3) — the migration ALWAYS succeeds on a pre-existing row with no resolvable parent_tender_id: it is archived, never blocks deployment", async () => {
    type MigrationGuardSnapshot = {
      archivedRow: { id: string; reason: string; rowSnapshot: unknown } | null;
      remainingLegacyRowCount: number;
      columnNullable: string | undefined;
    };
    // Sentinelle porteuse de l'état observé DANS la transaction (via `tx`, jamais après COMMIT) —
    // permet d'annuler la transaction de test APRÈS vérification sans jamais modifier durablement
    // la base de test réelle, et sans dépendre de la mutation d'une variable externe par une
    // closure asynchrone.
    class IntentionalRollback extends Error {
      constructor(readonly snapshot: MigrationGuardSnapshot) {
        super("intentional rollback for test isolation");
      }
    }

    const legacyId = randomUUID();
    let snapshot: MigrationGuardSnapshot | undefined;

    try {
      await prisma.$transaction(async (tx) => {
        // Reproduit l'état d'une base pré-Sprint-4 : une ancienne ligne Sprint 1 sans aucune
        // relation Tender exploitable (exactement le cas que la migration ne peut pas backfiller).
        await tx.$executeRawUnsafe(`ALTER TABLE ai_suggestions ALTER COLUMN parent_tender_id DROP NOT NULL`);
        await tx.$executeRawUnsafe(
          `INSERT INTO ai_suggestions (id, organization_id, entity_type, entity_id, field_name, parent_tender_id, proposed_value, confidence, status, created_by_process, updated_at)
           VALUES ('${legacyId}', '${organizationId}', 'TENDER_LOT', '${randomUUID()}', 'x', NULL, '"legacy Sprint 1 row"'::jsonb, 0.5, 'PENDING', 'test', now())`,
        );

        // Séquence EXACTE de migration.sql (§2, round 3) — copiée telle quelle, jamais réinventée
        // ici : archive puis supprime toute ligne orpheline, PUIS seulement applique NOT NULL.
        await tx.$executeRawUnsafe(`
          INSERT INTO "ai_suggestions_orphaned_archive" ("id", "reason", "row_snapshot")
          SELECT "id",
                 'V2 Sprint 4 migration (20260909090000) : aucun parent_tender_id résolvable pour cette ligne préexistante — aucun backfill déterministe possible depuis entity_type/entity_id (catalogue Sprint 1, jamais de producteur câblé avant ce sprint).',
                 to_jsonb("ai_suggestions".*)
          FROM "ai_suggestions"
          WHERE "parent_tender_id" IS NULL;
        `);
        await tx.$executeRawUnsafe(`DELETE FROM "ai_suggestions" WHERE "parent_tender_id" IS NULL;`);
        // Ne bloque plus jamais le déploiement (round 3) : contrairement au garde-fou RAISE
        // EXCEPTION du round 1/2, cette instruction réussit TOUJOURS puisque plus aucune ligne
        // NULL ne subsiste après l'archivage ci-dessus.
        await tx.$executeRawUnsafe(`ALTER TABLE "ai_suggestions" ALTER COLUMN "parent_tender_id" SET NOT NULL;`);

        const archived = await tx.aiSuggestionOrphanedArchive.findUnique({ where: { id: legacyId } });
        const remainingLegacyRowCount = await tx.aiSuggestion.count({ where: { id: legacyId } });
        const column = await tx.$queryRaw<{ is_nullable: string }[]>`
          SELECT is_nullable FROM information_schema.columns WHERE table_name = 'ai_suggestions' AND column_name = 'parent_tender_id'
        `;

        throw new IntentionalRollback({
          archivedRow: archived ? { id: archived.id, reason: archived.reason, rowSnapshot: archived.rowSnapshot } : null,
          remainingLegacyRowCount,
          columnNullable: column[0]?.is_nullable,
        });
      });
      throw new Error("expected the transaction to roll back via IntentionalRollback");
    } catch (error) {
      if (!(error instanceof IntentionalRollback)) throw error;
      snapshot = error.snapshot;
    }

    // La migration a réussi de bout en bout (aucune exception avant la sentinelle) : la ligne
    // orpheline a été archivée avec sa trace complète, retirée de la table active, et NOT NULL a
    // pu être réappliquée sans intervention manuelle — jamais un déploiement bloqué.
    expect(snapshot?.archivedRow).toMatchObject({ id: legacyId, reason: expect.stringContaining("aucun backfill déterministe possible") });
    expect(snapshot?.archivedRow?.rowSnapshot).toMatchObject({ id: legacyId, proposed_value: "legacy Sprint 1 row" });
    expect(snapshot?.remainingLegacyRowCount).toBe(0);
    expect(snapshot?.columnNullable).toBe("NO");
  });

  it("rejects an out-of-catalogue entity_type at the database level (CHECK constraint)", async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO ai_suggestions (id, organization_id, entity_type, entity_id, field_name, parent_tender_id, proposed_value, confidence, status, created_by_process, updated_at)
        VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, 'NOT_A_REAL_TYPE', ${randomUUID()}::uuid, 'x', ${tenderId}::uuid, '"x"'::jsonb, 0.5, 'PENDING', 'test', now())`,
    ).rejects.toThrow();
  });

  it("V2 Sprint 4 — accepts an entity_type added by the extended catalogue (TENDER_AWARD_CRITERION)", async () => {
    await prisma.$executeRaw`INSERT INTO ai_suggestions (id, organization_id, entity_type, entity_id, field_name, parent_tender_id, proposed_value, confidence, status, created_by_process, updated_at)
        VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, 'TENDER_AWARD_CRITERION', ${randomUUID()}::uuid, 'x', ${tenderId}::uuid, '"x"'::jsonb, 0.5, 'PENDING', 'test', now())`;
  });

  it("V2 Sprint 4 (audit Codex P1-001) — accepts the APPLYING intermediate status at the database level", async () => {
    await prisma.$executeRaw`INSERT INTO ai_suggestions (id, organization_id, entity_type, entity_id, field_name, parent_tender_id, proposed_value, confidence, status, created_by_process, updated_at)
        VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, 'TENDER_LOT', ${randomUUID()}::uuid, 'x', ${tenderId}::uuid, '"x"'::jsonb, 0.5, 'APPLYING', 'test', now())`;
  });

  it("rejects a confidence outside [0, 1] at the database level (CHECK constraint)", async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO ai_suggestions (id, organization_id, entity_type, entity_id, field_name, parent_tender_id, proposed_value, confidence, status, created_by_process, updated_at)
        VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, 'TENDER_LOT', ${randomUUID()}::uuid, 'x', ${tenderId}::uuid, '"x"'::jsonb, 1.4, 'PENDING', 'test', now())`,
    ).rejects.toThrow();
  });

  it("rejects an invalid conflict_resolution at the database level (CHECK constraint)", async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO ai_suggestions (id, organization_id, entity_type, entity_id, field_name, parent_tender_id, proposed_value, confidence, status, created_by_process, conflict_resolution, updated_at)
        VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, 'TENDER_LOT', ${randomUUID()}::uuid, 'x', ${tenderId}::uuid, '"x"'::jsonb, 0.5, 'PENDING', 'test', 'NOT_A_REAL_RESOLUTION', now())`,
    ).rejects.toThrow();
  });

  it("transitionFromPending is atomic: a second concurrent transition on the same row is a no-op (returns null)", async () => {
    const created = await createUseCase.execute({
      organizationId,
      entityType: AiSuggestionEntityType.PricingLine,
      entityId: randomUUID(),
      fieldName: "amount",
      parentTenderId: tenderId,
      proposedValue: "1000",
      confidence: 0.6,
      createdByProcess: "test.integration",
    });

    const now = new Date();
    const [first, second] = await Promise.all([
      repository.transitionFromPending({ id: created.id, organizationId, newStatus: "ACCEPTED", validatedByUserId: randomUUID(), validatedAt: now, appliedValue: "1000", updatedAt: now }),
      repository.transitionFromPending({ id: created.id, organizationId, newStatus: "REJECTED", rejectedAt: now, updatedAt: now }),
    ]);

    const outcomes = [first, second];
    const successes = outcomes.filter((outcome) => outcome !== null);
    const noops = outcomes.filter((outcome) => outcome === null);
    expect(successes).toHaveLength(1);
    expect(noops).toHaveLength(1);
  });

  it("V2 Sprint 4 (audit Codex P1-001, round 3) — transitionFromPending commits its onSuccessTx side effect in the SAME transaction as the status change", async () => {
    const created = await createUseCase.execute({
      organizationId,
      entityType: AiSuggestionEntityType.PricingLine,
      entityId: randomUUID(),
      fieldName: "amount",
      parentTenderId: tenderId,
      proposedValue: "1000",
      confidence: 0.6,
      createdByProcess: "test.integration",
    });

    const now = new Date();
    let sideEffectRan = false;
    const updated = await repository.transitionFromPending({ id: created.id, organizationId, newStatus: "ACCEPTED", validatedByUserId: randomUUID(), validatedAt: now, appliedValue: "1000", updatedAt: now }, async () => {
      sideEffectRan = true;
    });

    expect(updated?.status).toBe("ACCEPTED");
    expect(sideEffectRan).toBe(true);
  });

  it("V2 Sprint 4 (audit Codex P1-001, round 3) — a failing onSuccessTx rolls back the status transition too: never a status changed without its side effect", async () => {
    const created = await createUseCase.execute({
      organizationId,
      entityType: AiSuggestionEntityType.PricingLine,
      entityId: randomUUID(),
      fieldName: "amount",
      parentTenderId: tenderId,
      proposedValue: "2000",
      confidence: 0.6,
      createdByProcess: "test.integration",
    });

    const now = new Date();
    await expect(
      repository.transitionFromPending({ id: created.id, organizationId, newStatus: "ACCEPTED", validatedByUserId: randomUUID(), validatedAt: now, appliedValue: "2000", updatedAt: now }, async () => {
        throw new Error("audit write failed");
      }),
    ).rejects.toThrow("audit write failed");

    // La transition de statut a été annulée avec l'effet de bord — la suggestion reste PENDING,
    // jamais bloquée dans un état "ACCEPTED sans audit".
    const stillPending = await repository.findById({ id: created.id, organizationId });
    expect(stillPending?.status).toBe("PENDING");
  });
});
