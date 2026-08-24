import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InviteMemberDialog, MembersSection } from "./members-section";
import type { OrganizationMemberResponse } from "../../../../lib/membership-types";
import type { SeatUsage } from "../../../../lib/seat-usage";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// jsdom n'implémente pas `HTMLDialogElement.showModal()`/`close()` — même motif que `dialog.test.tsx`.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
});

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

const CONTRIBUTOR: OrganizationMemberResponse = {
  id: "membership-2",
  organizationId: "org-1",
  userId: "user-2",
  role: "CONTRIBUTOR",
  status: "ACTIVE",
  joinedAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  user: { id: "user-2", email: "contributor@example.com", displayName: "Contributor" },
};

/**
 * Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14/§15) — preuve frontend que
 * l'invitation se fait par EMAIL (jamais un identifiant technique), et que le formulaire reflète
 * `seatUsage` en LECTURE SEULE (mission §15 "le backend reste autoritaire", jamais un second calcul
 * qui pourrait diverger).
 *
 * Checkpoint TENDEROS-2.1-P2.3-E7 (Team & Users V2, mission §6-§11/§50) — migration Design System
 * E5.1 : le formulaire d'invitation vit désormais dans `InviteMemberDialog` (`Dialog`, déclenché par
 * un CTA), séparé de `MembersSection` (la table). La confirmation de retrait utilise `Dialog`, jamais
 * `window.confirm` (mission §27 "Utiliser Dialog E5.1").
 */
describe("InviteMemberDialog", () => {
  it("shows an email field to invite a member — never a raw user-id input", () => {
    render(<InviteMemberDialog seatUsage={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Inviter un membre" }));

    const emailInput = screen.getByLabelText("Email de la personne à inviter");
    expect(emailInput).toHaveAttribute("type", "email");
    expect(screen.queryByLabelText(/identifiant utilisateur/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inviter" })).toBeInTheDocument();
  });

  it("displays seat usage (X / Y utilisateurs) when provided", () => {
    const seatUsage: SeatUsage = { activeUsers: 1, limit: 2, atLimit: false };
    render(<InviteMemberDialog seatUsage={seatUsage} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Inviter un membre" }));

    expect(screen.getByText("1 / 2 utilisateurs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inviter" })).toBeEnabled();
  });

  it("mission §15 — disables the invite form when the seat limit is reached, with an upgrade CTA, but never hides the limit information", () => {
    const seatUsage: SeatUsage = { activeUsers: 2, limit: 2, atLimit: true };
    render(<InviteMemberDialog seatUsage={seatUsage} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Inviter un membre" }));

    expect(screen.getByLabelText("Email de la personne à inviter")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Inviter" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "changer d'offre" })).toHaveAttribute("href", "/app/subscription");
  });
});

describe("MembersSection", () => {
  it("BLOQUANT — does not render an Actions column or any role/suspend/remove control for an actor without manage permission", () => {
    render(<MembersSection members={[OWNER, CONTRIBUTOR]} canManage={false} currentUserId="user-2" />);

    expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Contributor")).toBeInTheDocument();
  });

  it("renders a role select and Suspendre/Retirer actions per row for an actor with manage permission (never for OWNER)", () => {
    render(<MembersSection members={[OWNER, CONTRIBUTOR]} canManage currentUserId="user-1" />);

    expect(screen.getAllByRole("button", { name: "Retirer" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Suspendre" })).toHaveLength(1);
    expect(screen.getByText("Propriétaire")).toBeInTheDocument();
  });

  it("BLOQUANT — Retirer opens a confirmation Dialog (never window.confirm) and only calls removeMemberAction after confirming", async () => {
    const { removeMemberAction } = await import("../../membership-actions");
    render(<MembersSection members={[OWNER, CONTRIBUTOR]} canManage currentUserId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Retirer" }));
    const dialog = screen.getByRole("dialog", { name: "Retirer ce membre ?" });
    expect(removeMemberAction).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Retirer" }));
    expect(removeMemberAction).toHaveBeenCalledWith(CONTRIBUTOR.id);
  });

  it("shows an empty state when there are no members", () => {
    render(<MembersSection members={[]} canManage currentUserId="user-1" />);
    expect(screen.getByText("Aucun membre")).toBeInTheDocument();
  });

  /** Checkpoint TENDEROS-2.1-P2.3-E7 — bug trouvé en revue visuelle réelle (mission §41/§52) : l'API
   *  renvoie toujours au moins la propre affiliation de l'acteur, donc `members` n'est jamais vide
   *  en pratique dans une organisation neuve — seul ce cas (uniquement soi-même) doit afficher
   *  l'état vide, jamais un tableau à une seule ligne. */
  it("BLOQUANT — shows the empty state when the only member is the current actor themselves (the real-world empty case)", () => {
    render(<MembersSection members={[OWNER]} canManage currentUserId="user-1" />);
    expect(screen.getByText("Aucun membre")).toBeInTheDocument();
  });
});
