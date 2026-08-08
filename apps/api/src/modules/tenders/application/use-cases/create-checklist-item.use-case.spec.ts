import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import type { SubcontractorSubjectValidator } from "../ports/subcontractor-subject-validator";
import { ChecklistSubjectType } from "../../domain/checklist-item.entity";
import {
  ChecklistSubcontractorSubjectNotFoundError,
  InvalidChecklistSubjectError,
  TenderNotFoundError,
  TenderPermissionMissingError,
} from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryChecklistItemRepository,
  InMemoryChecklistItemSourceRepository,
  InMemoryTenderLotRepository,
  InMemoryTenderRepository,
  FakeOutboxWriter,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { CreateChecklistItemUseCase } from "./create-checklist-item.use-case";

describe("CreateChecklistItemUseCase", () => {
  let checklistRepository: InMemoryChecklistItemRepository;
  let tenderRepository: InMemoryTenderRepository;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let useCase: CreateChecklistItemUseCase;

  beforeEach(async () => {
    checklistRepository = new InMemoryChecklistItemRepository();
    tenderRepository = new InMemoryTenderRepository();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new CreateChecklistItemUseCase(
      checklistRepository,
      new InMemoryChecklistItemSourceRepository(),
      new InMemoryAuditLogWriter(),
      new FakeOutboxWriter(),
      new FixedClock(),
      new SequentialIdGenerator(),
      tenderRepository,
      new InMemoryTenderLotRepository(),
      clientPortfolio.assertClientAccessUseCase,
    );

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Marche de travaux",
        createdBy: "user-1",
        occurredAt: new Date(),
      }),
    );
  });

  it("creates a checklist item when the actor can manage the checklist", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      title: "Fournir attestation fiscale",
    });

    expect(result.title).toBe("Fournir attestation fiscale");
  });

  it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-2",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        title: "x",
      }),
    ).rejects.toThrow(TenderNotFoundError);
  });

  it("refuses when the actor lacks tender:manage_checklist", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
        title: "x",
      }),
    ).rejects.toThrow(TenderPermissionMissingError);
  });

  it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:manage_checklist", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-unaffiliated",
        actorRole: "BID_MANAGER",
        title: "x",
      }),
    ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
  });

  // Correctif audit Codex P2 — sujet sous-traitant insuffisamment validé (port + adapter).
  describe("subcontractor subject validation (correctif audit Codex P2)", () => {
    it("rejects subjectSubcontractorProfileId when subjectType is not SUBCONTRACTOR (cohérence du contexte)", async () => {
      await expect(
        useCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
          subjectType: ChecklistSubjectType.Candidate,
          subjectSubcontractorProfileId: "sub-1",
        }),
      ).rejects.toBeInstanceOf(InvalidChecklistSubjectError);
    });

    it("fails closed (rejects) when subjectType is SUBCONTRACTOR but no validator is wired — never a silent bypass of a security check", async () => {
      // `useCase` (bloc `beforeEach` ci-dessus) est construit SANS validateur — reproduit un pont
      // `SubcontractorSubjectValidationBridgeModule` non importé par `AppModule`.
      await expect(
        useCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
          subjectType: ChecklistSubjectType.Subcontractor,
          subjectSubcontractorProfileId: "sub-1",
        }),
      ).rejects.toBeInstanceOf(ChecklistSubcontractorSubjectNotFoundError);
    });

    it("propagates rejection from the injected validator (e.g. profile not found / archived / another organization)", async () => {
      const validator: SubcontractorSubjectValidator = {
        assertValid: vi.fn(async () => {
          throw new ChecklistSubcontractorSubjectNotFoundError();
        }),
      };
      const useCaseWithValidator = new CreateChecklistItemUseCase(
        checklistRepository,
        new InMemoryChecklistItemSourceRepository(),
        new InMemoryAuditLogWriter(),
        new FakeOutboxWriter(),
        new FixedClock(),
        new SequentialIdGenerator(),
        tenderRepository,
        new InMemoryTenderLotRepository(),
        clientPortfolio.assertClientAccessUseCase,
        validator,
      );

      await expect(
        useCaseWithValidator.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
          subjectType: ChecklistSubjectType.Subcontractor,
          subjectSubcontractorProfileId: "sub-cross-tenant",
        }),
      ).rejects.toBeInstanceOf(ChecklistSubcontractorSubjectNotFoundError);
    });

    it("accepts a valid subcontractor subject, delegating existence/organizationId/status entirely to the injected validator", async () => {
      const assertValid = vi.fn(async () => {});
      const useCaseWithValidator = new CreateChecklistItemUseCase(
        checklistRepository,
        new InMemoryChecklistItemSourceRepository(),
        new InMemoryAuditLogWriter(),
        new FakeOutboxWriter(),
        new FixedClock(),
        new SequentialIdGenerator(),
        tenderRepository,
        new InMemoryTenderLotRepository(),
        clientPortfolio.assertClientAccessUseCase,
        { assertValid },
      );

      const result = await useCaseWithValidator.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        title: "Attestation de sous-traitance",
        subjectType: ChecklistSubjectType.Subcontractor,
        subjectSubcontractorProfileId: "sub-real",
      });

      expect(result.subjectSubcontractorProfileId).toBe("sub-real");
      expect(assertValid).toHaveBeenCalledWith({ organizationId: "org-1", subcontractorProfileId: "sub-real", actorRole: "BID_MANAGER" });
    });
  });
});
