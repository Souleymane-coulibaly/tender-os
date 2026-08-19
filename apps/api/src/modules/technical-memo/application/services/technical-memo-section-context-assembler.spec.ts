import { describe, expect, it } from "vitest";
import { CandidateIdentitySource } from "../../../candidate-company";
import { TechnicalMemoStatus, TechnicalMemoTemplateOrigin } from "../../domain/enums";
import { TechnicalMemo } from "../../domain/technical-memo.aggregate";
import { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";
import { InMemoryTechnicalMemoSectionRequirementRepository } from "../../test-support/fakes";
import { TechnicalMemoSectionContextAssembler } from "./technical-memo-section-context-assembler";

const OCCURRED_AT = new Date("2026-01-01T00:00:00.000Z");
const ORG_ID = "org-1";
const TENDER_ID = "tender-1";

function buildMemo(clientAccountId: string): TechnicalMemo {
  return TechnicalMemo.rehydrate({
    id: "memo-1",
    organizationId: ORG_ID,
    tenderId: TENDER_ID,
    clientAccountId,
    templateOrigin: TechnicalMemoTemplateOrigin.TenderOsSystem,
    status: TechnicalMemoStatus.Draft,
    createdBy: "user-1",
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
  });
}

const section = TechnicalMemoSection.create({
  id: "section-1",
  organizationId: ORG_ID,
  technicalMemoId: "memo-1",
  sectionKey: "0-methodologie",
  title: "Méthodologie",
  order: 0,
  level: 1,
  createdBy: "user-1",
  occurredAt: OCCURRED_AT,
});

const EMPTY_FINDINGS = { execute: async () => ({ items: [] }) };
const EMPTY_KNOWLEDGE_SEARCH = { execute: async () => ({ items: [] }) };
// Checkpoint 2.1-P2.1-FIX-D — aucun test de ce fichier n'ajoute de lien
// `TechnicalMemoSectionRequirement` (fixture `InMemoryTechnicalMemoSectionRequirementRepository`
// toujours vide) : `buildFindingsBlock` court-circuite donc TOUJOURS avant d'appeler
// `GetEffectiveTenderAnalysisSummaryUseCase` (mission §12/§13 "jamais une dépendance fabriquée") —
// un throw explicite ici prouve que ce chemin n'est jamais emprunté par erreur.
const NEVER_CALLED_EFFECTIVE_ANALYSIS = { execute: async () => { throw new Error("should never be called — no section in this fixture has a DCE requirement link"); } };

type ProfileFixture = {
  legalIdentity?: Record<string, unknown> | null;
  humanResources?: unknown[];
  materialResources?: unknown[];
  certifications?: unknown[];
  insurances?: unknown[];
  references?: { id: string; projectName: string; sector?: string | undefined; description?: string | undefined; results?: string | undefined }[];
};

function emptyProfile(overrides: ProfileFixture = {}): Required<ProfileFixture> {
  return {
    legalIdentity: overrides.legalIdentity ?? null,
    humanResources: overrides.humanResources ?? [],
    materialResources: overrides.materialResources ?? [],
    certifications: overrides.certifications ?? [],
    insurances: overrides.insurances ?? [],
    references: overrides.references ?? [],
  };
}

/**
 * Checkpoint 2.1-A6.3 — `buildAssembler` reproduit fidèlement les DEUX résolveurs distincts consommés
 * par `buildCandidateBlock` : `getCandidateCompanyUseCase` (identité + `sourceClientAccountId`,
 * jamais confondu avec un `clientAccountId` métier) et `getCompanyProfileUseCase` (un profil PAR
 * `clientAccountId`, jamais une résolution implicite). `profiles` simule plusieurs entreprises
 * distinctes réellement présentes en base (CLIENT-X, LEGACY-Z, le legacy propre à un Candidate) —
 * un `clientAccountId` absent de la map lève une erreur (comme un profil introuvable/inaccessible
 * réel), jamais une valeur vide fabriquée.
 */
function buildAssembler(input: {
  tenderCandidateCompanyId?: string | undefined;
  candidateIdentity: unknown;
  /** `null` = CandidateCompany introuvable (course bénigne) ; objet = trouvée, avec ou sans lien legacy. */
  candidateCompany?: { sourceClientAccountId?: string | undefined } | null;
  profiles?: Record<string, ProfileFixture>;
}): TechnicalMemoSectionContextAssembler {
  const profiles = input.profiles ?? {};
  const getTenderUseCase = { execute: async () => ({ candidateCompanyId: input.tenderCandidateCompanyId }) };
  const resolveCandidateIdentityUseCase = { execute: async () => input.candidateIdentity };
  const getCandidateCompanyUseCase = {
    execute: async () => {
      if (input.candidateCompany === null || input.candidateCompany === undefined) throw new Error("CandidateCompany not found (test fixture)");
      return { id: input.tenderCandidateCompanyId, sourceClientAccountId: input.candidateCompany.sourceClientAccountId };
    },
  };
  const getCompanyProfileUseCase = {
    execute: async (query: { clientAccountId: string }) => {
      const fixture = profiles[query.clientAccountId];
      if (!fixture) throw new Error(`No company-profile fixture for clientAccountId=${query.clientAccountId} (test fixture)`);
      return emptyProfile(fixture);
    },
  };

  return new TechnicalMemoSectionContextAssembler(
    new InMemoryTechnicalMemoSectionRequirementRepository(),
    EMPTY_FINDINGS as never,
    EMPTY_FINDINGS as never,
    EMPTY_FINDINGS as never,
    NEVER_CALLED_EFFECTIVE_ANALYSIS as never,
    EMPTY_KNOWLEDGE_SEARCH as never,
    { execute: async () => ({}) } as never,
    getCompanyProfileUseCase as never,
    getTenderUseCase as never,
    resolveCandidateIdentityUseCase as never,
    getCandidateCompanyUseCase as never,
  );
}

const CANDIDATE_ALPHA_IDENTITY = {
  source: CandidateIdentitySource.CandidateCompany,
  candidateCompanyId: "candidate-alpha",
  displayName: "ALPHA-SERVICES-SAS",
  legalName: "ALPHA-SERVICES-SAS",
  siren: "789000000",
  legalForm: "SAS",
  vatNumber: "FR12789000000",
  principalEstablishment: { siret: "78900000000029", addressLine: "9 avenue du Candidat", postalCode: "69000", city: "Lyon", country: "FR" },
};

describe("TechnicalMemoSectionContextAssembler — candidate identity NEW/LEGACY FLOW", () => {
  it("NEW FLOW — Tender.candidateCompanyId set → identity comes from CandidateCompany, NEVER from the legacy legalIdentity, even when they differ", async () => {
    const assembler = buildAssembler({
      tenderCandidateCompanyId: "candidate-alpha",
      candidateIdentity: CANDIDATE_ALPHA_IDENTITY,
      candidateCompany: {},
      profiles: { "client-1": emptyProfile({ legalIdentity: { legalName: "Client Legacy Legal SARL", tradeName: "Client Legacy Legal SARL", siretPrincipal: "35600000000048" } }) },
    });

    const context = await assembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-1"), section });

    expect(context.contextBlock).toContain("ALPHA-SERVICES-SAS");
    expect(context.contextBlock).toContain("78900000000029");
    expect(context.contextBlock).not.toContain("Client Legacy Legal SARL");
  });

  it("LEGACY FLOW — Tender.candidateCompanyId absent → identity falls back entirely to company-profile.legalIdentity, exactly as before A4", async () => {
    const assembler = buildAssembler({
      tenderCandidateCompanyId: undefined,
      candidateIdentity: { source: CandidateIdentitySource.None },
      profiles: { "client-1": emptyProfile({ legalIdentity: { legalName: "Client Legacy Legal SARL", tradeName: "Client Legacy Legal SARL", siretPrincipal: "35600000000048" } }) },
    });

    const context = await assembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-1"), section });

    expect(context.contextBlock).toContain("Client Legacy Legal SARL");
    expect(context.contextBlock).not.toContain("ALPHA-SERVICES");
  });
});

/**
 * Checkpoint 2.1-A6.3 — le cœur du correctif : les CAPACITÉS (moyens humains/matériels,
 * certifications, assurances, références) ne doivent JAMAIS provenir de `memo.clientAccountId` (le
 * Client commercial du Tender) une fois qu'une CandidateCompany distincte est résolue. Seul
 * `CandidateCompany.sourceClientAccountId` (le ClientAccount d'origine de CETTE Candidate, migration
 * A2) peut servir de fallback, explicitement étiqueté ; son absence dégrade en capacités absentes,
 * jamais une substitution par les données du Client.
 */
describe("TechnicalMemoSectionContextAssembler — candidate CAPABILITIES (Checkpoint 2.1-A6.3)", () => {
  it("BLOQUANT (mission §6/§14, CLIENT ≠ CANDIDATE) — CLIENT-X's certifications/references never leak into ALPHA-SERVICES's candidate block, even though CLIENT-X is the Tender's clientAccountId", async () => {
    const assembler = buildAssembler({
      tenderCandidateCompanyId: "candidate-alpha",
      candidateIdentity: CANDIDATE_ALPHA_IDENTITY,
      // ALPHA was created directly (mission A1 post-A6.3 world), never migrated from a ClientAccount.
      candidateCompany: { sourceClientAccountId: undefined },
      profiles: {
        "client-x": emptyProfile({
          certifications: [{ id: "cert-client-x", name: "ISO-CLIENT-X" }],
          references: [{ id: "ref-client-x", projectName: "Hôpital de CLIENT-X", sector: "Santé" }],
        }),
      },
    });

    const context = await assembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-x"), section });

    expect(context.contextBlock).toContain("ALPHA-SERVICES-SAS");
    expect(context.contextBlock).not.toContain("ISO-CLIENT-X");
    expect(context.contextBlock).not.toContain("Hôpital de CLIENT-X");
    expect(context.contextBlock).not.toContain("Certifications");
    expect(context.contextBlock).not.toContain("Référence");
  });

  it("TEST LEGACY CAPABILITY FALLBACK (mission §52) — a CandidateCompany migrated from its OWN ClientAccount (sourceClientAccountId) surfaces that ClientAccount's real capacities, explicitly labeled as a legacy fallback, never as unqualified Candidate data", async () => {
    const assembler = buildAssembler({
      tenderCandidateCompanyId: "candidate-alpha",
      candidateIdentity: CANDIDATE_ALPHA_IDENTITY,
      candidateCompany: { sourceClientAccountId: "alpha-legacy-client" },
      profiles: {
        // The Tender's own Client — must never be consulted for capacities here.
        "client-x": emptyProfile({ certifications: [{ id: "cert-client-x", name: "ISO-CLIENT-X" }] }),
        // ALPHA's own migrated legacy profile — the legitimate fallback source.
        "alpha-legacy-client": emptyProfile({
          certifications: [{ id: "cert-alpha", name: "ISO-ALPHA" }],
          references: [{ id: "ref-alpha", projectName: "Hôpital A", sector: "Santé" }],
        }),
      },
    });

    const context = await assembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-x"), section });

    expect(context.contextBlock).toContain("ALPHA-SERVICES-SAS");
    expect(context.contextBlock).toContain("ISO-ALPHA");
    expect(context.contextBlock).toContain("Hôpital A");
    expect(context.contextBlock).not.toContain("ISO-CLIENT-X");
    // Mission §15 — la source doit être explicite, jamais un mélange ambigu.
    expect(context.contextBlock).toContain("fallback legacy");
  });

  it("TEST NO LEGACY PROFILE (mission §53) — a CandidateCompany with no sourceClientAccountId and no company-profile at all still yields the Candidate identity; missing capabilities are absent, never a Client substitution", async () => {
    const assembler = buildAssembler({
      tenderCandidateCompanyId: "candidate-alpha",
      candidateIdentity: CANDIDATE_ALPHA_IDENTITY,
      candidateCompany: { sourceClientAccountId: undefined },
      profiles: {},
    });

    const context = await assembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-x"), section });

    expect(context.contextBlock).toContain("ALPHA-SERVICES-SAS");
    expect(context.contextBlock).not.toContain("Certifications");
    expect(context.contextBlock).not.toContain("Référence");
  });

  it("a candidateCompanyId that fails to resolve at the GetCandidateCompanyUseCase level (archived/deleted race) degrades to absent capacities, never a hard crash", async () => {
    const assembler = buildAssembler({
      tenderCandidateCompanyId: "candidate-alpha",
      candidateIdentity: CANDIDATE_ALPHA_IDENTITY,
      candidateCompany: null,
      profiles: { "client-x": emptyProfile({ certifications: [{ id: "cert-client-x", name: "ISO-CLIENT-X" }] }) },
    });

    const context = await assembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-x"), section });

    expect(context.contextBlock).toContain("ALPHA-SERVICES-SAS");
    expect(context.contextBlock).not.toContain("ISO-CLIENT-X");
  });

  it("LEGACY FLOW capacities (mission §53 baseline) — unchanged since A4: no CandidateCompany at all, capacities come from company-profile via memo.clientAccountId exactly as before A6.3", async () => {
    const assembler = buildAssembler({
      tenderCandidateCompanyId: undefined,
      candidateIdentity: { source: CandidateIdentitySource.None },
      profiles: { "client-1": emptyProfile({ certifications: [{ id: "cert-legacy", name: "ISO-LEGACY" }] }) },
    });

    const context = await assembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-1"), section });

    expect(context.contextBlock).toContain("ISO-LEGACY");
    expect(context.contextBlock).not.toContain("fallback legacy");
  });

  it("TEST MULTI-CANDIDATE (mission §54) — two Tenders resolving two different CandidateCompanies (with their own legacy capacities) never cross-contaminate each other's context", async () => {
    const alphaAssembler = buildAssembler({
      tenderCandidateCompanyId: "candidate-alpha",
      candidateIdentity: CANDIDATE_ALPHA_IDENTITY,
      candidateCompany: { sourceClientAccountId: "alpha-legacy-client" },
      profiles: {
        "alpha-legacy-client": emptyProfile({ certifications: [{ id: "cert-alpha", name: "ISO-ALPHA" }], references: [{ id: "ref-alpha", projectName: "Hôpital A" }] }),
        "beta-legacy-client": emptyProfile({ certifications: [{ id: "cert-beta", name: "ISO-BETA" }], references: [{ id: "ref-beta", projectName: "Aéroport B" }] }),
      },
    });
    const betaAssembler = buildAssembler({
      tenderCandidateCompanyId: "candidate-beta",
      candidateIdentity: { ...CANDIDATE_ALPHA_IDENTITY, candidateCompanyId: "candidate-beta", displayName: "BETA-SERVICES-SAS", legalName: "BETA-SERVICES-SAS" },
      candidateCompany: { sourceClientAccountId: "beta-legacy-client" },
      profiles: {
        "alpha-legacy-client": emptyProfile({ certifications: [{ id: "cert-alpha", name: "ISO-ALPHA" }], references: [{ id: "ref-alpha", projectName: "Hôpital A" }] }),
        "beta-legacy-client": emptyProfile({ certifications: [{ id: "cert-beta", name: "ISO-BETA" }], references: [{ id: "ref-beta", projectName: "Aéroport B" }] }),
      },
    });

    const alphaContext = await alphaAssembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-1"), section });
    const betaContext = await betaAssembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-1"), section });

    expect(alphaContext.contextBlock).toContain("ISO-ALPHA");
    expect(alphaContext.contextBlock).toContain("Hôpital A");
    expect(alphaContext.contextBlock).not.toContain("ISO-BETA");
    expect(alphaContext.contextBlock).not.toContain("Aéroport B");

    expect(betaContext.contextBlock).toContain("ISO-BETA");
    expect(betaContext.contextBlock).toContain("Aéroport B");
    expect(betaContext.contextBlock).not.toContain("ISO-ALPHA");
    expect(betaContext.contextBlock).not.toContain("Hôpital A");
  });

  it("TEST REGENERATION (mission §27/§56) — the SAME assembler instance, called again after the Tender's candidate changed from Alpha to Beta, uses Beta — never a stale cached Alpha context", async () => {
    let currentCandidateCompanyId = "candidate-alpha";
    const identities: Record<string, unknown> = {
      "candidate-alpha": CANDIDATE_ALPHA_IDENTITY,
      "candidate-beta": { ...CANDIDATE_ALPHA_IDENTITY, candidateCompanyId: "candidate-beta", displayName: "BETA-SERVICES-SAS", legalName: "BETA-SERVICES-SAS" },
    };
    const sourceClientAccountIds: Record<string, string> = { "candidate-alpha": "alpha-legacy-client", "candidate-beta": "beta-legacy-client" };
    const profiles: Record<string, ProfileFixture> = {
      "alpha-legacy-client": emptyProfile({ certifications: [{ id: "cert-alpha", name: "ISO-ALPHA" }] }),
      "beta-legacy-client": emptyProfile({ certifications: [{ id: "cert-beta", name: "ISO-BETA" }] }),
    };

    const assembler = new TechnicalMemoSectionContextAssembler(
      new InMemoryTechnicalMemoSectionRequirementRepository(),
      EMPTY_FINDINGS as never,
      EMPTY_FINDINGS as never,
      EMPTY_FINDINGS as never,
      NEVER_CALLED_EFFECTIVE_ANALYSIS as never,
      EMPTY_KNOWLEDGE_SEARCH as never,
      { execute: async () => ({}) } as never,
      { execute: async (query: { clientAccountId: string }) => emptyProfile(profiles[query.clientAccountId]) } as never,
      { execute: async () => ({ candidateCompanyId: currentCandidateCompanyId }) } as never,
      { execute: async () => identities[currentCandidateCompanyId] } as never,
      { execute: async () => ({ sourceClientAccountId: sourceClientAccountIds[currentCandidateCompanyId] }) } as never,
    );

    const firstGeneration = await assembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-1"), section });
    expect(firstGeneration.contextBlock).toContain("ALPHA-SERVICES-SAS");
    expect(firstGeneration.contextBlock).toContain("ISO-ALPHA");

    currentCandidateCompanyId = "candidate-beta";
    const regeneration = await assembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-1"), section });

    expect(regeneration.contextBlock).toContain("BETA-SERVICES-SAS");
    expect(regeneration.contextBlock).toContain("ISO-BETA");
    expect(regeneration.contextBlock).not.toContain("ALPHA-SERVICES-SAS");
    expect(regeneration.contextBlock).not.toContain("ISO-ALPHA");
  });
});
