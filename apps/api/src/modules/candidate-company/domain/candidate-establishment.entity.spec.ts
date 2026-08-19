import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CandidateEstablishment } from "./candidate-establishment.entity";

const ORG = randomUUID();
const COMPANY = randomUUID();
const ACTOR = randomUUID();
const NOW = new Date("2026-08-17T10:00:00Z");

describe("CandidateEstablishment", () => {
  it("defaults isPrincipal to false when not specified", () => {
    const establishment = CandidateEstablishment.create({
      id: randomUUID(),
      organizationId: ORG,
      candidateCompanyId: COMPANY,
      siret: "35600000000048",
      createdBy: ACTOR,
      occurredAt: NOW,
    });
    expect(establishment.isPrincipal).toBe(false);
  });

  it("carries an explicit isPrincipal flag when specified", () => {
    const establishment = CandidateEstablishment.create({
      id: randomUUID(),
      organizationId: ORG,
      candidateCompanyId: COMPANY,
      siret: "35600000000048",
      isPrincipal: true,
      createdBy: ACTOR,
      occurredAt: NOW,
    });
    expect(establishment.isPrincipal).toBe(true);
  });

  it("rehydrates without recomputing anything derived", () => {
    const props = {
      id: randomUUID(),
      organizationId: ORG,
      candidateCompanyId: COMPANY,
      siret: "35600000000048",
      label: "Siège",
      isPrincipal: true,
      addressLine: "1 rue de la Paix",
      postalCode: "75002",
      city: "Paris",
      country: "FR",
      createdBy: ACTOR,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const establishment = CandidateEstablishment.rehydrate(props);
    expect(establishment.siret).toBe(props.siret);
    expect(establishment.city).toBe("Paris");
  });
});
