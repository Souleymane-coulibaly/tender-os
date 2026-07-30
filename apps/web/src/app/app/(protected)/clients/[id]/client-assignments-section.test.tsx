import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientAssignmentsSection } from "./client-assignments-section";
import type { ClientAssignmentView } from "../../../../../lib/client-portfolio-types";

const updateClientAssignmentAction = vi.fn(async (_clientId: string, _assignmentId: string, _role: string) => ({}));
const removeClientAssignmentAction = vi.fn(async (_clientId: string, _assignmentId: string) => ({}));
const assignUserToClientAction = vi.fn(async (_prevState: unknown, _formData: FormData) => ({}));

vi.mock("../../../client-portfolio-actions", () => ({
  updateClientAssignmentAction: (clientId: string, assignmentId: string, role: string) => updateClientAssignmentAction(clientId, assignmentId, role),
  removeClientAssignmentAction: (clientId: string, assignmentId: string) => removeClientAssignmentAction(clientId, assignmentId),
  assignUserToClientAction: (clientId: string, prevState: unknown, formData: FormData) => assignUserToClientAction(prevState, formData),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const ASSIGNMENT: ClientAssignmentView = {
  id: "assignment-1",
  organizationId: "org-1",
  clientAccountId: "client-1",
  userId: "user-1",
  role: "VIEWER",
  createdBy: "user-owner",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  user: { id: "user-1", email: "jane@example.com", displayName: "Jane Doe" },
};

describe("ClientAssignmentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty state when there is no assignment yet", () => {
    render(<ClientAssignmentsSection clientId="client-1" assignments={[]} candidates={[]} canManage={true} />);
    expect(screen.getByText("Aucun utilisateur affecté à ce client pour le moment.")).toBeInTheDocument();
  });

  it("lists an existing assignment with its user email and role", () => {
    render(<ClientAssignmentsSection clientId="client-1" assignments={[ASSIGNMENT]} candidates={[]} canManage={true} />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  it("never shows role-change or remove controls when the actor cannot manage assignments", () => {
    render(<ClientAssignmentsSection clientId="client-1" assignments={[ASSIGNMENT]} candidates={[]} canManage={false} />);
    expect(screen.queryByRole("button", { name: "Retirer" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Rôle client de/)).not.toBeInTheDocument();
  });

  it("calls updateClientAssignmentAction when the role select changes", async () => {
    const user = userEvent.setup();
    render(<ClientAssignmentsSection clientId="client-1" assignments={[ASSIGNMENT]} candidates={[]} canManage={true} />);

    await user.selectOptions(screen.getByLabelText("Rôle client de Jane Doe"), "CLIENT_MANAGER");

    expect(updateClientAssignmentAction).toHaveBeenCalledWith("client-1", "assignment-1", "CLIENT_MANAGER");
  });

  it("calls removeClientAssignmentAction when Retirer is clicked", async () => {
    const user = userEvent.setup();
    render(<ClientAssignmentsSection clientId="client-1" assignments={[ASSIGNMENT]} candidates={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Retirer" }));

    expect(removeClientAssignmentAction).toHaveBeenCalledWith("client-1", "assignment-1");
  });

  it("never proposes a candidate already assigned, and shows a message when everyone is already assigned", () => {
    render(<ClientAssignmentsSection clientId="client-1" assignments={[ASSIGNMENT]} candidates={[]} canManage={true} />);
    expect(screen.getByText("Tous les membres de l'organisation sont déjà affectés à ce client.")).toBeInTheDocument();
  });
});
