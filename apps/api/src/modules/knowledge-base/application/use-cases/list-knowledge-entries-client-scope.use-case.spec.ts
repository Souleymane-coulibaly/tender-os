import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import { ClientAssignment } from "../../../client-portfolio/domain/client-assignment.entity";
import { ClientRole } from "../../../client-portfolio/domain/client-role";
import { InMemoryClientAssignmentRepository } from "../../../client-portfolio/test-support/fakes";
import { KnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import { KnowledgeSourceType } from "../../domain/knowledge-source-type";
import {
  InMemoryKnowledgeDocumentRepository,
  InMemoryKnowledgeEntryRepository,
  InMemoryKnowledgeTagRepository,
} from "../../test-support/fakes";
import { ListKnowledgeEntriesUseCase } from "./list-knowledge-entries.use-case";

const ORG = randomUUID();
const NOW = new Date("2026-07-30T10:00:00Z");
const CLIENT_A = randomUUID();
const CLIENT_B = randomUUID();

function buildEntry(overrides: Partial<Parameters<typeof KnowledgeEntry.create>[0]> = {}): KnowledgeEntry {
  return KnowledgeEntry.create({
    id: randomUUID(),
    organizationId: ORG,
    knowledgeSpaceId: randomUUID(),
    title: "Entrée",
    category: KnowledgeCategory.Other,
    sourceType: KnowledgeSourceType.Manual,
    metadata: {},
    createdByUserId: "actor",
    occurredAt: NOW,
    ...overrides,
  });
}

describe("ListKnowledgeEntriesUseCase — portée globale/client (mission Sprint 5.1)", () => {
  let entryRepository: InMemoryKnowledgeEntryRepository;
  let clientAssignmentRepository: InMemoryClientAssignmentRepository;
  let useCase: ListKnowledgeEntriesUseCase;
  let globalEntryId: string;
  let clientAEntryId: string;
  let clientBEntryId: string;

  beforeEach(async () => {
    entryRepository = new InMemoryKnowledgeEntryRepository();
    clientAssignmentRepository = new InMemoryClientAssignmentRepository();
    useCase = new ListKnowledgeEntriesUseCase(
      entryRepository,
      new InMemoryKnowledgeTagRepository(),
      new InMemoryKnowledgeDocumentRepository(),
      new ListAccessibleClientsUseCase(clientAssignmentRepository),
    );

    const globalEntry = buildEntry({ title: "Présentation entreprise" });
    const clientAEntry = buildEntry({ title: "Historique Client A", clientAccountId: CLIENT_A });
    const clientBEntry = buildEntry({ title: "Historique Client B", clientAccountId: CLIENT_B });
    await entryRepository.create(globalEntry);
    await entryRepository.create(clientAEntry);
    await entryRepository.create(clientBEntry);
    globalEntryId = globalEntry.id;
    clientAEntryId = clientAEntry.id;
    clientBEntryId = clientBEntry.id;
  });

  it("OWNER sees the global entry AND every client's entries", async () => {
    const result = await useCase.execute({ organizationId: ORG, actorId: randomUUID(), actorRole: "OWNER", includeArchived: false, limit: 50 });
    expect(result.items.map((e) => e.id).sort()).toEqual([globalEntryId, clientAEntryId, clientBEntryId].sort());
  });

  it("a MEMBER-tier actor assigned only to Client A sees the global entry and Client A's entry, never Client B's", async () => {
    const userId = randomUUID();
    await clientAssignmentRepository.create(
      ClientAssignment.create({ id: randomUUID(), organizationId: ORG, clientAccountId: CLIENT_A, userId, role: ClientRole.Viewer, createdBy: "actor", occurredAt: NOW }),
    );

    const result = await useCase.execute({ organizationId: ORG, actorId: userId, actorRole: "BID_MANAGER", includeArchived: false, limit: 50 });
    const ids = result.items.map((e) => e.id).sort();
    expect(ids).toEqual([globalEntryId, clientAEntryId].sort());
    expect(ids).not.toContain(clientBEntryId);
  });

  it("a MEMBER-tier actor with NO client assignment at all still sees only the global entry, never any client entry", async () => {
    const result = await useCase.execute({ organizationId: ORG, actorId: randomUUID(), actorRole: "BID_MANAGER", includeArchived: false, limit: 50 });
    expect(result.items.map((e) => e.id)).toEqual([globalEntryId]);
  });

  it("filtering explicitly by clientAccountId=Client B never returns anything for a Client-A-only actor", async () => {
    const userId = randomUUID();
    await clientAssignmentRepository.create(
      ClientAssignment.create({ id: randomUUID(), organizationId: ORG, clientAccountId: CLIENT_A, userId, role: ClientRole.Viewer, createdBy: "actor", occurredAt: NOW }),
    );

    const result = await useCase.execute({
      organizationId: ORG,
      actorId: userId,
      actorRole: "BID_MANAGER",
      includeArchived: false,
      limit: 50,
      clientAccountId: CLIENT_B,
    });
    expect(result.items).toHaveLength(0);
  });

  it('filtering explicitly by clientAccountId="GLOBAL" returns only the global entry, even for OWNER', async () => {
    const result = await useCase.execute({
      organizationId: ORG,
      actorId: randomUUID(),
      actorRole: "OWNER",
      includeArchived: false,
      limit: 50,
      clientAccountId: "GLOBAL",
    });
    expect(result.items.map((e) => e.id)).toEqual([globalEntryId]);
  });
});
