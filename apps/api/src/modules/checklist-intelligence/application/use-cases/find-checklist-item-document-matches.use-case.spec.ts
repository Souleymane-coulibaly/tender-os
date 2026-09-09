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
      resolveCandidateIdentityUseCase as never,
      // CCV2-E — résolveur de capacités candidate. Ce double retourne délibérément des collections
      // VIDES : ces tests unitaires couvrent le LEGACY FLOW, et un candidat sans capacité doit
      // produire NO_MATCH, jamais un emprunt au profil du client.
      { execute: async () => ({ source: "NONE", representatives: [], insurances: [], certifications: [], references: [], humanResources: [], materialResources: [], documents: [] }) } as never,
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

  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.2 — CONTRAT INVERSÉ. Ce test encodait le repli que la mission
   * supprime : sans entreprise candidate, les capacités du CLIENT commercial étaient servies comme
   * si elles étaient celles du candidat. La MOITIÉ essentielle de l'ancienne règle survit : le
   * client n'est JAMAIS présenté comme le candidat. Ce qui change, c'est le refus au lieu de la
   * substitution.
   */
  it("BLOQUANT (CCV2-G.2) — un item dont le SUJET est le candidat est refusé sans entreprise candidate, et le profil du client n'est jamais lu", async () => {
    await expect(
      useCase.execute({ ...baseQuery, clientAccountId: "client-x", candidateCompanyId: undefined }),
    ).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_REQUIRED" });
  
    expect(getCompanyProfileUseCase.execute).not.toHaveBeenCalled();
  });

  it("resolveCandidateIdentityUseCase is always called with the Tender's own candidateCompanyId, never a value from another Tender/organization (tenant isolation)", async () => {
    await useCase.execute({ ...baseQuery, clientAccountId: "client-x", candidateCompanyId: "candidate-alpha" });

    expect(resolveCandidateIdentityUseCase.execute).toHaveBeenCalledWith({ organizationId: ORG_ID, candidateCompanyId: "candidate-alpha" });
  });

  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.2 — CONTRAT INVERSÉ. Ce test encodait le repli que la mission
   * supprime : sans entreprise candidate, les capacités du CLIENT commercial étaient servies comme
   * si elles étaient celles du candidat. La MOITIÉ essentielle de l'ancienne règle survit : le
   * client n'est JAMAIS présenté comme le candidat. Ce qui change, c'est le refus au lieu de la
   * substitution.
   */
  it("BLOQUANT (CCV2-G.2) — une entreprise candidate irrésolvable ne plante pas et ne substitue JAMAIS le client", async () => {
    resolveCandidateIdentityUseCase.execute = vi.fn(async () => ({ source: CandidateIdentitySource.None }));
  
    // Le Tender PORTE un candidat : la résolution n'est donc pas refusée d'emblée. Ce qui est prouvé
    // ici est l'absence de bascule vers le profil du client.
    const result = await useCase.execute({ ...baseQuery, clientAccountId: "client-x", candidateCompanyId: "candidate-archived" });
  
    expect(getCompanyProfileUseCase.execute).not.toHaveBeenCalled();
    expect(result.candidates.some((c) => c.label.includes("CLIENT-X"))).toBe(false);
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
