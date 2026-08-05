import { describe, expect, it, vi } from "vitest";
import { CreateSigningPowerUseCase, ListSigningPowersUseCase, UpdateSigningPowerUseCase, VerifySigningPowerUseCase } from "./signing-power.use-cases";
import type { SigningPowerRepository } from "../ports/signing-power.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { ClientPermission } from "../../../client-portfolio";
import { SigningPower } from "../../domain/signing-power.aggregate";
import { SigningPowerNotFoundError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  return { generate: () => "power-1" };
}
function fakeAccessService(): AdministrativeDossierAccessService {
  return { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
}

function inMemoryRepository(seed: readonly SigningPower[] = []): SigningPowerRepository {
  const rows = new Map<string, SigningPower>(seed.map((p) => [p.id, p]));
  return {
    create: async (power) => void rows.set(power.id, power),
    findById: async ({ signingPowerId }) => rows.get(signingPowerId) ?? null,
    listByTenderId: async ({ tenderId }) => [...rows.values()].filter((p) => p.tenderId === tenderId),
    save: async (power) => void rows.set(power.id, power),
  };
}

describe("CreateSigningPowerUseCase — mission §17 'plusieurs pouvoirs possibles par Tender'", () => {
  it("creates a signing power with an UNVERIFIED status", async () => {
    const useCase = new CreateSigningPowerUseCase(fakeAccessService(), inMemoryRepository(), fakeClock(), fakeIdGenerator());
    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, holderName: "Jean Dupont", representedEntityDescription: "SAS Acme", scope: "Signature de l'acte d'engagement" });
    expect(summary.status).toBe("UNVERIFIED");
  });
});

describe("UpdateSigningPowerUseCase", () => {
  it("throws SigningPowerNotFoundError for an unknown power", async () => {
    const useCase = new UpdateSigningPowerUseCase(fakeAccessService(), inMemoryRepository(), fakeClock());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", signingPowerId: "missing" })).rejects.toBeInstanceOf(SigningPowerNotFoundError);
  });

  it("reopens verification when the power's content is edited — mission 'jamais un pouvoir modifié qui resterait vérifié'", async () => {
    const power = SigningPower.create({ id: "power-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, holderName: "Jean Dupont", representedEntityDescription: "SAS Acme", scope: "Signature", createdBy: "user-1", occurredAt: NOW });
    power.linkDocument({ administrativeDocumentId: "doc-1", occurredAt: NOW });
    power.verify({ verifiedBy: "validator-1", occurredAt: NOW });
    const repository = inMemoryRepository([power]);
    const useCase = new UpdateSigningPowerUseCase(fakeAccessService(), repository, fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", signingPowerId: "power-1", holderName: "Jean Martin" });

    expect(summary.status).toBe("UNVERIFIED");
    expect(summary.verifiedBy).toBeUndefined();
  });
});

describe("VerifySigningPowerUseCase — mission §17 'preuve documentaire exigée'", () => {
  it("requires ValidateAdministrativeDossier permission, not just Manage", async () => {
    const power = SigningPower.create({ id: "power-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, holderName: "Jean Dupont", representedEntityDescription: "SAS Acme", scope: "Signature", createdBy: "user-1", occurredAt: NOW });
    power.linkDocument({ administrativeDocumentId: "doc-1", occurredAt: NOW });
    const repository = inMemoryRepository([power]);
    const accessService = fakeAccessService();
    const useCase = new VerifySigningPowerUseCase(accessService, repository, fakeClock());

    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "validator-1", actorRole: "OWNER", signingPowerId: "power-1" });

    expect(accessService.assertTenderAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: ClientPermission.ValidateAdministrativeDossier }));
  });

  it("refuses to verify a power with no attached proof document", async () => {
    const power = SigningPower.create({ id: "power-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, holderName: "Jean Dupont", representedEntityDescription: "SAS Acme", scope: "Signature", createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([power]);
    const useCase = new VerifySigningPowerUseCase(fakeAccessService(), repository, fakeClock());

    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "validator-1", actorRole: "OWNER", signingPowerId: "power-1" })).rejects.toThrow();
  });
});

describe("ListSigningPowersUseCase", () => {
  it("returns an empty list when no powers exist for the tender", async () => {
    const useCase = new ListSigningPowersUseCase(fakeAccessService(), inMemoryRepository(), fakeClock());
    const powers = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(powers).toEqual([]);
  });
});
