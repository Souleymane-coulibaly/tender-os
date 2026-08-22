import { describe, expect, it, vi } from "vitest";
import type { EntitlementService } from "../../../billing";
import { CreateAdministrativeRequirementUseCase, ListAdministrativeRequirementsUseCase, UpdateAdministrativeRequirementUseCase } from "./administrative-requirement.use-cases";
import type { AdministrativeRequirementRepository } from "../ports/administrative-requirement.repository";
import type { AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeDossierRecalculationService } from "../services/administrative-dossier-recalculation.service";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { AdministrativeRequirement } from "../../domain/administrative-requirement.aggregate";
import { AdministrativeRequirementOrigin } from "../../domain/administrative-requirement-origin";
import { AdministrativeDossier } from "../../domain/administrative-dossier.aggregate";
import { AdministrativeRequirementNotFoundError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  let n = 0;
  return { generate: () => `req-${(n += 1)}` };
}
function fakeAccessService(): AdministrativeDossierAccessService {
  return { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
}
function fakeStatusRecalculation(): AdministrativeDossierRecalculationService {
  return { recompute: vi.fn(async () => {}) } as unknown as AdministrativeDossierRecalculationService;
}
function fakeAuditLogWriter(): AuditLogWriter {
  return { record: vi.fn(async () => {}) };
}
function inMemoryRepository(seed: AdministrativeRequirement[] = []): AdministrativeRequirementRepository {
  const rows = new Map(seed.map((r) => [r.id, r]));
  return {
    create: async (r) => void rows.set(r.id, r),
    findById: async ({ requirementId }) => rows.get(requirementId) ?? null,
    listByTender: async () => [...rows.values()],
    listConfirmedByTender: async () => [...rows.values()].filter((r) => r.validationStatus === "CONFIRMED"),
    save: async (r) => void rows.set(r.id, r),
  };
}
function fakeDossierRepository(dossier: AdministrativeDossier | null): AdministrativeDossierRepository {
  return { create: async () => {}, findById: async () => dossier, findByTenderId: async () => dossier, save: async () => {} };
}
function fakeEntitlementService(): EntitlementService {
  return {
    canOperateOnTender: vi.fn(async () => true),
    runTenderOperationEntitled: vi.fn(async (_input: unknown, operation: () => Promise<unknown>) => operation()),
  } as unknown as EntitlementService;
}

describe("CreateAdministrativeRequirementUseCase", () => {
  it("creates a MANUAL requirement, always starting SUGGESTED", async () => {
    const useCase = new CreateAdministrativeRequirementUseCase(fakeAccessService(), inMemoryRepository(), fakeAuditLogWriter(), fakeClock(), fakeIdGenerator(), fakeEntitlementService());
    const summary = await useCase.execute({
      organizationId: ORGANIZATION_ID,
      actorId: "user-1",
      actorRole: "OWNER",
      tenderId: TENDER_ID,
      title: "Attestation fiscale",
      requirementType: "DOCUMENT",
      expectedDocumentType: AdministrativeDocumentType.AttestationFiscale,
      required: true,
    });
    expect(summary.origin).toBe(AdministrativeRequirementOrigin.Manual);
    expect(summary.validationStatus).toBe("SUGGESTED");
  });
});

describe("UpdateAdministrativeRequirementUseCase — mission §8/§22 permission gating", () => {
  function baseRequirement() {
    return AdministrativeRequirement.create({
      id: "req-1",
      organizationId: ORGANIZATION_ID,
      tenderId: TENDER_ID,
      title: "Attestation fiscale",
      requirementType: "DOCUMENT",
      expectedDocumentType: AdministrativeDocumentType.AttestationFiscale,
      required: true,
      origin: AdministrativeRequirementOrigin.Manual,
      createdBy: "user-1",
      occurredAt: NOW,
    });
  }

  it("a CONFIRM action checks ValidateAdministrativeDossier, not ManageAdministrativeDossier", async () => {
    const requirement = baseRequirement();
    const repository = inMemoryRepository([requirement]);
    const accessService = fakeAccessService();
    const dossier = AdministrativeDossier.create({ id: "dossier-1", organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: TENDER_ID, occurredAt: NOW });
    const statusRecalculation = fakeStatusRecalculation();
    const auditLogWriter = fakeAuditLogWriter();
    const useCase = new UpdateAdministrativeRequirementUseCase(accessService, repository, fakeDossierRepository(dossier), auditLogWriter, statusRecalculation, fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", requirementId: "req-1", action: "CONFIRM" });

    expect(summary.validationStatus).toBe("CONFIRMED");
    expect(accessService.assertTenderAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "CLIENT_VALIDATE_ADMINISTRATIVE_DOSSIER", tenderId: TENDER_ID }));
    expect(statusRecalculation.recompute).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, dossierId: "dossier-1" });
    expect(auditLogWriter.record).toHaveBeenCalledWith(expect.objectContaining({ action: "ADMINISTRATIVE_REQUIREMENT_CONFIRM" }));
  });

  it("a plain edit (no action) checks ManageAdministrativeDossier", async () => {
    const requirement = baseRequirement();
    const repository = inMemoryRepository([requirement]);
    const accessService = fakeAccessService();
    const useCase = new UpdateAdministrativeRequirementUseCase(accessService, repository, fakeDossierRepository(null), fakeAuditLogWriter(), fakeStatusRecalculation(), fakeClock());

    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", requirementId: "req-1", title: "Nouvelle attestation" });

    expect(accessService.assertTenderAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "CLIENT_MANAGE_ADMINISTRATIVE_DOSSIER" }));
  });

  it("throws AdministrativeRequirementNotFoundError for an unknown requirement id", async () => {
    const useCase = new UpdateAdministrativeRequirementUseCase(fakeAccessService(), inMemoryRepository(), fakeDossierRepository(null), fakeAuditLogWriter(), fakeStatusRecalculation(), fakeClock());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", requirementId: "missing", action: "CONFIRM" })).rejects.toBeInstanceOf(
      AdministrativeRequirementNotFoundError,
    );
  });

  it("matching a document links matchedDocumentId", async () => {
    const requirement = baseRequirement();
    const repository = inMemoryRepository([requirement]);
    const useCase = new UpdateAdministrativeRequirementUseCase(fakeAccessService(), repository, fakeDossierRepository(null), fakeAuditLogWriter(), fakeStatusRecalculation(), fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-2", actorRole: "OWNER", requirementId: "req-1", documentId: "doc-1" });

    expect(summary.matchedDocumentId).toBe("doc-1");
  });
});

describe("ListAdministrativeRequirementsUseCase", () => {
  it("lists requirements for a tender", async () => {
    const requirement = AdministrativeRequirement.create({
      id: "req-1",
      organizationId: ORGANIZATION_ID,
      tenderId: TENDER_ID,
      title: "Attestation fiscale",
      requirementType: "DOCUMENT",
      expectedDocumentType: AdministrativeDocumentType.AttestationFiscale,
      required: true,
      origin: AdministrativeRequirementOrigin.Manual,
      createdBy: "user-1",
      occurredAt: NOW,
    });
    const useCase = new ListAdministrativeRequirementsUseCase(fakeAccessService(), inMemoryRepository([requirement]));
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result).toHaveLength(1);
  });
});
