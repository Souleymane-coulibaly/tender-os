import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSection } from "./workspace-section";
import type { ApprovalRequest, Comment, Task, TenderActivityPage, TenderParticipant } from "../../../../../../lib/workspace-types";

const addParticipantAction = vi.fn(async (_tenderId: string, _input: unknown) => ({}));
const removeParticipantAction = vi.fn(async (_tenderId: string, _participantId: string) => ({}));
const createTaskAction = vi.fn(async (_tenderId: string, _input: unknown) => ({}));
const assignTaskAction = vi.fn(async (_tenderId: string, _taskId: string, _assigneeId: string | undefined) => ({}));
const changeTaskStatusAction = vi.fn(async (_tenderId: string, _taskId: string, _status: string) => ({}));
const createCommentAction = vi.fn(async (_tenderId: string, _input: unknown) => ({}));
const fetchComments = vi.fn(async (_tenderId: string, _entityType: string, _entityId: string): Promise<Comment[]> => []);
const requestApprovalAction = vi.fn(async (_tenderId: string, _input: unknown) => ({}));
const approveApprovalAction = vi.fn(async (_tenderId: string, _approvalId: string) => ({}));
const requestApprovalChangesAction = vi.fn(async (_tenderId: string, _approvalId: string) => ({}));
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

vi.mock("../../../../workspace-actions", () => ({
  addParticipantAction: (tenderId: string, input: unknown) => addParticipantAction(tenderId, input),
  removeParticipantAction: (tenderId: string, participantId: string) => removeParticipantAction(tenderId, participantId),
  createTaskAction: (tenderId: string, input: unknown) => createTaskAction(tenderId, input),
  assignTaskAction: (tenderId: string, taskId: string, assigneeId: string | undefined) => assignTaskAction(tenderId, taskId, assigneeId),
  changeTaskStatusAction: (tenderId: string, taskId: string, status: string) => changeTaskStatusAction(tenderId, taskId, status),
  createCommentAction: (tenderId: string, input: unknown) => createCommentAction(tenderId, input),
  fetchComments: (tenderId: string, entityType: string, entityId: string) => fetchComments(tenderId, entityType, entityId),
  requestApprovalAction: (tenderId: string, input: unknown) => requestApprovalAction(tenderId, input),
  approveApprovalAction: (tenderId: string, approvalId: string) => approveApprovalAction(tenderId, approvalId),
  requestApprovalChangesAction: (tenderId: string, approvalId: string) => requestApprovalChangesAction(tenderId, approvalId),
}));

const MEMBERS = [
  { userId: "alice", email: "alice@test.com", displayName: "Alice Martin" },
  { userId: "karim", email: "karim@test.com", displayName: "Karim Belkacem" },
];

const PARTICIPANTS: TenderParticipant[] = [
  { id: "p-1", tenderId: "tender-1", userId: "karim", role: "TECHNICAL_WRITER", addedBy: "alice", addedAt: "2026-01-01T00:00:00.000Z" },
];

const TASKS: Task[] = [
  {
    id: "task-1",
    tenderId: "tender-1",
    title: "Récupérer l'attestation fiscale",
    status: "TODO",
    priority: "HIGH",
    assigneeId: "karim",
    createdBy: "alice",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const APPROVALS: ApprovalRequest[] = [
  { id: "approval-1", tenderId: "tender-1", entityType: "TASK", entityId: "task-1", requestedBy: "karim", reviewerId: "alice", status: "PENDING", requestedAt: "2026-01-02T00:00:00.000Z" },
];

const ACTIVITY: TenderActivityPage = {
  items: [{ id: "activity-1", tenderId: "tender-1", actorId: "alice", type: "TASK_CREATED", summary: "Tâche créée : « Récupérer l'attestation fiscale ».", createdAt: "2026-01-01T00:00:00.000Z" }],
  nextCursor: null,
};

function renderSection(overrides: Partial<Parameters<typeof WorkspaceSection>[0]> = {}) {
  return render(
    <WorkspaceSection
      tenderId="tender-1"
      initialParticipants={PARTICIPANTS}
      initialTasks={TASKS}
      initialApprovals={APPROVALS}
      initialActivity={ACTIVITY}
      members={MEMBERS}
      actorRole="BID_MANAGER"
      actorId="alice"
      {...overrides}
    />,
  );
}

describe("WorkspaceSection", () => {
  it("shows the summary header with team/task/approval counts", () => {
    renderSection();

    expect(screen.getByText("Équipe : 1 membre(s)")).toBeInTheDocument();
    expect(screen.getByText("Tâches : 1")).toBeInTheDocument();
    expect(screen.getByText("1 validation(s) en attente")).toBeInTheDocument();
  });

  it("resolves participant/task/approval user ids to real display names, never raw UUIDs", () => {
    renderSection();

    expect(screen.getAllByText("Karim Belkacem").length).toBeGreaterThan(0);
    expect(screen.getByText(/Responsable : Karim Belkacem/)).toBeInTheDocument();
    expect(screen.queryByText("karim")).not.toBeInTheDocument();
  });

  it("lets a manager remove a participant", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Retirer" }));

    expect(removeParticipantAction).toHaveBeenCalledWith("tender-1", "p-1");
    // `onClick` (contrairement à `<form action>`) ne revalide jamais automatiquement le rendu
    // serveur — sans ce refresh explicite, le participant retiré resterait affiché jusqu'au
    // prochain rechargement manuel de la page.
    expect(refreshMock).toHaveBeenCalled();
  });

  it("only shows the add-participant form for org members not yet an active participant", () => {
    renderSection();

    // Karim est déjà participant actif : seule Alice apparaît comme candidate.
    // Le bouton "Ajouter" existe aussi sur le formulaire de création de tâche —
    // celui du formulaire participant est le premier dans l'ordre du DOM.
    const addParticipantButton = screen.getAllByRole("button", { name: "Ajouter" })[0];
    const addForm = addParticipantButton?.closest("form");
    expect(addForm).not.toBeNull();
    expect(addForm!.textContent).toContain("Alice Martin");
    expect(addForm!.textContent).not.toContain("Karim Belkacem");
  });

  it("lets the reviewer approve a PENDING request assigned to them, never someone else", async () => {
    const user = userEvent.setup();
    renderSection({ actorId: "alice" });

    await user.click(screen.getByRole("button", { name: "Valider" }));

    expect(approveApprovalAction).toHaveBeenCalledWith("tender-1", "approval-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("never shows the approve/request-changes buttons to a user who is not the assigned reviewer", () => {
    renderSection({ actorId: "someone-else" });

    expect(screen.queryByRole("button", { name: "Valider" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Demander des modifications" })).not.toBeInTheDocument();
  });

  it("never presents an approval as a legal/electronic signature (mission §56)", () => {
    renderSection();

    // \b évite un faux positif sur "assignée" (options de responsable), qui contient "signée".
    expect(screen.queryByText(/\bsigné\b/i)).not.toBeInTheDocument();
    expect(screen.getByText("En attente de validation")).toBeInTheDocument();
  });

  it("changes a task status via the dedicated action, calling changeTaskStatusAction", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.selectOptions(screen.getByDisplayValue("À faire"), "IN_PROGRESS");

    expect(changeTaskStatusAction).toHaveBeenCalledWith("tender-1", "task-1", "IN_PROGRESS");
  });

  it("renders the activity feed with resolved actor names, most recent semantics preserved", () => {
    renderSection();

    expect(screen.getByText(/Tâche créée/)).toBeInTheDocument();
    expect(screen.getAllByText("Alice Martin").length).toBeGreaterThan(0);
  });

  it("loads existing comments on demand and lets the user post a new one that mentions a real participant, never free-text @text (mission §22/§23)", async () => {
    const user = userEvent.setup();
    fetchComments.mockResolvedValueOnce([
      { id: "c-1", tenderId: "tender-1", entityType: "TASK", entityId: "task-1", authorId: "karim", body: "Déjà en cours", createdAt: "2026-01-01T00:00:00.000Z", mentionedUserIds: [] },
    ]);
    renderSection();

    await user.click(screen.getByRole("button", { name: "Commenter" }));
    expect(fetchComments).toHaveBeenCalledWith("tender-1", "TASK", "task-1");
    expect(await screen.findByText(/Déjà en cours/)).toBeInTheDocument();

    fetchComments.mockResolvedValueOnce([]);
    await user.type(screen.getByPlaceholderText("Nouveau commentaire..."), "Peux-tu valider ceci ?");
    await user.selectOptions(screen.getByDisplayValue("Mentionner (optionnel)"), "karim");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    expect(createCommentAction).toHaveBeenCalledWith("tender-1", {
      entityType: "TASK",
      entityId: "task-1",
      body: "Peux-tu valider ceci ?",
      mentionedUserIds: ["karim"],
    });
  });
});
