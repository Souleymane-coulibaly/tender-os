import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { KnowledgePermissionMissingError } from "../../domain/errors";
import { GetOrCreateDefaultKnowledgeSpaceUseCase } from "./get-or-create-default-knowledge-space.use-case";
import { CreateKnowledgeEntryUseCase } from "./create-knowledge-entry.use-case";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryKnowledgeEntryRepository,
  InMemoryKnowledgeEntryVersionRepository,
  InMemoryKnowledgeSpaceRepository,
  InMemoryKnowledgeTagRepository,
} from "../../test-support/fakes";

const ORG = randomUUID();
const ACTOR = randomUUID();

describe("CreateKnowledgeEntryUseCase", () => {
  let versionRepository: InMemoryKnowledgeEntryVersionRepository;
  let tagRepository: InMemoryKnowledgeTagRepository;
  let entryRepository: InMemoryKnowledgeEntryRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: CreateKnowledgeEntryUseCase;

  beforeEach(() => {
    versionRepository = new InMemoryKnowledgeEntryVersionRepository();
    tagRepository = new InMemoryKnowledgeTagRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    entryRepository = new InMemoryKnowledgeEntryRepository(versionRepository, tagRepository, auditLogWriter);
    const spaceUseCase = new GetOrCreateDefaultKnowledgeSpaceUseCase(new InMemoryKnowledgeSpaceRepository(), new FixedClock(), new UuidGenerator());
    useCase = new CreateKnowledgeEntryUseCase(entryRepository, new FixedClock(), new UuidGenerator(), spaceUseCase);
  });

  it("creates a MANUAL entry immediately READY, with version 1 recorded", async () => {
    const result = await useCase.execute({
      organizationId: ORG,
      actorId: ACTOR,
      actorRole: "CONTRIBUTOR",
      title: "Référence Acme",
      category: "CLIENT_REFERENCE",
      metadata: { clientName: "Acme" },
    });

    expect(result.status).toBe("READY");
    expect(result.sourceType).toBe("MANUAL");
    expect(result.activeVersionNumber).toBe(1);

    const versions = await versionRepository.listByEntryId({ organizationId: ORG, knowledgeEntryId: result.id });
    expect(versions).toHaveLength(1);
    expect(versions[0]!.versionNumber).toBe(1);
  });

  it("resolves/creates tags and attaches them, normalizing case", async () => {
    const result = await useCase.execute({
      organizationId: ORG,
      actorId: ACTOR,
      actorRole: "CONTRIBUTOR",
      title: "Référence Acme",
      category: "CLIENT_REFERENCE",
      tags: ["Cloud", "ISO-27001"],
    });

    expect(result.tags.map((tag) => tag.label).sort()).toEqual(["cloud", "iso-27001"]);
  });

  it("rejects an unknown category", async () => {
    await expect(
      useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "x", category: "NOT_A_REAL_CATEGORY" }),
    ).rejects.toThrow();
  });

  it("rejects a READ_ONLY actor", async () => {
    await expect(
      useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "READ_ONLY", title: "x", category: "OTHER" }),
    ).rejects.toBeInstanceOf(KnowledgePermissionMissingError);
  });

  it("records an audit log entry", async () => {
    await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "x", category: "OTHER" });
    expect(auditLogWriter.entries.map((entry) => entry.action)).toContain("knowledge_entry.created");
  });

  it("never creates a second default knowledge space for the same organization across two entries", async () => {
    await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "Entrée 1", category: "OTHER" });
    const second = await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "Entrée 2", category: "OTHER" });
    const first = (await entryRepository.list({ organizationId: ORG, includeArchived: true, limit: 10 })).items[1]!;
    expect(first.knowledgeSpaceId).toBe(second.knowledgeSpaceId);
  });

  /** Correction audit Codex "Anomalie 2" — l'entrée, sa version 1 et ses tags sont écrits en UN
   *  seul appel atomique (`createWithVersionAndTags`, voir prisma-knowledge-entry.repository.ts) :
   *  si cet appel échoue tardivement, aucune entrée, aucune version, aucun lien de tag, aucune
   *  entrée de journal d'audit ne doit être créé — jamais un état résiduel partiel. La véritable
   *  garantie transactionnelle (rollback Postgres) est prouvée séparément par un test d'intégration
   *  réel (prisma-knowledge-base.repository.integration.spec.ts) ; ce test-ci prouve que le use
   *  case lui-même ne fait la moindre écriture supplémentaire ni n'avale l'erreur. */
  describe("atomicity — a late failure inside the atomic write leaves nothing behind", () => {
    it("propagates the failure and never records an audit log entry", async () => {
      entryRepository.failNextCreateWithVersionAndTags = true;

      await expect(
        useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "Entrée vouée à échouer", category: "OTHER", tags: ["cloud"] }),
      ).rejects.toThrow("Simulated KnowledgeEntry persistence failure");

      expect(auditLogWriter.entries).toHaveLength(0);
    });

    it("leaves no residual entry, version, or tag after the injected failure", async () => {
      entryRepository.failNextCreateWithVersionAndTags = true;

      await expect(
        useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "Entrée vouée à échouer", category: "OTHER", tags: ["cloud-orphelin"] }),
      ).rejects.toThrow();

      const page = await entryRepository.list({ organizationId: ORG, includeArchived: true, limit: 10 });
      expect(page.items).toHaveLength(0);
      expect(await tagRepository.findByLabel({ organizationId: ORG, label: "cloud-orphelin" })).toBeNull();
    });

    it("recovers cleanly on the next attempt after a failed one (the failure flag is single-use)", async () => {
      entryRepository.failNextCreateWithVersionAndTags = true;
      await expect(useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "Échec", category: "OTHER" })).rejects.toThrow();

      const result = await useCase.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "CONTRIBUTOR", title: "Succès", category: "OTHER" });
      expect(result.status).toBe("READY");
    });
  });
});
