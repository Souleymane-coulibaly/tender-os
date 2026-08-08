import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChecklistSection } from "./checklist-section";
import type { ChecklistItem, ChecklistProgress, TenderLot } from "../../../../../lib/tenders-types";

const changeChecklistItemStatusAction = vi.fn(async (_tenderId: string, _itemId: string, _status: string) => ({}));
const validateChecklistItemAction = vi.fn(async (_tenderId: string, _itemId: string) => ({}));
const markChecklistItemNotApplicableAction = vi.fn(async (_tenderId: string, _itemId: string) => ({}));
const findChecklistItemDocumentMatchesAction = vi.fn(async (_tenderId: string, _itemId: string) => ({ result: { status: "NO_MATCH", candidates: [] } }));
const attachChecklistItemDocumentAction = vi.fn(async (_tenderId: string, _itemId: string, _input: unknown) => ({}));
const detachChecklistItemDocumentAction = vi.fn(async (_tenderId: string, _itemId: string) => ({}));
const reconcileChecklistWithNewAnalysisAction = vi.fn(async (_tenderId: string) => ({ result: { newRequirementSuggestionsCreated: 0, possibleChangeSuggestionsCreated: 0, possibleRemovals: [] } }));
const createTaskFromChecklistItemAction = vi.fn(async (_tenderId: string, _input: unknown) => ({}));
const promoteChecklistItemToKnowledgeAction = vi.fn(async (_tenderId: string, _itemId: string, _input: unknown) => ({ knowledgeEntryId: "entry-1" }));

vi.mock("../../../workspace-actions", () => ({
  createTaskFromChecklistItemAction: (tenderId: string, input: unknown) => createTaskFromChecklistItemAction(tenderId, input),
}));

vi.mock("../../../actions", () => ({
  createChecklistItemAction: {
    bind: () => vi.fn(async (_prevState: unknown, _formData: FormData) => ({})),
  },
  changeChecklistItemStatusAction: (tenderId: string, itemId: string, status: string) => changeChecklistItemStatusAction(tenderId, itemId, status),
  validateChecklistItemAction: (tenderId: string, itemId: string) => validateChecklistItemAction(tenderId, itemId),
  markChecklistItemNotApplicableAction: (tenderId: string, itemId: string) => markChecklistItemNotApplicableAction(tenderId, itemId),
  findChecklistItemDocumentMatchesAction: (tenderId: string, itemId: string) => findChecklistItemDocumentMatchesAction(tenderId, itemId),
  attachChecklistItemDocumentAction: (tenderId: string, itemId: string, input: unknown) => attachChecklistItemDocumentAction(tenderId, itemId, input),
  detachChecklistItemDocumentAction: (tenderId: string, itemId: string) => detachChecklistItemDocumentAction(tenderId, itemId),
  reconcileChecklistWithNewAnalysisAction: (tenderId: string) => reconcileChecklistWithNewAnalysisAction(tenderId),
  promoteChecklistItemToKnowledgeAction: (tenderId: string, itemId: string, input: unknown) => promoteChecklistItemToKnowledgeAction(tenderId, itemId, input),
}));

function baseItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: "item-1",
    tenderId: "tender-1",
    title: "Fournir attestation",
    required: true,
    status: "TODO",
    displayOrder: 1,
    type: "ADMINISTRATIVE_DOCUMENT",
    requirementLevel: "MANDATORY",
    criticality: "MEDIUM",
    complianceStatus: "TO_REVIEW",
    documentStatus: "MISSING",
    origin: "MANUAL",
    subjectType: "CANDIDATE",
    documentMatchStatus: "NOT_SEARCHED",
    ...overrides,
  };
}

const ITEMS: ChecklistItem[] = [baseItem()];
const LOTS: TenderLot[] = [];
const PROGRESS: ChecklistProgress = {
  global: { totalApplicable: 1, ready: 0, validated: 0, missing: 1, blockingMissing: 0, expired: 0, toReview: 1 },
  byLot: {},
};

describe("ChecklistSection", () => {
  it("shows an empty state when there are no checklist items", () => {
    render(<ChecklistSection tenderId="tender-1" items={[]} lots={LOTS} progress={null} />);

    expect(screen.getByText("Aucun element de checklist.")).toBeInTheDocument();
  });

  it("lists existing items and lets the status be changed", async () => {
    const user = userEvent.setup();
    render(<ChecklistSection tenderId="tender-1" items={ITEMS} lots={LOTS} progress={PROGRESS} />);

    expect(screen.getByText("Fournir attestation")).toBeInTheDocument();

    await user.selectOptions(screen.getByDisplayValue("A faire"), "COMPLETED");

    expect(changeChecklistItemStatusAction).toHaveBeenCalledWith("tender-1", "item-1", "COMPLETED");
  });

  it("has an inline form to add a new checklist item", () => {
    render(<ChecklistSection tenderId="tender-1" items={[]} lots={LOTS} progress={null} />);

    expect(screen.getByPlaceholderText("Nouvel element...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeInTheDocument();
  });

  it("shows the progress summary when provided", () => {
    render(<ChecklistSection tenderId="tender-1" items={ITEMS} lots={LOTS} progress={PROGRESS} />);

    // 0 validé sur 1 applicable dans la fixture PROGRESS ci-dessus.
    expect(screen.getByText("0% prête")).toBeInTheDocument();
  });

  it("lets the user validate an item, calling the dedicated action (never the generic status action)", async () => {
    const user = userEvent.setup();
    render(<ChecklistSection tenderId="tender-1" items={ITEMS} lots={LOTS} progress={PROGRESS} />);

    await user.click(screen.getByRole("button", { name: "Valider" }));

    expect(validateChecklistItemAction).toHaveBeenCalledWith("tender-1", "item-1");
  });

  it("lets the user mark an item not applicable", async () => {
    const user = userEvent.setup();
    render(<ChecklistSection tenderId="tender-1" items={ITEMS} lots={LOTS} progress={PROGRESS} />);

    await user.click(screen.getByRole("button", { name: "Non applicable" }));

    expect(markChecklistItemNotApplicableAction).toHaveBeenCalledWith("tender-1", "item-1");
  });

  it("never shows an 'attach' affordance for a match without an explicit search first (no silent association)", () => {
    render(<ChecklistSection tenderId="tender-1" items={ITEMS} lots={LOTS} progress={PROGRESS} />);

    expect(screen.queryByRole("button", { name: "Associer" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rechercher un document" })).toBeInTheDocument();
  });

  it("creates a task from a checklist item, prefilling title/priority but never auto-assigning a responsible (mission §14)", async () => {
    const user = userEvent.setup();
    render(<ChecklistSection tenderId="tender-1" items={[baseItem({ criticality: "BLOCKING" })]} lots={LOTS} progress={PROGRESS} />);

    await user.click(screen.getByRole("button", { name: "Créer une tâche" }));

    // Titre préempli depuis l'item, priorité suggérée depuis la criticité (BLOCKING -> URGENT),
    // mais toujours modifiable et jamais soumis automatiquement.
    expect(screen.getByDisplayValue("Fournir attestation")).toBeInTheDocument();
    expect(screen.getByDisplayValue("URGENT")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Créer" }));

    expect(createTaskFromChecklistItemAction).toHaveBeenCalledWith(
      "tender-1",
      expect.objectContaining({ title: "Fournir attestation", priority: "URGENT", checklistItemId: "item-1" }),
    );
    const [, payload] = createTaskFromChecklistItemAction.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).not.toHaveProperty("assigneeId");

    expect(await screen.findByText("Tâche créée — voir l'onglet Workspace.")).toBeInTheDocument();
  });

  it("never offers 'Ajouter à la bibliothèque' for an item that is not yet VALIDATED", () => {
    render(<ChecklistSection tenderId="tender-1" items={[baseItem({ complianceStatus: "TO_REVIEW" })]} lots={LOTS} progress={PROGRESS} />);
    expect(screen.queryByRole("button", { name: "Ajouter à la bibliothèque" })).not.toBeInTheDocument();
  });

  it("promotes a VALIDATED checklist item to the Knowledge Base, prefilling the title but requiring an explicit category choice", async () => {
    const user = userEvent.setup();
    render(<ChecklistSection tenderId="tender-1" items={[baseItem({ complianceStatus: "VALIDATED" })]} lots={LOTS} progress={PROGRESS} />);

    await user.click(screen.getByRole("button", { name: "Ajouter à la bibliothèque" }));
    expect(screen.getByDisplayValue("Fournir attestation")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(promoteChecklistItemToKnowledgeAction).toHaveBeenCalledWith(
      "tender-1",
      "item-1",
      expect.objectContaining({ title: "Fournir attestation", category: "ADMINISTRATIVE" }),
    );
    expect(await screen.findByText("Ajoutée à la bibliothèque — voir l'entrée")).toBeInTheDocument();
  });
});
