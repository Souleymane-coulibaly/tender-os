import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiSuggestionsSection } from "./ai-suggestions-section";
import type { AiSuggestion } from "../../../../../lib/ai-suggestion-types";

const fetchTenderSuggestions = vi.fn(async (_tenderId: string) => [] as AiSuggestion[]);
const mapSuggestionsAction = vi.fn(async (_tenderId: string) => ({}) as { result?: unknown; error?: string });
const applySuggestionAction = vi.fn(async (_tenderId: string, _id: string, _conflictResolution?: string) => ({}) as { error?: string; conflict?: boolean });
const rejectSuggestionAction = vi.fn(async (_tenderId: string, _id: string) => ({}) as { error?: string });

vi.mock("../../../ai-suggestion-actions", () => ({
  fetchTenderSuggestions: (tenderId: string) => fetchTenderSuggestions(tenderId),
  mapSuggestionsAction: (tenderId: string) => mapSuggestionsAction(tenderId),
  applySuggestionAction: (tenderId: string, id: string, conflictResolution?: string) => applySuggestionAction(tenderId, id, conflictResolution),
  rejectSuggestionAction: (tenderId: string, id: string) => rejectSuggestionAction(tenderId, id),
}));

function baseSuggestion(overrides: Partial<AiSuggestion> = {}): AiSuggestion {
  return {
    id: "suggestion-1",
    organizationId: "org-1",
    entityType: "TENDER_FIELD",
    fieldName: "description",
    parentTenderId: "tender-1",
    proposedValue: "Description proposée par l'IA.",
    confidence: 0.85,
    status: "PENDING",
    createdByProcess: "analysis.finding_mapper",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("AiSuggestionsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty state and never shows action buttons without canManage", () => {
    render(<AiSuggestionsSection tenderId="tender-1" initialSuggestions={[]} canManage={false} />);

    expect(screen.getByText("Aucune suggestion en attente.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Générer les suggestions" })).not.toBeInTheDocument();
  });

  it("renders a pending suggestion with its field, value and confidence", () => {
    render(<AiSuggestionsSection tenderId="tender-1" initialSuggestions={[baseSuggestion()]} canManage={true} />);

    expect(screen.getByText("Fiche de l'appel d'offres")).toBeInTheDocument();
    expect(screen.getByText("description")).toBeInTheDocument();
    expect(screen.getByText("Description proposée par l'IA.")).toBeInTheDocument();
    expect(screen.getByText(/confiance 85%/)).toBeInTheDocument();
  });

  it("labels a creation-type suggestion distinctly instead of showing the raw sentinel field", () => {
    render(
      <AiSuggestionsSection
        tenderId="tender-1"
        initialSuggestions={[baseSuggestion({ entityType: "TENDER_RISK", fieldName: "__create__", proposedValue: { title: "Délai court", severity: "HIGH" } })]}
        canManage={true}
      />,
    );

    expect(screen.getByText("Nouvelle entrée")).toBeInTheDocument();
    expect(screen.queryByText("__create__")).not.toBeInTheDocument();
  });

  it("calls mapSuggestionsAction then refreshes the list when Générer les suggestions is clicked", async () => {
    const user = userEvent.setup();
    mapSuggestionsAction.mockResolvedValueOnce({ result: { analysisVersion: 1, alreadyMapped: false, createdCount: 2, skippedCount: 0 } });
    fetchTenderSuggestions.mockResolvedValueOnce([baseSuggestion()]);
    render(<AiSuggestionsSection tenderId="tender-1" initialSuggestions={[]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Générer les suggestions" }));

    expect(mapSuggestionsAction).toHaveBeenCalledWith("tender-1");
    expect(await screen.findByText(/2 suggestion\(s\) générée\(s\)/)).toBeInTheDocument();
    expect(await screen.findByText("Description proposée par l'IA.")).toBeInTheDocument();
  });

  it("applies a suggestion directly when there is no conflict, then removes it from the list", async () => {
    const user = userEvent.setup();
    applySuggestionAction.mockResolvedValueOnce({});
    fetchTenderSuggestions.mockResolvedValueOnce([]);
    render(<AiSuggestionsSection tenderId="tender-1" initialSuggestions={[baseSuggestion()]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Appliquer" }));

    expect(applySuggestionAction).toHaveBeenCalledWith("tender-1", "suggestion-1", undefined);
    expect(await screen.findByText("Aucune suggestion en attente.")).toBeInTheDocument();
  });

  it("reveals an explicit conflict-resolution choice when apply reports a conflict, never a silent overwrite", async () => {
    const user = userEvent.setup();
    applySuggestionAction.mockResolvedValueOnce({ conflict: true });
    render(<AiSuggestionsSection tenderId="tender-1" initialSuggestions={[baseSuggestion()]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Appliquer" }));

    expect(await screen.findByText(/Cette cible porte déjà une valeur/)).toBeInTheDocument();
    const replaceButton = screen.getByRole("button", { name: "Remplacer par la proposition IA" });

    applySuggestionAction.mockResolvedValueOnce({});
    fetchTenderSuggestions.mockResolvedValueOnce([]);
    await user.click(replaceButton);

    expect(applySuggestionAction).toHaveBeenLastCalledWith("tender-1", "suggestion-1", "REPLACE");
  });

  it("rejects a suggestion and refreshes the list", async () => {
    const user = userEvent.setup();
    rejectSuggestionAction.mockResolvedValueOnce({});
    fetchTenderSuggestions.mockResolvedValueOnce([]);
    render(<AiSuggestionsSection tenderId="tender-1" initialSuggestions={[baseSuggestion()]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Rejeter" }));

    expect(rejectSuggestionAction).toHaveBeenCalledWith("tender-1", "suggestion-1");
    expect(await screen.findByText("Aucune suggestion en attente.")).toBeInTheDocument();
  });

  it("surfaces a friendly error message when an action fails", async () => {
    const user = userEvent.setup();
    applySuggestionAction.mockResolvedValueOnce({ error: "Vous n'avez pas les droits nécessaires pour cette action." });
    render(<AiSuggestionsSection tenderId="tender-1" initialSuggestions={[baseSuggestion()]} canManage={true} />);

    await user.click(screen.getByRole("button", { name: "Appliquer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Vous n'avez pas les droits nécessaires pour cette action.");
  });
});
