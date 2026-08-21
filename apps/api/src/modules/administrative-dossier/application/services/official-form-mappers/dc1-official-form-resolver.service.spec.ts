import { describe, expect, it } from "vitest";
import { CandidateIdentitySource } from "../../../../candidate-company";
import { Dc1CandidateType } from "../../../domain/dc1-declaration.aggregate";
import { AdministrativeFormFieldStatus } from "../../../domain/administrative-form-field-status";
import { FormFieldSource } from "../../../domain/form-field-source";
import { Dc1OfficialFormResolver } from "./dc1-official-form-resolver.service";

const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

/** ClientAccount X (compte commercial TenderOS) — donnée LEGACY, volontairement DIFFÉRENTE du
 *  candidat Y ci-dessous, pour prouver qu'aucune valeur de X ne fuite jamais dans le formulaire
 *  quand le NEW FLOW s'applique (mission §7 "CLIENT ≠ CANDIDATE TEST"). */
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

/** CandidateCompany Y (entité candidate réelle, NEW FLOW) — jamais la même identité que X. */
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

function buildResolver(input: { tenderCandidateCompanyId: string | undefined; candidateIdentity: unknown }): Dc1OfficialFormResolver {
  const getDc1DeclarationUseCase = { execute: async () => ({ candidateType: Dc1CandidateType.Individual, exclusionAttestation: true }) };
  const getConsortiumUseCase = { execute: async () => { throw new Error("should never be called for an INDIVIDUAL candidate (test fixture)"); } };
  const getTenderUseCase = { execute: async () => ({ buyerName: "Ville de Test", title: "Marché de test", clientAccountId: "client-x", candidateCompanyId: input.tenderCandidateCompanyId }) };
  const getCompanyProfileUseCase = { execute: async () => ({ legalIdentity: CLIENT_X_LEGAL_IDENTITY }) };
  const resolveCandidateIdentityUseCase = { execute: async () => input.candidateIdentity };

  return new Dc1OfficialFormResolver(getDc1DeclarationUseCase as never, getConsortiumUseCase as never, getTenderUseCase as never, getCompanyProfileUseCase as never, resolveCandidateIdentityUseCase as never);
}

/** Checkpoint TENDEROS-2.1-P2.2-F3, mission §7/§37/§47 — "CLIENT ≠ CANDIDATE TEST" : ClientAccount
 *  X ("ACME Consulting") et CandidateCompany Y ("Beta Services") portent des données réelles et
 *  DÉLIBÉRÉMENT différentes ; ce test prouve la source effective, jamais un simple snapshot. */
describe("Dc1OfficialFormResolver — CLIENT ≠ CANDIDATE (Checkpoint TENDEROS-2.1-P2.2-F3)", () => {
  it("NEW FLOW — Tender.candidateCompanyId set: candidate.* resolves from CandidateCompany Y, NEVER from ClientAccount X's legalIdentity, even though they differ", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: "candidate-y", candidateIdentity: CANDIDATE_Y_IDENTITY });

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(result.data["candidate.tradeName"]).toBe("Beta Services");
    expect(result.data["candidate.siret"]).toBe("44455566600029");
    expect(result.data["candidate.address"]).toBe("9 avenue du Candidat, 69000 Lyon");
    // ClientAccount X's own trade name/SIRET must never appear anywhere in the resolved data.
    expect(Object.values(result.data)).not.toContain("ACME Consulting");
    expect(Object.values(result.data)).not.toContain("11122233300011");
    const tradeNameField = result.readiness.fields.find((f) => f.fieldKey === "candidate.tradeName");
    expect(tradeNameField?.source).toBe(FormFieldSource.CandidateCompanyProfile);
  });

  it("LEGACY FLOW — Tender without a resolved CandidateCompany: candidate.* falls back to ClientAccount X's legalIdentity, unchanged non-regression behavior", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: undefined, candidateIdentity: { source: CandidateIdentitySource.None } });

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(result.data["candidate.tradeName"]).toBe("ACME Consulting");
    expect(result.data["candidate.siret"]).toBe("11122233300011");
    const tradeNameField = result.readiness.fields.find((f) => f.fieldKey === "candidate.tradeName");
    expect(tradeNameField?.source).toBe(FormFieldSource.ClientProfile);
  });

  /** Checkpoint TENDEROS-2.1-P2.2-F3.1 (correctif audit Codex P1) — `CandidateCompany` ne porte
   *  aucun champ contact et aucune autre SOT candidate-native n'existe : en NEW FLOW,
   *  candidate.email/phone doivent rester MISSING, jamais empruntés à ClientAccount X. */
  it("P1 FIX — NEW FLOW: candidate.email/phone stay MISSING, NEVER borrowed from ClientAccount X's legalIdentity", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: "candidate-y", candidateIdentity: CANDIDATE_Y_IDENTITY });

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(result.data["candidate.email"]).toBeUndefined();
    expect(result.data["candidate.phone"]).toBeUndefined();
    expect(Object.values(result.data)).not.toContain("contact@acme-consulting.fr");
    expect(Object.values(result.data)).not.toContain("0100000000");
    const emailField = result.readiness.fields.find((f) => f.fieldKey === "candidate.email");
    expect(emailField?.status).toBe(AdministrativeFormFieldStatus.Missing);
    expect(emailField?.source).toBeUndefined();
  });

  it("LEGACY FLOW non-regression — candidate.email/phone still resolve from ClientAccount X's legalIdentity, exactly as before F3.1", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: undefined, candidateIdentity: { source: CandidateIdentitySource.None } });

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(result.data["candidate.email"]).toBe("contact@acme-consulting.fr");
    expect(result.data["candidate.phone"]).toBe("0100000000");
    const emailField = result.readiness.fields.find((f) => f.fieldKey === "candidate.email");
    expect(emailField?.source).toBe(FormFieldSource.ClientProfile);
  });
});
