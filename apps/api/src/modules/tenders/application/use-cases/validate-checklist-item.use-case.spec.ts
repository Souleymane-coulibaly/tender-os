import { beforeEach, describe, expect, it } from "vitest";
import { ChecklistItem } from "../../domain/checklist-item.entity";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FakeOutboxWriter,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryChecklistItemRepository,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { MarkChecklistItemNotApplicableUseCase, ValidateChecklistItemUseCase } from "./validate-checklist-item.use-case";

describe("ValidateChecklistItemUseCase / MarkChecklistItemNotApplicableUseCase", () => {
  let checklistRepository: InMemoryChecklistItemRepository;
  let tenderRepository: InMemoryTenderRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let outboxWriter: FakeOutboxWriter;
  let validateUseCase: ValidateChecklistItemUseCase;
  let markNotApplicableUseCase: MarkChecklistItemNotApplicableUseCase;

  beforeEach(async () => {
    checklistRepository = new InMemoryChecklistItemRepository();
    tenderRepository = new InMemoryTenderRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    outboxWriter = new FakeOutboxWriter();
    const clientPortfolio = await createClientPortfolioTestFixture("org-1");

    validateUseCase = new ValidateChecklistItemUseCase(
      checklistRepository,
      auditLogWriter,
      outboxWriter,
      new FixedClock(),
      tenderRepository,
      clientPortfolio.assertClientAccessUseCase,
    );
    markNotApplicableUseCase = new MarkChecklistItemNotApplicableUseCase(
      checklistRepository,
      auditLogWriter,
      outboxWriter,
      new FixedClock(),
      tenderRepository,
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
    await checklistRepository.save(
      ChecklistItem.create({ id: "item-1", organizationId: "org-1", tenderId: "tender-1", title: "Attestation", occurredAt: new Date() }),
    );
  });

  it("validates an item, records an audit entry, and writes a ChecklistItemValidated outbox event", async () => {
    const result = await validateUseCase.execute({ organizationId: "org-1", tenderId: "tender-1", itemId: "item-1", actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.complianceStatus).toBe("VALIDATED");
    expect(auditLogWriter.entries.some((entry) => entry.action === "tender.checklist_item_validated")).toBe(true);
    expect(outboxWriter.writes.some((write) => write.events.some((event) => event.eventType === "ChecklistItemValidated"))).toBe(true);
  });

  it("marks an item not applicable, records an audit entry, and writes a ChecklistItemMarkedNotApplicable outbox event", async () => {
    const result = await markNotApplicableUseCase.execute({ organizationId: "org-1", tenderId: "tender-1", itemId: "item-1", actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.complianceStatus).toBe("NOT_APPLICABLE");
    expect(auditLogWriter.entries.some((entry) => entry.action === "tender.checklist_item_marked_not_applicable")).toBe(true);
    expect(outboxWriter.writes.some((write) => write.events.some((event) => event.eventType === "ChecklistItemMarkedNotApplicable"))).toBe(true);
  });
});
