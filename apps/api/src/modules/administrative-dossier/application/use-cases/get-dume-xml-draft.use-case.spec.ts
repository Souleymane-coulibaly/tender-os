import { describe, expect, it, vi } from "vitest";
import { GetDumeXmlDraftUseCase } from "./get-dume-xml-draft.use-case";
import type { DumeDeclarationRepository, DumeDeclarationVersionRepository } from "../ports/dume-declaration.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { GetTenderUseCase } from "../../../tenders";
import { ClientPermission } from "../../../client-portfolio";
import { DumeDeclaration } from "../../domain/dume-declaration.aggregate";
import { DumeDeclarationVersion } from "../../domain/dume-declaration-version.entity";
import { DumeDeclarationHasNoVersionError, DumeDeclarationNotFoundError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeGetTenderUseCase(): GetTenderUseCase {
  return { execute: vi.fn(async () => ({ title: "Marché de test" })) } as unknown as GetTenderUseCase;
}
function fakeDeclarationRepository(declaration: DumeDeclaration | null): DumeDeclarationRepository {
  return { create: async () => {}, findById: async () => declaration, findByTenderId: async () => declaration, save: async () => {} };
}
function fakeVersionRepository(versions: readonly DumeDeclarationVersion[]): DumeDeclarationVersionRepository {
  return { create: async () => {}, findById: async () => null, listByDeclaration: async () => versions };
}

describe("GetDumeXmlDraftUseCase — mission : jamais persisté, jamais dans la checklist/le package", () => {
  it("throws DumeDeclarationNotFoundError when no declaration exists", async () => {
    const accessService = { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
    const useCase = new GetDumeXmlDraftUseCase(accessService, fakeDeclarationRepository(null), fakeVersionRepository([]), fakeGetTenderUseCase(), fakeClock());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID })).rejects.toBeInstanceOf(DumeDeclarationNotFoundError);
  });

  it("throws DumeDeclarationHasNoVersionError when the declaration has no version yet", async () => {
    const declaration = DumeDeclaration.create({ id: "dume-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    const accessService = { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
    const useCase = new GetDumeXmlDraftUseCase(accessService, fakeDeclarationRepository(declaration), fakeVersionRepository([]), fakeGetTenderUseCase(), fakeClock());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID })).rejects.toBeInstanceOf(DumeDeclarationHasNoVersionError);
  });

  it("requires only the Read permission — this is a query, never a mutation", async () => {
    const declaration = DumeDeclaration.create({ id: "dume-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    declaration.recordNewVersion({ versionNumber: 1, occurredAt: NOW });
    const version = DumeDeclarationVersion.create({ id: "v1", organizationId: ORGANIZATION_ID, dumeDeclarationId: "dume-1", version: 1, data: { legalIdentity: "SIRET 999" }, createdBy: "user-1", occurredAt: NOW });
    const accessService = { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
    const useCase = new GetDumeXmlDraftUseCase(accessService, fakeDeclarationRepository(declaration), fakeVersionRepository([version]), fakeGetTenderUseCase(), fakeClock());

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "VIEWER", tenderId: TENDER_ID });

    expect(accessService.assertTenderAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: ClientPermission.ReadAdministrativeDossier }));
    expect(result.xml).toContain("SIRET 999");
    expect(result.fileName).toContain("brouillon-non-officiel");
  });
});
