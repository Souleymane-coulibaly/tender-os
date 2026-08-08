import { describe, expect, it } from "vitest";
import { TenderCollaborativeRole, TenderParticipant } from "./tender-participant.entity";

describe("TenderParticipant", () => {
  const occurredAt = new Date("2026-01-01T00:00:00.000Z");

  function create(): TenderParticipant {
    return TenderParticipant.create({
      id: "participant-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      userId: "user-1",
      role: TenderCollaborativeRole.TechnicalWriter,
      addedBy: "owner-1",
      occurredAt,
    });
  }

  it("starts active with the given role", () => {
    const participant = create();

    expect(participant.isActive).toBe(true);
    expect(participant.role).toBe(TenderCollaborativeRole.TechnicalWriter);
    expect(participant.removedAt).toBeUndefined();
  });

  it("changes role without affecting active status", () => {
    const participant = create();
    const later = new Date("2026-01-02T00:00:00.000Z");

    participant.changeRole(TenderCollaborativeRole.Reviewer, later);

    expect(participant.role).toBe(TenderCollaborativeRole.Reviewer);
    expect(participant.isActive).toBe(true);
    expect(participant.updatedAt).toBe(later);
  });

  it("becomes inactive once removed, keeping addedBy/addedAt history", () => {
    const participant = create();
    const removedAt = new Date("2026-01-03T00:00:00.000Z");

    participant.remove("admin-1", removedAt);

    expect(participant.isActive).toBe(false);
    expect(participant.removedAt).toBe(removedAt);
    expect(participant.removedBy).toBe("admin-1");
    expect(participant.addedBy).toBe("owner-1");
    expect(participant.addedAt).toBe(occurredAt);
  });
});
