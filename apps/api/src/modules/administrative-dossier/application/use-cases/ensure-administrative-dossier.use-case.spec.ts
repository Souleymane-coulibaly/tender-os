import { describe, expect, it, vi } from "vitest";
import type { EntitlementService } from "../../../billing";
import { EnsureAdministrativeDossierUseCase } from "./ensure-administrative-dossier.use-case";
import type { AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { AdministrativeDossier } from "../../domain/administrative-dossier.aggregate";
import { DuplicateAdministrativeDossierError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const CLIENT_ACCOUNT_ID = "client-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  return { generate: () => "dossier-1" };
}
function fakeAuditLogWriter(): AuditLogWriter {
  return { record: vi.fn(async () => {}) };
}
function fakeAccessService(): AdministrativeDossierAccessService {
  return { assertTenderAccess: vi.fn(async () => CLIENT_ACCOUNT_ID) } as unknown as AdministrativeDossierAccessService;
}
function fakeEntitlementService(): EntitlementService {
  return {
    canOperateOnTender: vi.fn(async () => true),
    runTenderOperationEntitled: vi.fn(async (_input: unknown, operation: () => Promise<unknown>) => operation()),
  } as unknown as EntitlementService;
}

describe("EnsureAdministrativeDossierUseCase — mission §6 'création idempotente'", () => {
  it("creates a dossier when none exists yet", async () => {
    const rows = new Map<string, AdministrativeDossier>();
    const repository: AdministrativeDossierRepository = {
      create: async (dossier) => void rows.set(dossier.id, dossier),
      findById: async () => null,
      findByTenderId: async () => [...rows.values()].find((d) => d.tenderId === TENDER_ID) ?? null,
      save: async () => {},
    };
    const useCase = new EnsureAdministrativeDossierUseCase(repository, fakeAccessService(), fakeAuditLogWriter(), fakeClock(), fakeIdGenerator(), fakeEntitlementService());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(summary.tenderId).toBe(TENDER_ID);
    expect(summary.status).toBe("INCOMPLETE");
    expect(rows.size).toBe(1);
  });

  it("is idempotent: a second call returns the SAME dossier, never a duplicate", async () => {
    const rows = new Map<string, AdministrativeDossier>();
    const repository: AdministrativeDossierRepository = {
      create: async (dossier) => void rows.set(dossier.id, dossier),
      findById: async () => null,
      findByTenderId: async () => [...rows.values()].find((d) => d.tenderId === TENDER_ID) ?? null,
      save: async () => {},
    };
    const useCase = new EnsureAdministrativeDossierUseCase(repository, fakeAccessService(), fakeAuditLogWriter(), fakeClock(), fakeIdGenerator(), fakeEntitlementService());

    const first = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    const second = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(second.id).toBe(first.id);
    expect(rows.size).toBe(1);
  });

  it("recovers from a concurrent creation race by re-reading the winner's row, never surfacing the conflict", async () => {
    const winner = AdministrativeDossier.create({ id: "dossier-winner", organizationId: ORGANIZATION_ID, clientAccountId: CLIENT_ACCOUNT_ID, tenderId: TENDER_ID, occurredAt: NOW });
    let findCalls = 0;
    const repository: AdministrativeDossierRepository = {
      create: async () => {
        throw new DuplicateAdministrativeDossierError();
      },
      findById: async () => null,
      findByTenderId: async () => {
        findCalls += 1;
        return findCalls === 1 ? null : winner;
      },
      save: async () => {},
    };
    const useCase = new EnsureAdministrativeDossierUseCase(repository, fakeAccessService(), fakeAuditLogWriter(), fakeClock(), fakeIdGenerator(), fakeEntitlementService());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(summary.id).toBe("dossier-winner");
  });
});
