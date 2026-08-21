import { describe, expect, it } from "vitest";
import { CandidateIdentitySource } from "../../../../candidate-company";
import { AdministrativeFormFieldStatus } from "../../../domain/administrative-form-field-status";
import { FormFieldSource } from "../../../domain/form-field-source";
import { Dc2OfficialFormResolver } from "./dc2-official-form-resolver.service";

const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

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

/** CandidateCompany Y — NEW FLOW, jamais confondue avec X. */
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

function buildResolver(input: { tenderCandidateCompanyId: string | undefined; candidateIdentity: unknown }): Dc2OfficialFormResolver {
  const getTenderUseCase = { execute: async () => ({ clientAccountId: "client-x", candidateCompanyId: input.tenderCandidateCompanyId }) };
  const getCompanyProfileUseCase = { execute: async () => ({ legalIdentity: CLIENT_X_LEGAL_IDENTITY }) };
  const getConsortiumUseCase = { execute: async () => { throw new Error("should never be called for scope CANDIDATE (test fixture)"); } };
  const resolveCandidateIdentityUseCase = { execute: async () => input.candidateIdentity };

  return new Dc2OfficialFormResolver(getTenderUseCase as never, getCompanyProfileUseCase as never, getConsortiumUseCase as never, resolveCandidateIdentityUseCase as never);
}

/** Checkpoint TENDEROS-2.1-P2.2-F3, mission §7/§37/§47 — scope CANDIDATE : même discipline NEW/
 *  LEGACY FLOW que DC1, prouvée avec les mêmes fixtures ClientAccount X / CandidateCompany Y. */
describe("Dc2OfficialFormResolver — CLIENT ≠ CANDIDATE (Checkpoint TENDEROS-2.1-P2.2-F3)", () => {
  it("NEW FLOW — scope CANDIDATE resolves from CandidateCompany Y, NEVER from ClientAccount X's legalIdentity", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: "candidate-y", candidateIdentity: CANDIDATE_Y_IDENTITY });

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, scope: { kind: "CANDIDATE" } });

    expect(result.data["candidate.tradeName"]).toBe("Beta Services");
    expect(result.data["candidate.siret"]).toBe("44455566600029");
    expect(result.data["candidate.legalForm"]).toBe("SARL");
    expect(result.operatorLabel).toBe("Beta Services");
    expect(Object.values(result.data)).not.toContain("ACME Consulting");
    expect(Object.values(result.data)).not.toContain("11122233300011");
    expect(result.readiness.fields.find((f) => f.fieldKey === "candidate.tradeName")?.source).toBe(FormFieldSource.CandidateCompanyProfile);
  });

  it("LEGACY FLOW — no resolved CandidateCompany: scope CANDIDATE falls back to ClientAccount X's legalIdentity", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: undefined, candidateIdentity: { source: CandidateIdentitySource.None } });

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, scope: { kind: "CANDIDATE" } });

    expect(result.data["candidate.tradeName"]).toBe("ACME Consulting");
    expect(result.data["candidate.siret"]).toBe("11122233300011");
    expect(result.data["candidate.legalForm"]).toBe("SAS");
    expect(result.readiness.fields.find((f) => f.fieldKey === "candidate.tradeName")?.source).toBe(FormFieldSource.ClientProfile);
  });

  /** Checkpoint TENDEROS-2.1-P2.2-F3.1 (correctif audit Codex P1). */
  it("P1 FIX — NEW FLOW: candidate.email/phone stay MISSING, NEVER borrowed from ClientAccount X's legalIdentity", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: "candidate-y", candidateIdentity: CANDIDATE_Y_IDENTITY });

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, scope: { kind: "CANDIDATE" } });

    expect(result.data["candidate.email"]).toBeUndefined();
    expect(result.data["candidate.phone"]).toBeUndefined();
    expect(Object.values(result.data)).not.toContain("contact@acme-consulting.fr");
    expect(Object.values(result.data)).not.toContain("0100000000");
    expect(result.readiness.fields.find((f) => f.fieldKey === "candidate.email")?.status).toBe(AdministrativeFormFieldStatus.Missing);
  });

  it("LEGACY FLOW non-regression — candidate.email/phone still resolve from ClientAccount X's legalIdentity", async () => {
    const resolver = buildResolver({ tenderCandidateCompanyId: undefined, candidateIdentity: { source: CandidateIdentitySource.None } });

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, scope: { kind: "CANDIDATE" } });

    expect(result.data["candidate.email"]).toBe("contact@acme-consulting.fr");
    expect(result.data["candidate.phone"]).toBe("0100000000");
  });

  it("scope MEMBER never touches CandidateCompany/ClientAccount identity at all — resolved exclusively from Consortium.members", async () => {
    const getTenderUseCase = { execute: async () => ({ clientAccountId: "client-x", candidateCompanyId: "candidate-y" }) };
    const getCompanyProfileUseCase = { execute: async () => { throw new Error("should never be called for scope MEMBER (test fixture)"); } };
    const resolveCandidateIdentityUseCase = { execute: async () => { throw new Error("should never be called for scope MEMBER (test fixture)"); } };
    const getConsortiumUseCase = { execute: async () => ({ members: [{ memberId: "member-1", name: "Gamma Travaux", legalIdentifier: "77788899900011" }] }) };
    const resolver = new Dc2OfficialFormResolver(getTenderUseCase as never, getCompanyProfileUseCase as never, getConsortiumUseCase as never, resolveCandidateIdentityUseCase as never);

    const result = await resolver.resolve({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, scope: { kind: "MEMBER", memberId: "member-1" } });

    expect(result.data["candidate.tradeName"]).toBe("Gamma Travaux");
    expect(result.data["candidate.siret"]).toBe("77788899900011");
    expect(result.readiness.fields.find((f) => f.fieldKey === "candidate.tradeName")?.source).toBe(FormFieldSource.GroupMember);
  });
});
