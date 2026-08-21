import { describe, expect, it } from "vitest";
import { CandidateIdentitySource } from "../../../../candidate-company";
import { AdministrativeFormFieldStatus } from "../../../domain/administrative-form-field-status";
import { FormFieldSource } from "../../../domain/form-field-source";
import { Dc4OfficialFormResolver } from "./dc4-official-form-resolver.service";

const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const DECLARATION_ID = "declaration-1";

/** ClientAccount X — LEGACY, volontairement différent du candidat Y (mission §7 "CLIENT ≠ CANDIDATE TEST"). */
const CLIENT_X_LEGAL_IDENTITY = {
  tradeName: "ACME Consulting",
  legalName: "ACME Consulting SAS",
  siretPrincipal: "11122233300011",
  legalForm: "SAS",
  addressLine: "1 rue du Client",
  postalCode: "75001",
  city: "Paris",
  generalEmail: "contact@acme-consulting.fr",
  phone: "0100000000",
};

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

function buildResolver(input: { tenderCandidateCompanyId: string | undefined; candidateIdentity: unknown }): Dc4OfficialFormResolver {
  const declarationRepository = { findById: async () => DECLARATION };
  const getTenderUseCase = { execute: async () => ({ buyerName: "Ville de Test", title: "Marché de test", clientAccountId: "client-x", candidateCompanyId: input.tenderCandidateCompanyId }) };
  const getCompanyProfileUseCase = { execute: async () => ({ legalIdentity: CLIENT_X_LEGAL_IDENTITY }) };
  const getSubcontractorProfileUseCase = { execute: async () => { throw new Error("no subcontractorProfileId on this declaration (test fixture)"); } };
  const resolveCandidateIdentityUseCase = { execute: async () => input.candidateIdentity };

  return new Dc4OfficialFormResolver(declarationRepository as never, getTenderUseCase as never, getCompanyProfileUseCase as never, getSubcontractorProfileUseCase as never, resolveCandidateIdentityUseCase as never);
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

  it("LEGACY FLOW — no resolved CandidateCompany: titulaire.* falls back to ClientAccount X's legalIdentity", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: undefined, candidateIdentity: { source: CandidateIdentitySource.None } });

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", subcontractorDeclarationId: DECLARATION_ID });

    expect(result.data["titulaire.tradeName"]).toBe("ACME Consulting");
    expect(result.data["titulaire.siret"]).toBe("11122233300011");
    expect(result.readiness.fields.find((f) => f.fieldKey === "titulaire.tradeName")?.source).toBe(FormFieldSource.ClientProfile);
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
  });

  it("LEGACY FLOW non-regression — titulaire.email/phone still resolve from ClientAccount X's legalIdentity", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: undefined, candidateIdentity: { source: CandidateIdentitySource.None } });

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", subcontractorDeclarationId: DECLARATION_ID });

    expect(result.data["titulaire.email"]).toBe("contact@acme-consulting.fr");
    expect(result.data["titulaire.phone"]).toBe("0100000000");
  });
});
