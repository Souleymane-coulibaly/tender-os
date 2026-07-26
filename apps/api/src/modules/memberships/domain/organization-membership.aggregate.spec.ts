import { describe, expect, it } from "vitest";
import { MembershipNotActiveError } from "./errors";
import { MembershipId } from "./membership-id.value-object";
import { MembershipStatus } from "./membership-status";
import { OrganizationMembership } from "./organization-membership.aggregate";
import { OrganizationRole } from "./organization-role";

function createMembership(occurredAt = new Date("2026-01-01T00:00:00Z")): OrganizationMembership {
  return OrganizationMembership.create({
    id: MembershipId.from("membership-1"),
    organizationId: "org-1",
    userId: "user-1",
    role: OrganizationRole.Contributor,
    occurredAt,
  });
}

describe("OrganizationMembership.create", () => {
  it("starts ACTIVE with joinedAt set to the occurrence date", () => {
    const membership = createMembership(new Date("2026-01-01T00:00:00Z"));

    expect(membership.status).toBe(MembershipStatus.Active);
    expect(membership.joinedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(membership.suspendedAt).toBeUndefined();
  });
});

describe("OrganizationMembership#changeRole", () => {
  it("replaces the role and bumps updatedAt", () => {
    const membership = createMembership();

    membership.changeRole(OrganizationRole.BidManager, new Date("2026-02-01T00:00:00Z"));

    expect(membership.role).toBe(OrganizationRole.BidManager);
    expect(membership.updatedAt).toEqual(new Date("2026-02-01T00:00:00Z"));
  });

  it("refuses to change the role of a non-active membership", () => {
    const membership = createMembership();
    membership.suspend(new Date("2026-01-15T00:00:00Z"));

    expect(() => membership.changeRole(OrganizationRole.BidManager, new Date())).toThrow(
      MembershipNotActiveError,
    );
  });
});

describe("OrganizationMembership#suspend", () => {
  it("suspends an active membership", () => {
    const membership = createMembership();

    membership.suspend(new Date("2026-01-15T00:00:00Z"));

    expect(membership.status).toBe(MembershipStatus.Suspended);
    expect(membership.suspendedAt).toEqual(new Date("2026-01-15T00:00:00Z"));
  });

  it("refuses to suspend an already-suspended membership", () => {
    const membership = createMembership();
    membership.suspend(new Date());

    expect(() => membership.suspend(new Date())).toThrow(MembershipNotActiveError);
  });
});

describe("OrganizationMembership#remove", () => {
  it("removes an active membership", () => {
    const membership = createMembership();

    membership.remove(new Date("2026-03-01T00:00:00Z"));

    expect(membership.status).toBe(MembershipStatus.Removed);
  });

  it("removes a suspended membership", () => {
    const membership = createMembership();
    membership.suspend(new Date());

    membership.remove(new Date());

    expect(membership.status).toBe(MembershipStatus.Removed);
  });

  it("refuses to remove an already-removed membership", () => {
    const membership = createMembership();
    membership.remove(new Date());

    expect(() => membership.remove(new Date())).toThrow(MembershipNotActiveError);
  });
});

describe("OrganizationMembership#isEffectivelyActive", () => {
  it("is active when status is ACTIVE and there is no expiry", () => {
    const membership = createMembership();

    expect(membership.isEffectivelyActive(new Date("2026-06-01T00:00:00Z"))).toBe(true);
  });

  it("is inactive once past its expiresAt", () => {
    const membership = OrganizationMembership.create({
      id: MembershipId.from("membership-1"),
      organizationId: "org-1",
      userId: "user-1",
      role: OrganizationRole.ExternalConsultant,
      expiresAt: new Date("2026-02-01T00:00:00Z"),
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(membership.isEffectivelyActive(new Date("2026-03-01T00:00:00Z"))).toBe(false);
  });

  it("is inactive when suspended", () => {
    const membership = createMembership();
    membership.suspend(new Date());

    expect(membership.isEffectivelyActive(new Date())).toBe(false);
  });
});
