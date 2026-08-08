import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AssertClientAccessUseCase } from "../../../client-portfolio";
import { KnowledgeEntryNotArchivedError } from "../../domain/errors";
import { KnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import { KnowledgeSourceType } from "../../domain/knowledge-source-type";
import { ArchiveKnowledgeEntryUseCase } from "./archive-knowledge-entry.use-case";
import { DeleteKnowledgeEntryUseCase } from "./delete-knowledge-entry.use-case";
import { RestoreKnowledgeEntryUseCase } from "./restore-knowledge-entry.use-case";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryKnowledgeDocumentRepository,
  InMemoryKnowledgeEntryRepository,
  InMemoryKnowledgeTagRepository,
} from "../../test-support/fakes";

const ORG = randomUUID();
const SPACE = randomUUID();
const ACTOR = randomUUID();
const NOW = new Date("2026-07-30T10:00:00Z");
// Toutes les entrées seedées ici sont GLOBALES (clientAccountId absent) : `assertKnowledgeEntryClientAccess`
// retourne immédiatement sans jamais appeler cette dépendance (voir la policy).
const UNUSED_ASSERT_CLIENT_ACCESS_USE_CASE = {} as AssertClientAccessUseCase;

describe("Archive / Restore / Delete lifecycle", () => {
  let entryRepository: InMemoryKnowledgeEntryRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let archiveUseCase: ArchiveKnowledgeEntryUseCase;
  let restoreUseCase: RestoreKnowledgeEntryUseCase;
  let deleteUseCase: DeleteKnowledgeEntryUseCase;

  beforeEach(() => {
    auditLogWriter = new InMemoryAuditLogWriter();
    entryRepository = new InMemoryKnowledgeEntryRepository(undefined, undefined, auditLogWriter);
    const tagRepository = new InMemoryKnowledgeTagRepository();
    const documentRepository = new InMemoryKnowledgeDocumentRepository();
    archiveUseCase = new ArchiveKnowledgeEntryUseCase(entryRepository, tagRepository, documentRepository, new FixedClock(), UNUSED_ASSERT_CLIENT_ACCESS_USE_CASE);
    restoreUseCase = new RestoreKnowledgeEntryUseCase(entryRepository, tagRepository, documentRepository, new FixedClock(), UNUSED_ASSERT_CLIENT_ACCESS_USE_CASE);
    deleteUseCase = new DeleteKnowledgeEntryUseCase(entryRepository, UNUSED_ASSERT_CLIENT_ACCESS_USE_CASE);
  });

  async function seedEntry(): Promise<string> {
    const entry = KnowledgeEntry.create({
      id: randomUUID(),
      organizationId: ORG,
      knowledgeSpaceId: SPACE,
      title: "Entrée",
      category: KnowledgeCategory.Other,
      sourceType: KnowledgeSourceType.Manual,
      metadata: {},
      createdByUserId: ACTOR,
      occurredAt: NOW,
    });
    await entryRepository.create(entry);
    return entry.id;
  }

  it("archives an entry, excluding it from default searches (status ARCHIVED, archivedAt set)", async () => {
    const entryId = await seedEntry();
    const result = await archiveUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR" });
    expect(result.status).toBe("ARCHIVED");
    expect(result.archivedAt).toBeDefined();
  });

  it("restores an archived entry back to READY", async () => {
    const entryId = await seedEntry();
    await archiveUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR" });
    const result = await restoreUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR" });
    expect(result.status).toBe("READY");
    expect(result.archivedAt).toBeUndefined();
  });

  it("refuses to permanently delete an entry that was never archived first", async () => {
    const entryId = await seedEntry();
    await expect(deleteUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "OWNER" })).rejects.toBeInstanceOf(
      KnowledgeEntryNotArchivedError,
    );
    const stillThere = await entryRepository.findById({ organizationId: ORG, knowledgeEntryId: entryId });
    expect(stillThere).not.toBeNull();
  });

  it("permanently deletes an entry once archived", async () => {
    const entryId = await seedEntry();
    await archiveUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR" });
    await deleteUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "OWNER" });

    const gone = await entryRepository.findById({ organizationId: ORG, knowledgeEntryId: entryId });
    expect(gone).toBeNull();
  });

  it("READ_ONLY cannot archive, restore, or delete", async () => {
    const entryId = await seedEntry();
    await expect(archiveUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "READ_ONLY" })).rejects.toThrow();
    await expect(deleteUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "READ_ONLY" })).rejects.toThrow();
  });

  /** Correction audit Codex "Anomalie 2" — si l'écriture de suppression échoue tardivement
   *  (`entryRepository.delete()`), l'entrée doit rester intacte et aucune entrée de journal
   *  d'audit ne doit être créée. La véritable garantie transactionnelle (rollback Postgres,
   *  garde-fou anti-concurrence re-vérifiant ARCHIVED dans la transaction) est prouvée séparément
   *  par un test d'intégration réel (prisma-knowledge-base.repository.integration.spec.ts). */
  describe("DeleteKnowledgeEntryUseCase atomicity — a late failure leaves the entry fully intact", () => {
    it("propagates the failure, never records an audit log entry, and leaves the entry archived and findable", async () => {
      const entryId = await seedEntry();
      await archiveUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR" });
      entryRepository.failNextDelete = true;

      await expect(deleteUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "OWNER" })).rejects.toThrow(
        "Simulated KnowledgeEntry deletion failure",
      );

      const stillThere = await entryRepository.findById({ organizationId: ORG, knowledgeEntryId: entryId });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.status).toBe("ARCHIVED");
      expect(auditLogWriter.entries.some((entry) => entry.action === "knowledge_entry.deleted")).toBe(false);
    });

    it("recovers cleanly on the next attempt after a failed one (the failure flag is single-use)", async () => {
      const entryId = await seedEntry();
      await archiveUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR" });
      entryRepository.failNextDelete = true;
      await expect(deleteUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "OWNER" })).rejects.toThrow();

      await deleteUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "OWNER" });
      expect(await entryRepository.findById({ organizationId: ORG, knowledgeEntryId: entryId })).toBeNull();
    });
  });
});
