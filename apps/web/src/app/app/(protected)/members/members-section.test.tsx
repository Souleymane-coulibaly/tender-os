import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MembersSection } from "./members-section";
import type { OrganizationMemberResponse } from "../../../../lib/membership-types";
import type { SeatUsage } from "../../../../lib/seat-usage";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("../../membership-actions", () => ({
  inviteMemberByEmailAction: vi.fn(async () => ({})),
  changeMemberRoleAction: vi.fn(async () => ({})),
  suspendMemberAction: vi.fn(async () => ({})),
  removeMemberAction: vi.fn(async () => ({})),
}));

const OWNER: OrganizationMemberResponse = {
  id: "membership-1",
  organizationId: "org-1",
  userId: "user-1",
  role: "OWNER",
  status: "ACTIVE",
  joinedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  user: { id: "user-1", email: "owner@example.com", displayName: "Owner" },
};

/**
 * Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14/§15) — preuve frontend que
 * l'invitation se fait désormais par EMAIL (jamais un identifiant technique — la lacune que le
 * commentaire précédent documentait explicitement comme manquante), et que le formulaire reflète
 * `seatUsage` en LECTURE SEULE (mission §15 "le backend reste autoritaire", jamais un second calcul
 * qui pourrait diverger).
 */
describe("MembersSection", () => {
  it("shows an email field to invite a member — never a raw user-id input", () => {
    render(<MembersSection members={[OWNER]} canManage currentUserId="user-1" seatUsage={undefined} />);

    const emailInput = screen.getByLabelText("Email de la personne à inviter");
    expect(emailInput).toHaveAttribute("type", "email");
    expect(screen.queryByLabelText(/identifiant utilisateur/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inviter" })).toBeInTheDocument();
  });

  it("displays seat usage (X / Y utilisateurs) when provided", () => {
    const seatUsage: SeatUsage = { activeUsers: 1, limit: 2, atLimit: false };
    render(<MembersSection members={[OWNER]} canManage currentUserId="user-1" seatUsage={seatUsage} />);

    expect(screen.getByText("1 / 2 utilisateurs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inviter" })).toBeEnabled();
  });

  it("mission §15 — disables the invite form when the seat limit is reached, with an upgrade CTA, but never hides the limit information", () => {
    const seatUsage: SeatUsage = { activeUsers: 2, limit: 2, atLimit: true };
    render(<MembersSection members={[OWNER]} canManage currentUserId="user-1" seatUsage={seatUsage} />);

    expect(screen.getByLabelText("Email de la personne à inviter")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Inviter" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "changer d'offre" })).toHaveAttribute("href", "/app/subscription");
  });

  it("does not render the invite form at all for an actor without manage permission", () => {
    render(<MembersSection members={[OWNER]} canManage={false} currentUserId="user-2" seatUsage={undefined} />);

    expect(screen.queryByLabelText("Email de la personne à inviter")).not.toBeInTheDocument();
  });
});
