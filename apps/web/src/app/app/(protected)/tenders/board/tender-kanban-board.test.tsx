import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";
import { TenderKanbanBoard } from "./tender-kanban-board";
import type { TenderBoard } from "../../../../../lib/tenders-types";

let capturedOnDragEnd: ((event: DragEndEvent) => void | Promise<void>) | undefined;

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (e: DragEndEvent) => void }) => {
      capturedOnDragEnd = onDragEnd;
      return children;
    },
  };
});

const changeTenderStatusDirectAction = vi.fn(async (_tenderId: string, _status: string) => ({}) as { error?: string });

vi.mock("../../../actions", () => ({
  changeTenderStatusDirectAction: (tenderId: string, status: string) => changeTenderStatusDirectAction(tenderId, status),
}));

function buildBoard(): TenderBoard {
  return {
    columns: [
      {
        status: "DRAFT",
        totalCount: 1,
        items: [
          {
            id: "tender-1",
            clientAccountId: "client-1",
            title: "Marche de nettoyage",
            status: "DRAFT",
            readinessScore: 80,
            readinessStatus: "IN_PROGRESS",
            openRisksCount: 0,
            incompleteChecklistCount: 0,
            overdue: false,
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      { status: "IN_ANALYSIS", totalCount: 0, items: [] },
      { status: "WON", totalCount: 0, items: [] },
    ],
  };
}

describe("TenderKanbanBoard", () => {
  it("renders one column per status with the real total count and cards", () => {
    render(<TenderKanbanBoard board={buildBoard()} canDrag={true} />);

    expect(screen.getByText("Brouillon")).toBeInTheDocument();
    expect(screen.getByText("En analyse")).toBeInTheDocument();
    expect(screen.getByText("Marche de nettoyage")).toBeInTheDocument();
    expect(screen.getAllByText("Aucun dossier").length).toBeGreaterThan(0);
  });

  it("shows a read-only notice and disables the drag affordance when the actor cannot change status", () => {
    render(<TenderKanbanBoard board={buildBoard()} canDrag={false} />);

    expect(screen.getAllByText(/Lecture seule/).length).toBeGreaterThan(0);
  });

  it("moves the card optimistically and confirms it when the backend accepts the transition", async () => {
    changeTenderStatusDirectAction.mockResolvedValueOnce({});
    render(<TenderKanbanBoard board={buildBoard()} canDrag={true} />);

    await act(async () => {
      await capturedOnDragEnd!({ active: { id: "tender-1" }, over: { id: "IN_ANALYSIS" } } as unknown as DragEndEvent);
    });

    expect(changeTenderStatusDirectAction).toHaveBeenCalledWith("tender-1", "IN_ANALYSIS");
    expect(screen.getByText("Marche de nettoyage")).toBeInTheDocument();
    const inAnalysisHeading = screen.getByText("En analyse");
    const inAnalysisColumn = inAnalysisHeading.closest("div")?.parentElement;
    expect(inAnalysisColumn).toHaveTextContent("Marche de nettoyage");
  });

  it("rolls back the card to its original column when the backend rejects the transition", async () => {
    changeTenderStatusDirectAction.mockResolvedValueOnce({ error: "Cannot transition tender from DRAFT to WON." });
    render(<TenderKanbanBoard board={buildBoard()} canDrag={true} />);

    await act(async () => {
      await capturedOnDragEnd!({ active: { id: "tender-1" }, over: { id: "WON" } } as unknown as DragEndEvent);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Cannot transition tender from DRAFT to WON.");
    expect(screen.getByText("Marche de nettoyage")).toBeInTheDocument();
  });
});
