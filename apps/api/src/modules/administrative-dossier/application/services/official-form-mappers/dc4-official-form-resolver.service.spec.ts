import { describe, expect, it } from "vitest";
import { CandidateIdentitySource } from "../../../../candidate-company";
import { AdministrativeFormFieldStatus } from "../../../domain/administrative-form-field-status";
import { FormFieldSource } from "../../../domain/form-field-source";
import { Dc4OfficialFormResolver } from "./dc4-official-form-resolver.service";

const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const DECLARATION_ID = "declaration-1";

/** ClientAccount X — LEGACY, volontairement différent du candidat Y (mission §7 "CLIENT ≠ CANDIDATE TEST"). */

/** CandidateCompany Y — NEW FLOW, jamais confondue avec X ni avec le sous-traitant Z. */
const CANDIDATE_Y_IDENTITY = {
  source: CandidateIdentitySource.CandidateCompany,
  candidateCompanyId: "candidate-y",
  displayName: "Beta Services",
  legalName: "Beta Services SARL",
  siren: "44455566600",
  legalForm: "SARL",
  vatNumber: "FR99444555666",
  principalEstablishment: { siret: "44455566600029", addressLine: "9 avenue du Candidat", postalCode: "69000", city: "Lyon", country: "FR" },
};

/** Sous-traitant Z — troisième identité, distincte de X et Y, jamais confondue avec le titulaire (mission A4 §16). */
const DECLARATION = {
  tenderId: TENDER_ID,
  subcontractorProfileId: undefined as string | undefined,
  subcontractorName: "Zeta Sous-traitance",
  subcontractorLegalIdentifier: "55566677700022",
  servicesDescription: "Travaux de finition",
  amountValue: 10000,
  amountCurrency: "EUR",
  durationMonths: 6,
};

function buildResolver(input: { tenderCandidateCompanyId: string | undefined; candidateIdentity: unknown; candidateRepresentatives?: unknown[] | undefined }): Dc4OfficialFormResolver {
  const declarationRepository = { findById: async () => DECLARATION };
  const getTenderUseCase = { execute: async () => ({ buyerName: "Ville de Test", title: "Marché de test", clientAccountId: "client-x", candidateCompanyId: input.tenderCandidateCompanyId }) };
  const getSubcontractorProfileUseCase = { execute: async () => { throw new Error("no subcontractorProfileId on this declaration (test fixture)"); } };
  const resolveCandidateIdentityUseCase = { execute: async () => input.candidateIdentity };
  /** Checkpoint CCV2-E — capacités candidate (représentants). Vides par défaut : les contacts
   *  restent alors MISSING comme avant, aucune assertion existante ne peut réussir grâce à une
   *  donnée fabriquée. */
  const resolveCandidateCapabilitiesUseCase = {
    execute: async () => ({
      source: "CANDIDATE_COMPANY",
      representatives: input.candidateRepresentatives ?? [],
      insurances: [], certifications: [], references: [], humanResources: [], materialResources: [], documents: [],
    }),
  };

  return new Dc4OfficialFormResolver(declarationRepository as never, getTenderUseCase as never, getSubcontractorProfileUseCase as never, resolveCandidateIdentityUseCase as never, resolveCandidateCapabilitiesUseCase as never);
}

/** Checkpoint TENDEROS-2.1-P2.2-F3, mission §7/§37/§47 — `titulaire.*` (le candidat lui-même, celui
 *  qui sous-traite) suit la même discipline NEW/LEGACY FLOW que DC1/DC2 ; `subcontractor.*` reste
 *  une TROISIÈME identité (Sous-traitant Z), jamais dérivée de X ni de Y (mission A4 §16). */
describe("Dc4OfficialFormResolver — CLIENT ≠ CANDIDATE (Checkpoint TENDEROS-2.1-P2.2-F3)", () => {
  it("NEW FLOW — titulaire.* resolves from CandidateCompany Y, NEVER from ClientAccount X's legalIdentity, subcontractor.* stays Z's own data", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: "candidate-y", candidateIdentity: CANDIDATE_Y_IDENTITY });

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", subcontractorDeclarationId: DECLARATION_ID });

    expect(result.data["titulaire.tradeName"]).toBe("Beta Services");
    expect(result.data["titulaire.siret"]).toBe("44455566600029");
    expect(result.data["subcontractor.tradeName"]).toBe("Zeta Sous-traitance");
    expect(result.data["subcontractor.siret"]).toBe("55566677700022");
    // Neither X's nor the subcontractor's identity ever substitutes for the titulaire's.
    expect(Object.values(result.data)).not.toContain("ACME Consulting");
    expect(Object.values(result.data)).not.toContain("11122233300011");
    expect(result.readiness.fields.find((f) => f.fieldKey === "titulaire.tradeName")?.source).toBe(FormFieldSource.CandidateCompanyProfile);
    expect(result.readiness.fields.find((f) => f.fieldKey === "subcontractor.tradeName")?.source).toBe(FormFieldSource.Subcontractor);
  });

  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.2 — CONTRAT INVERSÉ. Ce test encodait le repli que la mission
   * supprime : sans entreprise candidate, l'identité ou les capacités du CLIENT commercial étaient
   * servies comme si elles étaient celles du candidat. La MOITIÉ essentielle de l'ancienne règle
   * survit : le client n'est JAMAIS présenté comme le candidat. Ce qui change, c'est qu'on refuse
   * désormais au lieu de substituer.
   */
  it("BLOQUANT (CCV2-G.2) — sans entreprise candidate, la résolution du titulaire est REFUSÉE au lieu de servir le client", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: undefined, candidateIdentity: { source: CandidateIdentitySource.None } });
  
    await expect(resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", subcontractorDeclarationId: DECLARATION_ID })).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_REQUIRED" });
  });

  /** Checkpoint TENDEROS-2.1-P2.2-F3.1 (correctif audit Codex P1). */
  it("P1 FIX — NEW FLOW: titulaire.email/phone stay MISSING, NEVER borrowed from ClientAccount X's legalIdentity", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: "candidate-y", candidateIdentity: CANDIDATE_Y_IDENTITY });

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", subcontractorDeclarationId: DECLARATION_ID });

    expect(result.data["titulaire.email"]).toBeUndefined();
    expect(result.data["titulaire.phone"]).toBeUndefined();
    expect(Object.values(result.data)).not.toContain("contact@acme-consulting.fr");
    expect(Object.values(result.data)).not.toContain("0100000000");
    expect(result.readiness.fields.find((f) => f.fieldKey === "titulaire.email")?.status).toBe(AdministrativeFormFieldStatus.Missing);
    // Checkpoint CCV2-E — sans représentant porteur, le champ reste MISSING : aucune valeur n'est
    // fabriquée. Seule la SOURCE devient `CandidateCompanyProfile`, ce qui indique d'où il DOIT
    // venir au lieu de ne rien indiquer.
  });

  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.2 — CONTRAT INVERSÉ. Ce test encodait le repli que la mission
   * supprime : sans entreprise candidate, l'identité ou les capacités du CLIENT commercial étaient
   * servies comme si elles étaient celles du candidat. La MOITIÉ essentielle de l'ancienne règle
   * survit : le client n'est JAMAIS présenté comme le candidat. Ce qui change, c'est qu'on refuse
   * désormais au lieu de substituer.
   */
  it("BLOQUANT (CCV2-G.2) — sans entreprise candidate, le contact du client n'est JAMAIS servi comme celui du titulaire", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: undefined, candidateIdentity: { source: CandidateIdentitySource.None } });
  
    await expect(resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", subcontractorDeclarationId: DECLARATION_ID })).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_REQUIRED" });
  });

  it("Checkpoint CCV2-E — titulaire.email/phone viennent des REPRÉSENTANTS du candidat, jamais du client, et le DC4 A→B ne conserve aucune identité A", async () => {
    const resolverA = buildResolver({
      tenderCandidateCompanyId: "candidate-y",
      candidateIdentity: CANDIDATE_Y_IDENTITY,
      candidateRepresentatives: [
        { firstName: "Sig", lastName: "Nataire", type: "SIGNATORY", email: "sig@candidate-y.test", phone: null },
        { firstName: "Ada", lastName: "Admin", type: "ADMINISTRATIVE_CONTACT", email: "admin@candidate-y.test", phone: "+33111111111" },
      ],
    });
    const a = await resolverA.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", subcontractorDeclarationId: DECLARATION_ID });

    // Le contact administratif prime sur le signataire — ordre explicite, jamais « le premier ».
    expect(a.data["titulaire.email"]).toBe("admin@candidate-y.test");
    expect(a.data["titulaire.phone"]).toBe("+33111111111");
    expect(JSON.stringify(a)).not.toContain("contact@acme-consulting.fr");

    // Bascule vers un AUTRE candidat : le DC4 recalculé ne porte plus rien de A.
    const resolverB = buildResolver({
      tenderCandidateCompanyId: "candidate-z",
      candidateIdentity: { ...CANDIDATE_Y_IDENTITY, candidateCompanyId: "candidate-z", displayName: "CANDIDAT-Z-SAS", legalName: "CANDIDAT-Z-SAS", principalEstablishment: { siret: "39395385100010" } },
      candidateRepresentatives: [{ firstName: "Bea", lastName: "Beta", type: "ADMINISTRATIVE_CONTACT", email: "admin@candidate-z.test", phone: "+33222222222" }],
    });
    const b = await resolverB.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", subcontractorDeclarationId: DECLARATION_ID });

    const serializedB = JSON.stringify(b);
    expect(b.data["titulaire.email"]).toBe("admin@candidate-z.test");
    expect(serializedB).not.toContain("admin@candidate-y.test");
    expect(serializedB).not.toContain("+33111111111");
    expect(serializedB).not.toContain(String(CANDIDATE_Y_IDENTITY.displayName));
    expect(serializedB).not.toContain("contact@acme-consulting.fr");
  });
});
