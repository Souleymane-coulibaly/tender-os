import { describe, expect, it, vi } from "vitest";
import { ClientPermission } from "../../../client-portfolio";
import { ApprovalEntityType } from "../../domain/approval-request.entity";
import { ApprovalTargetNotImmutableError, InvalidCommentEntityError, TaskNotFoundError } from "../../domain/errors";
import { ApprovalTargetResolver, requiredValidatePermissionForApprovalEntityType } from "./approval-target-resolver";

const ORG_ID = "org-1";
const TENDER_ID = "tender-1";

function buildResolver(input: {
  sectionRevisionTenderId?: string | null;
  pricingVersion?: { tenderId: string; status: string } | null;
  packageVersion?: { tenderId: string; status: string } | null;
}) {
  const getSectionRevisionTenderRef = { execute: vi.fn(async () => (input.sectionRevisionTenderId === undefined ? null : input.sectionRevisionTenderId === null ? null : { revisionId: "rev-1", technicalMemoSectionId: "section-1", tenderId: input.sectionRevisionTenderId })) };
  const getPricingScheduleVersionTenderRef = {
    execute: vi.fn(async () => (input.pricingVersion === undefined || input.pricingVersion === null ? null : { versionId: "pv-1", pricingScheduleId: "ps-1", tenderId: input.pricingVersion.tenderId, status: input.pricingVersion.status })),
  };
  const getResponsePackageVersionTenderRef = {
    execute: vi.fn(async () => (input.packageVersion === undefined || input.packageVersion === null ? null : { versionId: "rpv-1", responsePackageId: "rp-1", tenderId: input.packageVersion.tenderId, status: input.packageVersion.status })),
  };
  return new ApprovalTargetResolver(getSectionRevisionTenderRef as never, getPricingScheduleVersionTenderRef as never, getResponsePackageVersionTenderRef as never);
}

describe("requiredValidatePermissionForApprovalEntityType — mission §26/§31", () => {
  it("reuses existing Validate* permissions, never a new Approve* permission", () => {
    expect(requiredValidatePermissionForApprovalEntityType(ApprovalEntityType.Task)).toBe(ClientPermission.ValidateWorkspace);
    expect(requiredValidatePermissionForApprovalEntityType(ApprovalEntityType.ChecklistItem)).toBe(ClientPermission.ValidateWorkspace);
    expect(requiredValidatePermissionForApprovalEntityType(ApprovalEntityType.TechnicalMemoSectionRevision)).toBe(ClientPermission.ValidateTechnicalMemo);
    expect(requiredValidatePermissionForApprovalEntityType(ApprovalEntityType.PricingScheduleVersion)).toBe(ClientPermission.ValidatePricingSchedule);
    expect(requiredValidatePermissionForApprovalEntityType(ApprovalEntityType.ResponsePackageVersion)).toBe(ClientPermission.ValidateResponsePackage);
  });
});

describe("ApprovalTargetResolver.assertRequestable — mission §20/§25/§26 (BLOQUANT)", () => {
  it("TECHNICAL_MEMO_SECTION_REVISION: accepts a revision belonging to the same Tender (always immutable, no status check needed)", async () => {
    const resolver = buildResolver({ sectionRevisionTenderId: TENDER_ID });
    await expect(
      resolver.assertRequestable({} as never, { organizationId: ORG_ID, tenderId: TENDER_ID, entityType: ApprovalEntityType.TechnicalMemoSectionRevision, entityId: "rev-1" }),
    ).resolves.toBeUndefined();
  });

  it("TECHNICAL_MEMO_SECTION_REVISION: rejects a revision belonging to a DIFFERENT Tender (anti-IDOR)", async () => {
    const resolver = buildResolver({ sectionRevisionTenderId: "tender-OTHER" });
    await expect(
      resolver.assertRequestable({} as never, { organizationId: ORG_ID, tenderId: TENDER_ID, entityType: ApprovalEntityType.TechnicalMemoSectionRevision, entityId: "rev-1" }),
    ).rejects.toThrow(InvalidCommentEntityError);
  });

  it("TECHNICAL_MEMO_SECTION_REVISION: rejects a non-existent revision", async () => {
    const resolver = buildResolver({ sectionRevisionTenderId: null });
    await expect(
      resolver.assertRequestable({} as never, { organizationId: ORG_ID, tenderId: TENDER_ID, entityType: ApprovalEntityType.TechnicalMemoSectionRevision, entityId: "missing" }),
    ).rejects.toThrow(InvalidCommentEntityError);
  });

  it("BLOQUANT — PRICING_SCHEDULE_VERSION: rejects a DRAFT version — mission §25 'version précise, jamais latest/modifiable'", async () => {
    const resolver = buildResolver({ pricingVersion: { tenderId: TENDER_ID, status: "DRAFT" } });
    await expect(
      resolver.assertRequestable({} as never, { organizationId: ORG_ID, tenderId: TENDER_ID, entityType: ApprovalEntityType.PricingScheduleVersion, entityId: "pv-1" }),
    ).rejects.toThrow(ApprovalTargetNotImmutableError);
  });

  it("PRICING_SCHEDULE_VERSION: accepts a VALIDATED version of the same Tender", async () => {
    const resolver = buildResolver({ pricingVersion: { tenderId: TENDER_ID, status: "VALIDATED" } });
    await expect(
      resolver.assertRequestable({} as never, { organizationId: ORG_ID, tenderId: TENDER_ID, entityType: ApprovalEntityType.PricingScheduleVersion, entityId: "pv-1" }),
    ).resolves.toBeUndefined();
  });

  it("PRICING_SCHEDULE_VERSION: rejects a VALIDATED version belonging to a DIFFERENT Tender (anti-IDOR)", async () => {
    const resolver = buildResolver({ pricingVersion: { tenderId: "tender-OTHER", status: "VALIDATED" } });
    await expect(
      resolver.assertRequestable({} as never, { organizationId: ORG_ID, tenderId: TENDER_ID, entityType: ApprovalEntityType.PricingScheduleVersion, entityId: "pv-1" }),
    ).rejects.toThrow(InvalidCommentEntityError);
  });

  it("BLOQUANT — RESPONSE_PACKAGE_VERSION: rejects an IN_REVIEW (not yet VALIDATED) version", async () => {
    const resolver = buildResolver({ packageVersion: { tenderId: TENDER_ID, status: "IN_REVIEW" } });
    await expect(
      resolver.assertRequestable({} as never, { organizationId: ORG_ID, tenderId: TENDER_ID, entityType: ApprovalEntityType.ResponsePackageVersion, entityId: "rpv-1" }),
    ).rejects.toThrow(ApprovalTargetNotImmutableError);
  });

  it("RESPONSE_PACKAGE_VERSION: accepts a VALIDATED version of the same Tender", async () => {
    const resolver = buildResolver({ packageVersion: { tenderId: TENDER_ID, status: "VALIDATED" } });
    await expect(
      resolver.assertRequestable({} as never, { organizationId: ORG_ID, tenderId: TENDER_ID, entityType: ApprovalEntityType.ResponsePackageVersion, entityId: "rpv-1" }),
    ).resolves.toBeUndefined();
  });

  it("TASK: still delegates to loadTask (unchanged Sprint 7 behavior) — throws TaskNotFoundError for a missing task", async () => {
    const resolver = buildResolver({});
    const taskRepository = { findById: vi.fn(async () => null) };
    await expect(
      resolver.assertRequestable({ taskRepository: taskRepository as never, checklistItemRepository: {} as never }, { organizationId: ORG_ID, tenderId: TENDER_ID, entityType: ApprovalEntityType.Task, entityId: "missing" }),
    ).rejects.toThrow(TaskNotFoundError);
  });
});
