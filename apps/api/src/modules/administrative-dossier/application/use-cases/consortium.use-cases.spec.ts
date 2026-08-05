import { describe, expect, it, vi } from "vitest";
import { EnsureConsortiumUseCase, GetConsortiumUseCase, UpdateConsortiumUseCase } from "./consortium.use-cases";
import type { ConsortiumRepository } from "../ports/consortium.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { Consortium, ConsortiumType } from "../../domain/consortium.aggregate";
import { ConsortiumMandataireNotAMemberError, ConsortiumNotFoundError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  return { generate: () => "consortium-1" };
}
function fakeAccessService(): AdministrativeDossierAccessService {
  return { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
}

function inMemoryRepository(seed: readonly Consortium[] = []): ConsortiumRepository {
  const rows = new Map<string, Consortium>(seed.map((c) => [c.id, c]));
  return {
    create: async (consortium) => void rows.set(consortium.id, consortium),
    findById: async ({ consortiumId }) => rows.get(consortiumId) ?? null,
    findByTenderId: async ({ tenderId }) => [...rows.values()].find((c) => c.tenderId === tenderId) ?? null,
    save: async (consortium) => void rows.set(consortium.id, consortium),
  };
}

describe("EnsureConsortiumUseCase — mission §15 'un groupement par Tender'", () => {
  it("creates a consortium when none exists yet", async () => {
    const repository = inMemoryRepository();
    const useCase = new EnsureConsortiumUseCase(fakeAccessService(), repository, fakeClock(), fakeIdGenerator());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, type: ConsortiumType.Joint });

    expect(summary.type).toBe("JOINT");
    expect(summary.members).toEqual([]);
  });

  it("is idempotent: a second call returns the same consortium", async () => {
    const repository = inMemoryRepository();
    const useCase = new EnsureConsortiumUseCase(fakeAccessService(), repository, fakeClock(), fakeIdGenerator());

    const first = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, type: ConsortiumType.Joint });
    const second = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, type: ConsortiumType.Solidarity });

    expect(second.id).toBe(first.id);
    expect(second.type).toBe("JOINT");
  });
});

describe("UpdateConsortiumUseCase", () => {
  it("throws ConsortiumNotFoundError for an unknown consortium", async () => {
    const useCase = new UpdateConsortiumUseCase(fakeAccessService(), inMemoryRepository(), fakeClock());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", consortiumId: "missing" })).rejects.toBeInstanceOf(ConsortiumNotFoundError);
  });

  it("mission §15 — refuses setting members that drop the current mandataire", async () => {
    const consortium = Consortium.create({ id: "consortium-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, type: ConsortiumType.Joint, createdBy: "user-1", occurredAt: NOW });
    consortium.setMembers({ members: [{ memberId: "m1", name: "Member 1", role: "mandataire" }], occurredAt: NOW });
    consortium.setMandataire({ mandataireMemberId: "m1", occurredAt: NOW });
    const repository = inMemoryRepository([consortium]);
    const useCase = new UpdateConsortiumUseCase(fakeAccessService(), repository, fakeClock());

    await expect(
      useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", consortiumId: "consortium-1", members: [{ memberId: "m2", name: "Member 2", role: "co-traitant" }] }),
    ).rejects.toBeInstanceOf(ConsortiumMandataireNotAMemberError);
  });

  it("updates type/legalForm and persists", async () => {
    const consortium = Consortium.create({ id: "consortium-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, type: ConsortiumType.Joint, createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([consortium]);
    const useCase = new UpdateConsortiumUseCase(fakeAccessService(), repository, fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", consortiumId: "consortium-1", type: ConsortiumType.Solidarity, legalForm: "SAS" });

    expect(summary.type).toBe("SOLIDARITY");
    expect(summary.legalForm).toBe("SAS");
  });
});

describe("GetConsortiumUseCase", () => {
  it("returns null when no consortium exists for the tender", async () => {
    const useCase = new GetConsortiumUseCase(fakeAccessService(), inMemoryRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result).toBeNull();
  });
});
