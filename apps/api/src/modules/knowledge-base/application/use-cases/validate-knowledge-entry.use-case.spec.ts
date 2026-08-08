import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import type { AssertClientAccessUseCase } from "../../../client-portfolio";
import { KnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import { KnowledgeEntryAlreadyValidatedError, KnowledgeEntryNotFoundError, KnowledgeEntryNotReadyForValidationError, KnowledgePermissionMissingError } from "../../domain/errors";
import { KnowledgeEntryVersion } from "../../domain/knowledge-entry-version.entity";
import { KnowledgeSourceType } from "../../domain/knowledge-source-type";
import { UpdateKnowledgeEntryUseCase } from "./update-knowledge-entry.use-case";
import { ValidateKnowledgeEntryUseCase } from "./validate-knowledge-entry.use-case";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryKnowledgeDocumentRepository,
  InMemoryKnowledgeEntryRepository,
  InMemoryKnowledgeEntryVersionRepository,
  InMemoryKnowledgeTagRepository,
} from "../../test-support/fakes";

const ORG = randomUUID();
const SPACE = randomUUID();
const ACTOR = randomUUID();
const NOW = new Date("2026-07-30T10:00:00Z");
// Toutes les entrées seedées ici sont GLOBALES (clientAccountId absent) : `assertKnowledgeEntryClientAccess`
// retourne immédiatement sans jamais appeler cette dépendance (voir la policy).
const UNUSED_ASSERT_CLIENT_ACCESS_USE_CASE = {} as AssertClientAccessUseCase;

describe("ValidateKnowledgeEntryUseCase", () => {
  let entryRepository: InMemoryKnowledgeEntryRepository;
  let versionRepository: InMemoryKnowledgeEntryVersionRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: ValidateKnowledgeEntryUseCase;
  let updateUseCase: UpdateKnowledgeEntryUseCase;

  beforeEach(() => {
    versionRepository = new InMemoryKnowledgeEntryVersionRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    const tagRepository = new InMemoryKnowledgeTagRepository();
    // Correctif audit Codex P1-02 — l'audit est désormais écrit PAR `entryRepository` lui-même
    // (chemin atomique `saveValidationWithVersion`/`updateWithNewVersion`) : `entryRepository` doit
    // partager la MÊME instance de `versionRepository` ET `auditLogWriter` que celles observées
    // par les tests ci-dessous, jamais des instances par défaut déconnectées.
    entryRepository = new InMemoryKnowledgeEntryRepository(versionRepository, tagRepository, auditLogWriter);
    const documentRepository = new InMemoryKnowledgeDocumentRepository();
    useCase = new ValidateKnowledgeEntryUseCase(entryRepository, versionRepository, tagRepository, documentRepository, new FixedClock(), UNUSED_ASSERT_CLIENT_ACCESS_USE_CASE);
    updateUseCase = new UpdateKnowledgeEntryUseCase(
      entryRepository,
      tagRepository,
      documentRepository,
      new FixedClock(),
      new UuidGenerator(),
      UNUSED_ASSERT_CLIENT_ACCESS_USE_CASE,
    );
  });

  async function seedEntry(): Promise<string> {
    const id = randomUUID();
    const entry = KnowledgeEntry.create({
      id,
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
    await versionRepository.create(
      KnowledgeEntryVersion.create({
        id: randomUUID(),
        organizationId: ORG,
        knowledgeEntryId: id,
        versionNumber: 1,
        snapshot: { title: entry.title, category: entry.category, metadata: entry.metadata },
        createdByUserId: ACTOR,
        occurredAt: NOW,
      }),
    );
    return id;
  }

  it("stamps the entry AND the active version with the validator and timestamp", async () => {
    const entryId = await seedEntry();
    const validator = randomUUID();

    const result = await useCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: validator, actorRole: "OWNER" });

    expect(result.validatedByUserId).toBe(validator);
    expect(result.validatedAt).toBeDefined();

    const version1 = await versionRepository.findByVersionNumber({ organizationId: ORG, knowledgeEntryId: entryId, versionNumber: 1 });
    expect(version1!.validatedByUserId).toBe(validator);
    expect(version1!.validatedAt).toBeDefined();
  });

  it("records an audit log entry for the validation", async () => {
    const entryId = await seedEntry();
    await useCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "OWNER" });
    expect(auditLogWriter.entries.some((entry) => entry.action === "knowledge_entry.validated")).toBe(true);
  });

  it("refuses to re-validate an already-validated active version (never a silent re-stamp)", async () => {
    const entryId = await seedEntry();
    await useCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "OWNER" });

    await expect(useCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "OWNER" })).rejects.toBeInstanceOf(
      KnowledgeEntryAlreadyValidatedError,
    );
  });

  it("a subsequent substantial mutation resets denormalized validation on the entry, but the OLD version keeps its own historical stamp forever", async () => {
    const entryId = await seedEntry();
    const validator = randomUUID();
    await useCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: validator, actorRole: "OWNER" });

    await updateUseCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "Titre modifié" });

    const entry = await entryRepository.findById({ organizationId: ORG, knowledgeEntryId: entryId });
    expect(entry!.activeVersionNumber).toBe(2);
    expect(entry!.validatedAt).toBeUndefined();

    const version1 = await versionRepository.findByVersionNumber({ organizationId: ORG, knowledgeEntryId: entryId, versionNumber: 1 });
    expect(version1!.validatedByUserId).toBe(validator);
    expect(version1!.validatedAt).toBeDefined();

    const version2 = await versionRepository.findByVersionNumber({ organizationId: ORG, knowledgeEntryId: entryId, versionNumber: 2 });
    expect(version2!.validatedAt).toBeUndefined();
  });

  it("refuses to validate a DRAFT entry (nothing stable to validate yet)", async () => {
    const id = randomUUID();
    const entry = KnowledgeEntry.create({
      id,
      organizationId: ORG,
      knowledgeSpaceId: SPACE,
      title: "Import en cours",
      category: KnowledgeCategory.Other,
      sourceType: KnowledgeSourceType.DocumentImport,
      metadata: {},
      createdByUserId: ACTOR,
      occurredAt: NOW,
    });
    await entryRepository.create(entry);
    await versionRepository.create(
      KnowledgeEntryVersion.create({ id: randomUUID(), organizationId: ORG, knowledgeEntryId: id, versionNumber: 1, snapshot: { title: entry.title, category: entry.category, metadata: {} }, createdByUserId: ACTOR, occurredAt: NOW }),
    );

    await expect(useCase.execute({ organizationId: ORG, knowledgeEntryId: id, actorId: ACTOR, actorRole: "OWNER" })).rejects.toBeInstanceOf(
      KnowledgeEntryNotReadyForValidationError,
    );
  });

  it("a CONTRIBUTOR cannot validate (Admin-tier only permission)", async () => {
    const entryId = await seedEntry();
    await expect(useCase.execute({ organizationId: ORG, knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "CONTRIBUTOR" })).rejects.toBeInstanceOf(
      KnowledgePermissionMissingError,
    );
  });

  it("throws KnowledgeEntryNotFoundError for a non-existent entry", async () => {
    await expect(useCase.execute({ organizationId: ORG, knowledgeEntryId: randomUUID(), actorId: ACTOR, actorRole: "OWNER" })).rejects.toBeInstanceOf(
      KnowledgeEntryNotFoundError,
    );
  });

  it("never validates an entry belonging to another organization", async () => {
    const entryId = await seedEntry();
    await expect(useCase.execute({ organizationId: randomUUID(), knowledgeEntryId: entryId, actorId: ACTOR, actorRole: "OWNER" })).rejects.toBeInstanceOf(
      KnowledgeEntryNotFoundError,
    );
  });
});
