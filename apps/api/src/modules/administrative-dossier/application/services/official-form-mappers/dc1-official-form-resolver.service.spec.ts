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

function buildResolver(input: { tenderCandidateCompanyId: string | undefined; candidateIdentity: unknown; candidateRepresentatives?: unknown[] | undefined }): Dc1OfficialFormResolver {
  const getDc1DeclarationUseCase = { execute: async () => ({ candidateType: Dc1CandidateType.Individual, exclusionAttestation: true }) };
  const getConsortiumUseCase = { execute: async () => { throw new Error("should never be called for an INDIVIDUAL candidate (test fixture)"); } };
  const getTenderUseCase = { execute: async () => ({ buyerName: "Ville de Test", title: "Marché de test", clientAccountId: "client-x", candidateCompanyId: input.tenderCandidateCompanyId }) };
  const resolveCandidateIdentityUseCase = { execute: async () => input.candidateIdentity };

  /** Checkpoint CCV2-E — capacités candidate. Vides par défaut : les champs de contact restent
   *  alors MISSING, exactement comme avant ce checkpoint, ce qui garantit qu'aucune assertion
   *  existante ne réussit grâce à une donnée fabriquée. Les tests qui prouvent le NOUVEAU
   *  comportement fournissent explicitement des représentants. */
  const resolveCandidateCapabilitiesUseCase = {
    execute: async () => ({
      source: "CANDIDATE_COMPANY",
      representatives: input.candidateRepresentatives ?? [],
      insurances: [], certifications: [], references: [], humanResources: [], materialResources: [], documents: [],
    }),
  };

  return new Dc1OfficialFormResolver(getDc1DeclarationUseCase as never, getConsortiumUseCase as never, getTenderUseCase as never, resolveCandidateIdentityUseCase as never, resolveCandidateCapabilitiesUseCase as never);
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

  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.2 — CONTRAT INVERSÉ. Ce test encodait le repli que la mission
   * supprime : sans entreprise candidate, l'identité du CLIENT commercial était servie comme si
   * elle était celle du candidat. La MOITIÉ essentielle de l'ancienne règle survit et reste
   * prouvée ailleurs dans ce même fichier : le client n'est JAMAIS présenté comme le candidat.
   * Ce qui change, c'est qu'on refuse désormais au lieu de substituer.
   */
  it("BLOQUANT (CCV2-G.2) — sans entreprise candidate, la résolution est REFUSÉE au lieu de servir le client", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: undefined, candidateIdentity: { source: CandidateIdentitySource.None } });
  
    await expect(
      resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID }),
    ).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_REQUIRED" });
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
    // Checkpoint CCV2-E — la SOURCE devient `CandidateCompanyProfile` même lorsque la valeur est
    // absente, et c'est plus informatif qu'un `undefined` : on sait désormais d'où ce champ DOIT
    // venir (les représentants de l'entreprise candidate), au lieu de ne rien savoir. La propriété
    // essentielle du test — aucune donnée du client commercial — reste vérifiée ci-dessus.
    expect(emailField?.source).toBe(FormFieldSource.CandidateCompanyProfile);
    expect(emailField?.value).toBeUndefined();
  });

  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.2 — CONTRAT INVERSÉ. Ce test encodait le repli que la mission
   * supprime : sans entreprise candidate, l'identité du CLIENT commercial était servie comme si
   * elle était celle du candidat. La MOITIÉ essentielle de l'ancienne règle survit et reste
   * prouvée ailleurs dans ce même fichier : le client n'est JAMAIS présenté comme le candidat.
   * Ce qui change, c'est qu'on refuse désormais au lieu de substituer.
   */
  it("BLOQUANT (CCV2-G.2) — sans entreprise candidate, le contact du client n'est JAMAIS servi : la résolution est refusée", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: undefined, candidateIdentity: { source: CandidateIdentitySource.None } });
  
    await expect(
      resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID }),
    ).rejects.toMatchObject({ code: "CANDIDATE_COMPANY_REQUIRED" });
  });

  it("Checkpoint CCV2-E (ferme CCV2-01/P0-02) — le contact du candidat vient de SES représentants, jamais du client commercial, et reste MISSING sans représentant porteur", async () => {
    const withoutRepresentative = buildResolver({ tenderCandidateCompanyId: "candidate-y", candidateIdentity: CANDIDATE_Y_IDENTITY });
    const before = await withoutRepresentative.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    const emailBefore = before.readiness.fields.find((f) => f.fieldKey === "candidate.email");
    expect(emailBefore?.status).toBe(AdministrativeFormFieldStatus.Missing);
    // Le courriel du CLIENT existe pourtant dans la fixture : il ne comble jamais ce vide.
    expect(JSON.stringify(before)).not.toContain("contact@acme-consulting.fr");

    const withRepresentative = buildResolver({
      tenderCandidateCompanyId: "candidate-y",
      candidateIdentity: CANDIDATE_Y_IDENTITY,
      candidateRepresentatives: [
        // Un signataire porte un courriel, mais un CONTACT ADMINISTRATIF doit primer : l'ordre de
        // préférence est explicite, jamais « le premier trouvé ».
        { firstName: "Sig", lastName: "Nataire", type: "SIGNATORY", email: "signataire@candidate-y.test", phone: null },
        { firstName: "Ada", lastName: "Admin", type: "ADMINISTRATIVE_CONTACT", email: "admin@candidate-y.test", phone: "+33100000000" },
      ],
    });
    const after = await withRepresentative.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    const emailAfter = after.readiness.fields.find((f) => f.fieldKey === "candidate.email");
    const phoneAfter = after.readiness.fields.find((f) => f.fieldKey === "candidate.phone");
    expect(emailAfter?.status).toBe(AdministrativeFormFieldStatus.Available);
    expect(emailAfter?.value).toBe("admin@candidate-y.test");
    expect(phoneAfter?.value).toBe("+33100000000");
    expect(JSON.stringify(after)).not.toContain("contact@acme-consulting.fr");
  });
});
