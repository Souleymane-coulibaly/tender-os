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
  /** Checkpoint CCV2-E — capacités de la SOT `CandidateCompany`. Vides par défaut : un candidat
   *  sans capacité doit produire un contexte SANS capacité, jamais un emprunt au profil client. */
  candidateCapabilities?: Partial<{ certifications: unknown[]; insurances: unknown[]; references: unknown[]; humanResources: unknown[]; materialResources: unknown[] }> | undefined;
}): TechnicalMemoSectionContextAssembler {
  const resolveCandidateCapabilitiesUseCase = {
    execute: async () => ({
      source: "CANDIDATE_COMPANY",
      representatives: [],
      insurances: input.candidateCapabilities?.insurances ?? [],
      certifications: input.candidateCapabilities?.certifications ?? [],
      references: input.candidateCapabilities?.references ?? [],
      humanResources: input.candidateCapabilities?.humanResources ?? [],
      materialResources: input.candidateCapabilities?.materialResources ?? [],
      documents: [],
    }),
  };
  const getTenderUseCase = { execute: async () => ({ candidateCompanyId: input.tenderCandidateCompanyId }) };
  const resolveCandidateIdentityUseCase = { execute: async () => input.candidateIdentity };
  const getCandidateCompanyUseCase = {
    execute: async () => {
      if (input.candidateCompany === null || input.candidateCompany === undefined) throw new Error("CandidateCompany not found (test fixture)");
      return { id: input.tenderCandidateCompanyId, sourceClientAccountId: input.candidateCompany.sourceClientAccountId };
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
    getTenderUseCase as never,
    resolveCandidateIdentityUseCase as never,
    resolveCandidateCapabilitiesUseCase as never,
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

  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.2 — CONTRAT INVERSÉ. Ce test encodait le repli que la mission
   * supprime : sans entreprise candidate, l'identité ou les capacités du CLIENT commercial étaient
   * servies comme si elles étaient celles du candidat. La MOITIÉ essentielle de l'ancienne règle
   * survit : le client n'est JAMAIS présenté comme le candidat. Ce qui change, c'est qu'on refuse
   * désormais au lieu de substituer.
   */
  it("BLOQUANT (CCV2-G.2) — sans entreprise candidate, l'assemblage du contexte est REFUSÉ au lieu de servir le client", async () => {
    const assembler = buildAssembler({
      tenderCandidateCompanyId: undefined,
      candidateIdentity: { source: CandidateIdentitySource.None },
      profiles: { "client-1": emptyProfile({ legalIdentity: { legalName: "Client Legacy Legal SARL", tradeName: "Client Legacy Legal SARL", siretPrincipal: "35600000000048" } }) },
    });
  
    await expect(
      assembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-1"), section }),
    ).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_REQUIRED" });
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

  it("Checkpoint CCV2-E (remplace TEST LEGACY CAPABILITY FALLBACK §52) — les capacités proviennent de la SOT CandidateCompany elle-même, plus d'un ClientAccount migré, et jamais du Client du Tender", async () => {
    const assembler = buildAssembler({
      tenderCandidateCompanyId: "candidate-alpha",
      candidateIdentity: CANDIDATE_ALPHA_IDENTITY,
      candidateCompany: { sourceClientAccountId: "alpha-legacy-client" },
      // Capacités réellement portées par la CandidateCompany (satellites CCV2-B/C).
      candidateCapabilities: {
        certifications: [{ id: "cert-alpha", name: "ISO-ALPHA", temporalStatus: "NO_EXPIRY" }],
        references: [{ id: "ref-alpha", projectName: "Hôpital A", sector: "Santé" }],
      },
      profiles: {
        // Le Client du Tender ET l'ancien ClientAccount d'origine portent des données PIÈGES :
        // aucune des deux ne doit apparaître, y compris celle du `sourceClientAccountId`, dont le
        // repli a été supprimé par CCV2-E.
        "client-x": emptyProfile({ certifications: [{ id: "cert-client-x", name: "ISO-CLIENT-X" }] }),
        "alpha-legacy-client": emptyProfile({ certifications: [{ id: "cert-legacy", name: "ISO-LEGACY-PIEGE" }] }),
      },
    });

    const context = await assembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-x"), section });

    expect(context.contextBlock).toContain("ALPHA-SERVICES-SAS");
    expect(context.contextBlock).toContain("ISO-ALPHA");
    expect(context.contextBlock).toContain("Hôpital A");
    expect(context.contextBlock).not.toContain("ISO-CLIENT-X");
    expect(context.contextBlock).not.toContain("ISO-LEGACY-PIEGE");
    // Plus aucun qualificatif de repli : la donnée n'est plus empruntée, elle appartient au candidat.
    expect(context.contextBlock).not.toContain("fallback legacy");
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

  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.2 — CONTRAT INVERSÉ. Ce test encodait le repli que la mission
   * supprime : sans entreprise candidate, les capacités du CLIENT commercial étaient servies comme
   * si elles étaient celles du candidat. La MOITIÉ essentielle de l'ancienne règle survit : le
   * client n'est JAMAIS présenté comme le candidat. Ce qui change, c'est le refus au lieu de la
   * substitution.
   */
  it("BLOQUANT (CCV2-G.2) — sans entreprise candidate, aucune capacité du client n'est servie : l'assemblage est refusé", async () => {
    const assembler = buildAssembler({
      tenderCandidateCompanyId: undefined,
      candidateIdentity: { source: CandidateIdentitySource.None },
      profiles: { "client-1": emptyProfile({}) },
    });
  
    await expect(
      assembler.assemble({ organizationId: ORG_ID, actorId: "user-1", actorRole: "OWNER", memo: buildMemo("client-1"), section }),
    ).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_REQUIRED" });
  });

  it("TEST MULTI-CANDIDATE (mission §54, source CandidateCompany depuis CCV2-E) — two Tenders resolving two different CandidateCompanies never cross-contaminate each other's context", async () => {
    const alphaAssembler = buildAssembler({
      tenderCandidateCompanyId: "candidate-alpha",
      candidateIdentity: CANDIDATE_ALPHA_IDENTITY,
      candidateCompany: { sourceClientAccountId: "alpha-legacy-client" },
      // Checkpoint CCV2-E — capacités portées par la CandidateCompany elle-même.
      candidateCapabilities: {
        certifications: [{ id: "cert-alpha", name: "ISO-ALPHA", temporalStatus: "NO_EXPIRY" }],
        references: [{ id: "ref-alpha", projectName: "Hôpital A" }],
      },
    });
    const betaAssembler = buildAssembler({
      tenderCandidateCompanyId: "candidate-beta",
      candidateIdentity: { ...CANDIDATE_ALPHA_IDENTITY, candidateCompanyId: "candidate-beta", displayName: "BETA-SERVICES-SAS", legalName: "BETA-SERVICES-SAS" },
      candidateCompany: { sourceClientAccountId: "beta-legacy-client" },
      candidateCapabilities: {
        certifications: [{ id: "cert-beta", name: "ISO-BETA", temporalStatus: "NO_EXPIRY" }],
        references: [{ id: "ref-beta", projectName: "Aéroport B" }],
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
    // Checkpoint CCV2-E — les capacités viennent désormais du résolveur CANDIDATE, plus du repli
    // par `sourceClientAccountId` (supprimé). La propriété prouvée est INCHANGÉE et même renforcée :
    // deux entreprises candidates distinctes ne partagent jamais leurs capacités, et la source est
    // maintenant leur propre SOT au lieu d'un profil client emprunté.
    const capabilitiesByCandidate: Record<string, unknown> = {
      "candidate-alpha": { source: "CANDIDATE_COMPANY", representatives: [], insurances: [], certifications: [{ id: "cert-alpha", name: "ISO-ALPHA", temporalStatus: "NO_EXPIRY" }], references: [], humanResources: [], materialResources: [], documents: [] },
      "candidate-beta": { source: "CANDIDATE_COMPANY", representatives: [], insurances: [], certifications: [{ id: "cert-beta", name: "ISO-BETA", temporalStatus: "NO_EXPIRY" }], references: [], humanResources: [], materialResources: [], documents: [] },
    };

    const assembler = new TechnicalMemoSectionContextAssembler(
      new InMemoryTechnicalMemoSectionRequirementRepository(),
      EMPTY_FINDINGS as never,
      EMPTY_FINDINGS as never,
      EMPTY_FINDINGS as never,
      NEVER_CALLED_EFFECTIVE_ANALYSIS as never,
      EMPTY_KNOWLEDGE_SEARCH as never,
      { execute: async () => ({}) } as never,
      // Le profil du CLIENT est délibérément vide : en NEW FLOW il n'est jamais consulté, et le
      // laisser vide garantit qu'aucune assertion ci-dessous ne peut réussir grâce à lui.
      { execute: async () => ({ candidateCompanyId: currentCandidateCompanyId }) } as never,
      { execute: async () => identities[currentCandidateCompanyId] } as never,
      { execute: async () => capabilitiesByCandidate[currentCandidateCompanyId] } as never,
      { execute: async () => ({ sourceClientAccountId: undefined }) } as never,
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
