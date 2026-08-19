import { beforeEach, describe, expect, it, vi } from "vitest";
import { CandidateIdentitySource } from "../../../candidate-company";
import { ChecklistItem } from "../../../tenders";
import { InMemoryChecklistItemRepository } from "../../../tenders/test-support/fakes";
import { FindChecklistItemDocumentMatchesUseCase } from "./find-checklist-item-document-matches.use-case";

const OCCURRED_AT = new Date("2026-01-01T00:00:00.000Z");
const ORG_ID = "org-1";

function certificationDoc(name: string) {
  return { documentId: `doc-${name}`, name, expiresAt: null, temporalStatus: "VALID" as const };
}

/**
 * Checkpoint 2.1-A6.1 (Candidate SOT — Checklist) — cette suite n'existait pas avant ce checkpoint
 * (`FindChecklistItemDocumentMatchesUseCase` n'avait jamais été testée unitairement). Preuve
 * centrale du checkpoint : pour un Tender moderne (`candidateCompanyId` renseigné), les capacités
 * (certifications/assurances) ne sont JAMAIS lues depuis le profil du CLIENT — jamais une entité
 * juridique différente utilisée comme preuve pour le Candidat réellement rattaché.
 */
describe("FindChecklistItemDocumentMatchesUseCase — Candidate SOT (Checkpoint 2.1-A6.1)", () => {
  let checklistRepository: InMemoryChecklistItemRepository;
  let listTenderDocumentsUseCase: { execute: ReturnType<typeof vi.fn> };
  let getCompanyProfileUseCase: { execute: ReturnType<typeof vi.fn> };
  let resolveCandidateIdentityUseCase: { execute: ReturnType<typeof vi.fn> };
  let listSubcontractorCertificationsUseCase: { execute: ReturnType<typeof vi.fn> };
  let listSubcontractorInsurancesUseCase: { execute: ReturnType<typeof vi.fn> };
  let useCase: FindChecklistItemDocumentMatchesUseCase;

  beforeEach(async () => {
    checklistRepository = new InMemoryChecklistItemRepository();
    await checklistRepository.save(
      ChecklistItem.create({ id: "item-1", organizationId: ORG_ID, tenderId: "tender-1", title: "Certification qualité", type: "CERTIFICATION", occurredAt: OCCURRED_AT }),
    );

    listTenderDocumentsUseCase = { execute: vi.fn(async () => []) };
    // Profil du CLIENT (ClientAccount) — porte "CLIENT-X-CERTIFICATION", jamais attendue pour un
    // Tender moderne (mission A6.1 §35 "test SOT critique").
    getCompanyProfileUseCase = {
      execute: vi.fn(async () => ({
        legalIdentity: null,
        certifications: [certificationDoc("Certification qualité CLIENT-X")],
        insurances: [],
        humanResources: [],
        materialResources: [],
        references: [],
      })),
    };
    resolveCandidateIdentityUseCase = { execute: vi.fn(async () => ({ source: CandidateIdentitySource.None })) };
    listSubcontractorCertificationsUseCase = { execute: vi.fn(async () => []) };
    listSubcontractorInsurancesUseCase = { execute: vi.fn(async () => []) };

    useCase = new FindChecklistItemDocumentMatchesUseCase(
      checklistRepository,
      listTenderDocumentsUseCase as never,
      getCompanyProfileUseCase as never,
      resolveCandidateIdentityUseCase as never,
      listSubcontractorCertificationsUseCase as never,
      listSubcontractorInsurancesUseCase as never,
    );
  });

  const baseQuery = { organizationId: ORG_ID, tenderId: "tender-1", itemId: "item-1", actorId: "user-1", actorRole: "BID_MANAGER" };

  it("BLOQUANT (mission A6.1 §35, test SOT critique) — a Tender with a resolved CandidateCompany NEVER suggests the CLIENT's certifications as evidence", async () => {
    resolveCandidateIdentityUseCase.execute = vi.fn(async () => ({ source: CandidateIdentitySource.CandidateCompany, candidateCompanyId: "candidate-alpha", legalName: "CANDIDATE-ALPHA" }));

    const result = await useCase.execute({ ...baseQuery, clientAccountId: "client-x", candidateCompanyId: "candidate-alpha" });

    expect(getCompanyProfileUseCase.execute).not.toHaveBeenCalled();
    expect(result.candidates.every((c) => !c.label.includes("CLIENT-X"))).toBe(true);
    expect(result.status).toBe("NO_MATCH");
  });

  it("BLOQUANT (mission A6.1 §36, no silent fallback) — even if company-profile would resolve without error, a modern Tender never calls it", async () => {
    resolveCandidateIdentityUseCase.execute = vi.fn(async () => ({ source: CandidateIdentitySource.CandidateCompany, candidateCompanyId: "candidate-alpha", legalName: "CANDIDATE-ALPHA" }));

    await useCase.execute({ ...baseQuery, clientAccountId: "client-x", candidateCompanyId: "candidate-alpha" });

    expect(getCompanyProfileUseCase.execute).not.toHaveBeenCalled();
  });

  it("LEGACY FLOW — a Tender with candidateCompanyId absent keeps resolving capacities from the Client's company-profile exactly as before A6.1", async () => {
    const result = await useCase.execute({ ...baseQuery, clientAccountId: "client-x", candidateCompanyId: undefined });

    expect(getCompanyProfileUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG_ID, clientAccountId: "client-x" }));
    expect(result.candidates.some((c) => c.label.includes("CLIENT-X"))).toBe(true);
  });

  it("resolveCandidateIdentityUseCase is always called with the Tender's own candidateCompanyId, never a value from another Tender/organization (tenant isolation)", async () => {
    await useCase.execute({ ...baseQuery, clientAccountId: "client-x", candidateCompanyId: "candidate-alpha" });

    expect(resolveCandidateIdentityUseCase.execute).toHaveBeenCalledWith({ organizationId: ORG_ID, candidateCompanyId: "candidate-alpha" });
  });

  it("a CandidateCompany that fails to resolve (archived/not found) degrades to source=NONE and behaves like a legacy Tender — never a hard crash, never a silent Client substitution as CANDIDATE identity", async () => {
    resolveCandidateIdentityUseCase.execute = vi.fn(async () => ({ source: CandidateIdentitySource.None }));

    const result = await useCase.execute({ ...baseQuery, clientAccountId: "client-x", candidateCompanyId: "candidate-deleted" });

    expect(getCompanyProfileUseCase.execute).toHaveBeenCalled();
    expect(result.candidates.some((c) => c.label.includes("CLIENT-X"))).toBe(true);
  });

  it("subcontractor-subject items remain entirely unaffected by the Candidate SOT branch (mission A6.1 §16, subject-type untouched)", async () => {
    await checklistRepository.save(
      ChecklistItem.create({
        id: "item-2",
        organizationId: ORG_ID,
        tenderId: "tender-1",
        title: "Assurance du sous-traitant",
        type: "INSURANCE",
        subjectType: "SUBCONTRACTOR",
        subjectSubcontractorProfileId: "sub-1",
        occurredAt: OCCURRED_AT,
      }),
    );
    resolveCandidateIdentityUseCase.execute = vi.fn(async () => ({ source: CandidateIdentitySource.CandidateCompany, candidateCompanyId: "candidate-alpha", legalName: "CANDIDATE-ALPHA" }));
    listSubcontractorInsurancesUseCase.execute = vi.fn(async () => [{ documentId: "doc-sub", type: "DECENNALE", expiresAt: null }]);

    const result = await useCase.execute({ ...baseQuery, itemId: "item-2", clientAccountId: "client-x", candidateCompanyId: "candidate-alpha" });

    expect(listSubcontractorInsurancesUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ subcontractorProfileId: "sub-1" }));
    expect(result.candidates.some((c) => c.documentId === "doc-sub")).toBe(true);
  });
});
