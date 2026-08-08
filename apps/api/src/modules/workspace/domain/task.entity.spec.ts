import { describe, expect, it } from "vitest";
import { Task, TaskPriority, TaskStatus } from "./task.entity";

describe("Task", () => {
  const occurredAt = new Date("2026-01-01T00:00:00.000Z");

  function create(overrides: Partial<Parameters<typeof Task.create>[0]> = {}): Task {
    return Task.create({
      id: "task-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      title: "Récupérer l'attestation fiscale",
      createdBy: "user-1",
      occurredAt,
      ...overrides,
    });
  }

  it("always starts TODO regardless of origin, never auto-assigned", () => {
    const task = create();

    expect(task.status).toBe(TaskStatus.Todo);
    expect(task.assigneeId).toBeUndefined();
    expect(task.priority).toBe(TaskPriority.Medium);
  });

  it("links to a ChecklistItem without ever mirroring its state (Task DONE ≠ ChecklistItem VALIDATED)", () => {
    const task = create({ checklistItemId: "checklist-item-1" });

    expect(task.checklistItemId).toBe("checklist-item-1");
    // La tâche ne connaît QUE son propre statut — aucune méthode/propriété n'expose ni ne dérive
    // l'état du ChecklistItem lié.
    expect(task.status).toBe(TaskStatus.Todo);
  });

  it("assign() sets the assignee without touching status", () => {
    const task = create();
    const later = new Date("2026-01-02T00:00:00.000Z");

    task.assign("assignee-1", later);

    expect(task.assigneeId).toBe("assignee-1");
    expect(task.status).toBe(TaskStatus.Todo);
    expect(task.updatedAt).toBe(later);
  });

  it("complete() sets status DONE, completedBy/completedAt", () => {
    const task = create();
    const completedAt = new Date("2026-01-05T00:00:00.000Z");

    task.complete("actor-1", completedAt);

    expect(task.status).toBe(TaskStatus.Done);
    expect(task.completedBy).toBe("actor-1");
    expect(task.completedAt).toBe(completedAt);
    expect(task.isTerminal).toBe(true);
  });

  it("reopen() resets to TODO and clears completion fields — never silent (caller records history)", () => {
    const task = create();
    task.complete("actor-1", new Date("2026-01-05T00:00:00.000Z"));

    const reopenedAt = new Date("2026-01-06T00:00:00.000Z");
    task.reopen("actor-2", reopenedAt);

    expect(task.status).toBe(TaskStatus.Todo);
    expect(task.completedBy).toBeUndefined();
    expect(task.completedAt).toBeUndefined();
    expect(task.isTerminal).toBe(false);
  });

  it("changeStatus(CANCELLED) is terminal and clears completion fields", () => {
    const task = create();

    task.changeStatus(TaskStatus.Cancelled, "actor-1", new Date());

    expect(task.isTerminal).toBe(true);
    expect(task.completedBy).toBeUndefined();
  });

  it("update() only touches the provided fields", () => {
    const task = create({ description: "desc", priority: TaskPriority.Low });
    const later = new Date("2026-01-02T00:00:00.000Z");

    task.update({ priority: TaskPriority.Urgent }, later);

    expect(task.priority).toBe(TaskPriority.Urgent);
    expect(task.description).toBe("desc");
    expect(task.title).toBe("Récupérer l'attestation fiscale");
  });

  it("changeLot() reassigns the lot (null clears it back to Tender-global)", () => {
    const task = create({ lotId: "lot-1" });

    task.changeLot(undefined, new Date());

    expect(task.lotId).toBeUndefined();
  });
});
