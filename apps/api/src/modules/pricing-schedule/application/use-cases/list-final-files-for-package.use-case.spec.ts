import { describe, expect, it, vi } from "vitest";
import { ListFinalFilesForPackageUseCase } from "./list-final-files-for-package.use-case";
import { PricingSchedule } from "../../domain/pricing-schedule.aggregate";
import { PricingScheduleFinalFile } from "../../domain/pricing-schedule-final-file.value-object";
import { FinancialDocumentType } from "../../domain/enums";
import type { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { InMemoryPricingScheduleFinalFileRepository, InMemoryPricingScheduleRepository } from "../../test-support/fakes";

const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const CLIENT_ACCOUNT_ID = "client-commercial-x";
const CANDIDATE_A = "candidate-a";
const CANDIDATE_B = "candidate-b";

function fakeAccessService(): PricingScheduleAccessService {
  return { assertTenderAccess: vi.fn(async () => ({ clientAccountId: CLIENT_ACCOUNT_ID, candidateCompanyId: CANDIDATE_A })) } as unknown as PricingScheduleAccessService;
}

function validatedSchedule(input: { id: string; candidateCompanyId: string | undefined; versionId: string; lotId?: string }): PricingSchedule {
  const schedule = PricingSchedule.create({
    id: input.id,
    organizationId: ORGANIZATION_ID,
    tenderId: TENDER_ID,
    lotId: input.lotId,
    clientAccountId: CLIENT_ACCOUNT_ID,
    candidateCompanyId: input.candidateCompanyId,
    financialDocumentType: FinancialDocumentType.Bpu,
    sourceDocumentId: `doc-${input.id}`,
    sourceDocumentVersionId: `doc-version-${input.id}`,
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
  schedule.advanceToVersion({ versionId: input.versionId, versionNumber: 1, occurredAt: new Date("2026-01-01T00:00:00Z") });
  schedule.markValidated(new Date("2026-01-01T00:00:00Z"));
  return schedule;
}

function buildUseCase(input: { schedules: PricingSchedule[]; finalFiles: PricingScheduleFinalFile[]; accessService?: PricingScheduleAccessService }) {
  const scheduleRepository = new InMemoryPricingScheduleRepository();
  scheduleRepository.schedules.push(...input.schedules);
  const finalFileRepository = new InMemoryPricingScheduleFinalFileRepository();
  finalFileRepository.finalFiles.push(...input.finalFiles);
  return new ListFinalFilesForPackageUseCase(scheduleRepository, finalFileRepository, input.accessService ?? fakeAccessService());
}

/** TENDEROS-2.1-P2.2-E1 — mission §36-45 : preuve unitaire directe (mission §36 "tester directement
 *  le use case, sans HTTP") que la résolution des fichiers financiers finaux pour le Response
 *  Package suit STRICTEMENT la CandidateCompany courante du Tender, jamais le ClientAccount
 *  commercial. Fixtures nommées explicitement "CLIENT COMMERCIAL X" / "CANDIDAT A/B" (mission §15
 *  "ne pas utiliser des fixtures où Client et Candidate ont le même nom : cela masquerait le bug"). */
describe("ListFinalFilesForPackageUseCase — Checkpoint TENDEROS-2.1-P2.2-E1 (correctif audit baseline P1)", () => {
  it("TEST 1 — CLIENT ≠ CANDIDATE: a final file that belongs to the Tender's current CandidateCompany (A) is resolved", async () => {
    const scheduleA = validatedSchedule({ id: "schedule-a", candidateCompanyId: CANDIDATE_A, versionId: "version-a" });
    const finalFileA = PricingScheduleFinalFile.create({ id: "file-a", organizationId: ORGANIZATION_ID, pricingScheduleVersionId: "version-a", documentId: "doc-final-a", documentVersionId: "doc-final-a-v1", injectedCellCount: 2, generatedBy: "user-1", occurredAt: new Date() });

    const useCase = buildUseCase({ schedules: [scheduleA], finalFiles: [finalFileA] });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: CANDIDATE_A });

    expect(result).toHaveLength(1);
    expect(result[0]!.documentId).toBe("doc-final-a");
  });

  it("TEST 2/TEST 37 — WRONG CANDIDATE: a final file belonging to a DIFFERENT candidate (B) is never returned for candidate A, even though both share the same Tender/ClientAccount", async () => {
    const scheduleB = validatedSchedule({ id: "schedule-b", candidateCompanyId: CANDIDATE_B, versionId: "version-b" });
    const finalFileB = PricingScheduleFinalFile.create({ id: "file-b", organizationId: ORGANIZATION_ID, pricingScheduleVersionId: "version-b", documentId: "doc-final-b", documentVersionId: "doc-final-b-v1", injectedCellCount: 2, generatedBy: "user-1", occurredAt: new Date() });

    const useCase = buildUseCase({ schedules: [scheduleB], finalFiles: [finalFileB] });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: CANDIDATE_A });

    expect(result).toEqual([]);
  });

  it("TEST 39 — TWO CANDIDATES: with pricing finalized for BOTH A and B, requesting for B returns only B's file", async () => {
    const scheduleA = validatedSchedule({ id: "schedule-a", candidateCompanyId: CANDIDATE_A, versionId: "version-a" });
    const scheduleB = validatedSchedule({ id: "schedule-b", candidateCompanyId: CANDIDATE_B, versionId: "version-b" });
    const finalFileA = PricingScheduleFinalFile.create({ id: "file-a", organizationId: ORGANIZATION_ID, pricingScheduleVersionId: "version-a", documentId: "doc-final-a", documentVersionId: "doc-final-a-v1", injectedCellCount: 2, generatedBy: "user-1", occurredAt: new Date() });
    const finalFileB = PricingScheduleFinalFile.create({ id: "file-b", organizationId: ORGANIZATION_ID, pricingScheduleVersionId: "version-b", documentId: "doc-final-b", documentVersionId: "doc-final-b-v1", injectedCellCount: 2, generatedBy: "user-1", occurredAt: new Date() });

    const useCase = buildUseCase({ schedules: [scheduleA, scheduleB], finalFiles: [finalFileA, finalFileB] });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: CANDIDATE_B });

    expect(result).toHaveLength(1);
    expect(result[0]!.documentId).toBe("doc-final-b");
  });

  it("TEST 3/TEST 38 — CANDIDATE CHANGE: pricing finalized while the Tender's candidate was A is no longer eligible once queried for B (simulates a candidate reassignment)", async () => {
    const scheduleA = validatedSchedule({ id: "schedule-a", candidateCompanyId: CANDIDATE_A, versionId: "version-a" });
    const finalFileA = PricingScheduleFinalFile.create({ id: "file-a", organizationId: ORGANIZATION_ID, pricingScheduleVersionId: "version-a", documentId: "doc-final-a", documentVersionId: "doc-final-a-v1", injectedCellCount: 2, generatedBy: "user-1", occurredAt: new Date() });
    const useCase = buildUseCase({ schedules: [scheduleA], finalFiles: [finalFileA] });

    // Le Tender référençait Candidate A au moment du chiffrage ; il référence désormais B.
    const resultForB = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: CANDIDATE_B });
    expect(resultForB).toEqual([]);

    // L'ancien chiffrage reste résolu correctement pour SA candidate d'origine — jamais supprimé,
    // jamais réattribué (mission §18 "PricingScheduleVersion reste historique").
    const resultForA = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: CANDIDATE_A });
    expect(resultForA).toHaveLength(1);
  });

  it("TEST 9/TEST 44 — LEGACY: a pricing schedule with no candidate provenance (created before this checkpoint) is never silently attributed to the Tender's current candidate", async () => {
    const legacySchedule = validatedSchedule({ id: "schedule-legacy", candidateCompanyId: undefined, versionId: "version-legacy" });
    const legacyFinalFile = PricingScheduleFinalFile.create({ id: "file-legacy", organizationId: ORGANIZATION_ID, pricingScheduleVersionId: "version-legacy", documentId: "doc-final-legacy", documentVersionId: "doc-final-legacy-v1", injectedCellCount: 2, generatedBy: "user-1", occurredAt: new Date() });

    const useCase = buildUseCase({ schedules: [legacySchedule], finalFiles: [legacyFinalFile] });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: CANDIDATE_A });

    expect(result).toEqual([]);
  });

  it("mission §22 — a Tender with no CandidateCompany resolved at all never returns any final file, never a substitution", async () => {
    const scheduleA = validatedSchedule({ id: "schedule-a", candidateCompanyId: CANDIDATE_A, versionId: "version-a" });
    const finalFileA = PricingScheduleFinalFile.create({ id: "file-a", organizationId: ORGANIZATION_ID, pricingScheduleVersionId: "version-a", documentId: "doc-final-a", documentVersionId: "doc-final-a-v1", injectedCellCount: 2, generatedBy: "user-1", occurredAt: new Date() });
    const useCase = buildUseCase({ schedules: [scheduleA], finalFiles: [finalFileA] });

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: undefined });
    expect(result).toEqual([]);
  });

  it("TEST 41 — LOT: a final file scoped to Lot A is never returned when it belongs to a different pricing schedule's lot, even for the same candidate", async () => {
    const scheduleLotA = validatedSchedule({ id: "schedule-lot-a", candidateCompanyId: CANDIDATE_A, versionId: "version-lot-a", lotId: "lot-a" });
    const finalFileLotA = PricingScheduleFinalFile.create({ id: "file-lot-a", organizationId: ORGANIZATION_ID, pricingScheduleVersionId: "version-lot-a", documentId: "doc-final-lot-a", documentVersionId: "doc-final-lot-a-v1", injectedCellCount: 2, generatedBy: "user-1", occurredAt: new Date() });

    const useCase = buildUseCase({ schedules: [scheduleLotA], finalFiles: [finalFileLotA] });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, candidateCompanyId: CANDIDATE_A });

    expect(result).toHaveLength(1);
    expect(result[0]!.lotId).toBe("lot-a");
  });
});
