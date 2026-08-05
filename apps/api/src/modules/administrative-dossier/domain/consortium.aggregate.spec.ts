import { describe, expect, it } from "vitest";
import { Consortium, ConsortiumType, type ConsortiumMember } from "./consortium.aggregate";
import { ConsortiumMandataireNotAMemberError, ConsortiumMemberPercentagesExceed100Error } from "./errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");

function baseConsortium() {
  return Consortium.create({ id: "consortium-1", organizationId: "org-1", tenderId: "tender-1", type: ConsortiumType.Joint, createdBy: "user-1", occurredAt: NOW });
}

const memberA: ConsortiumMember = { memberId: "member-a", name: "Entreprise A", role: "Mandataire", percentage: 60 };
const memberB: ConsortiumMember = { memberId: "member-b", name: "Entreprise B", role: "Co-traitant", percentage: 40 };

describe("Consortium — mission §15", () => {
  it("setMembers accepts a valid member list summing to <= 100%", () => {
    const consortium = baseConsortium();
    consortium.setMembers({ members: [memberA, memberB], occurredAt: NOW });
    expect(consortium.members).toHaveLength(2);
  });

  it("refuses a member list whose percentages sum above 100", () => {
    const consortium = baseConsortium();
    expect(() => consortium.setMembers({ members: [{ ...memberA, percentage: 70 }, { ...memberB, percentage: 40 }], occurredAt: NOW })).toThrow(
      ConsortiumMemberPercentagesExceed100Error,
    );
  });

  it("setMandataire refuses a memberId not among the declared members", () => {
    const consortium = baseConsortium();
    consortium.setMembers({ members: [memberA, memberB], occurredAt: NOW });
    expect(() => consortium.setMandataire({ mandataireMemberId: "member-unknown", occurredAt: NOW })).toThrow(ConsortiumMandataireNotAMemberError);
  });

  it("setMandataire succeeds for a declared member", () => {
    const consortium = baseConsortium();
    consortium.setMembers({ members: [memberA, memberB], occurredAt: NOW });
    consortium.setMandataire({ mandataireMemberId: "member-a", occurredAt: NOW });
    expect(consortium.mandataireMemberId).toBe("member-a");
  });

  it("setMembers refuses to drop the current mandataire from the new list", () => {
    const consortium = baseConsortium();
    consortium.setMembers({ members: [memberA, memberB], occurredAt: NOW });
    consortium.setMandataire({ mandataireMemberId: "member-a", occurredAt: NOW });
    expect(() => consortium.setMembers({ members: [memberB], occurredAt: NOW })).toThrow(ConsortiumMandataireNotAMemberError);
  });
});
