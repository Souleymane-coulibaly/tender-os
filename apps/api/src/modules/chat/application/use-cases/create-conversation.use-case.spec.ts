import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import type { TenderLotRepository } from "../../../tenders";
import { TenderPermissionMissingError } from "../../../tenders";
import { FakeAtomicTransactionRunner, FakeOutboxWriter, FixedClock, InMemoryAuditLogWriter, InMemoryConversationRepository, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateConversationUseCase } from "./create-conversation.use-case";

describe("CreateConversationUseCase", () => {
  let conversationRepository: InMemoryConversationRepository;
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };
  let assertClientAccessUseCase: { execute: ReturnType<typeof vi.fn> };
  let lotRepository: { findById: ReturnType<typeof vi.fn> };
  let useCase: CreateConversationUseCase;

  beforeEach(() => {
    conversationRepository = new InMemoryConversationRepository();
    getTenderUseCase = { execute: vi.fn(async () => ({ id: "tender-1", clientAccountId: "client-1" })) };
    assertClientAccessUseCase = { execute: vi.fn(async () => {}) };
    lotRepository = { findById: vi.fn(async () => ({ id: "lot-1" })) };

    useCase = new CreateConversationUseCase(
      conversationRepository,
      lotRepository as unknown as TenderLotRepository,
      new InMemoryAuditLogWriter(),
      new FakeOutboxWriter() as never,
      new FixedClock(),
      new SequentialIdGenerator(),
      new FakeAtomicTransactionRunner(),
      getTenderUseCase as unknown as GetTenderUseCase,
      assertClientAccessUseCase as never,
    );
  });

  it("creates a conversation denormalizing clientAccountId from the Tender, scoped to exactly one Tender", async () => {
    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER", title: "Analyse du DCE" });

    expect(result.tenderId).toBe("tender-1");
    expect(result.clientAccountId).toBe("client-1");
    expect(result.title).toBe("Analyse du DCE");
    expect(conversationRepository.conversations).toHaveLength(1);
  });

  it("rejects a role without TenderPermission.UseChat (e.g. READ_ONLY) before touching any repository", async () => {
    await expect(useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "READ_ONLY" })).rejects.toBeInstanceOf(TenderPermissionMissingError);
    expect(conversationRepository.conversations).toHaveLength(0);
    expect(getTenderUseCase.execute).not.toHaveBeenCalled();
  });

  it("verifies a provided lotId belongs to the same Tender before creating the conversation", async () => {
    lotRepository.findById.mockResolvedValueOnce(null);
    await expect(useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER", lotId: "lot-other-tender" })).rejects.toThrow();
    expect(conversationRepository.conversations).toHaveLength(0);
  });

  it("always calls assertClientAccessUseCase with ClientPermission.UseChat (dual-tier composition)", async () => {
    await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER" });
    expect(assertClientAccessUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ permission: "CLIENT_USE_CHAT", clientAccountId: "client-1" }));
  });
});
