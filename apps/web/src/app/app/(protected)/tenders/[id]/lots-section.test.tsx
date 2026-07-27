import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LotsSection } from "./lots-section";
import type { TenderLot } from "../../../../../lib/tenders-types";

const createLotAction = vi.fn(async (_tenderId: string, _prevState: unknown, _formData: FormData) => ({}));
const updateLotAction = vi.fn(
  async (_tenderId: string, _lotId: string, _prevState: unknown, _formData: FormData) => ({}),
);
const deleteLotAction = vi.fn(async (_tenderId: string, _lotId: string) => ({}));
const restoreLotAction = vi.fn(async (_tenderId: string, _lotId: string) => ({}));
const reorderLotsAction = vi.fn(async (_tenderId: string, _lotIds: string[]) => ({}));

vi.mock("../../../actions", () => ({
  createLotAction: (tenderId: string, prevState: unknown, formData: FormData) =>
    createLotAction(tenderId, prevState, formData),
  updateLotAction: (tenderId: string, lotId: string, prevState: unknown, formData: FormData) =>
    updateLotAction(tenderId, lotId, prevState, formData),
  deleteLotAction: (tenderId: string, lotId: string) => deleteLotAction(tenderId, lotId),
  restoreLotAction: (tenderId: string, lotId: string) => restoreLotAction(tenderId, lotId),
  reorderLotsAction: (tenderId: string, lotIds: string[]) => reorderLotsAction(tenderId, lotIds),
}));

const lots: TenderLot[] = [
  { id: "lot-1", tenderId: "tender-1", lotNumber: "01", title: "Lot travaux", displayOrder: 0, createdAt: "", updatedAt: "" },
  { id: "lot-2", tenderId: "tender-1", lotNumber: "02", title: "Lot equipements", displayOrder: 1, createdAt: "", updatedAt: "" },
];

describe("LotsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists existing lots with their number and title", () => {
    render(<LotsSection tenderId="tender-1" lots={lots} canManage={true} />);

    expect(screen.getByText("Lot 01 — Lot travaux")).toBeInTheDocument();
    expect(screen.getByText("Lot 02 — Lot equipements")).toBeInTheDocument();
  });

  it("shows an empty state when there are no lots", () => {
    render(<LotsSection tenderId="tender-1" lots={[]} canManage={true} />);

    expect(screen.getByText("Aucun lot.")).toBeInTheDocument();
  });

  it("switches a row to an edit form and submits the update", async () => {
    const user = userEvent.setup();
    render(<LotsSection tenderId="tender-1" lots={lots} canManage={true} />);

    await user.click(screen.getAllByRole("button", { name: "Modifier" })[0]!);
    const titleInput = screen.getByDisplayValue("Lot travaux");
    await user.clear(titleInput);
    await user.type(titleInput, "Lot travaux revise");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(updateLotAction).toHaveBeenCalledWith("tender-1", "lot-1", {}, expect.any(FormData));
  });

  it("disables the up arrow on the first row and the down arrow on the last row", () => {
    render(<LotsSection tenderId="tender-1" lots={lots} canManage={true} />);

    expect(screen.getAllByLabelText("Monter")[0]).toBeDisabled();
    expect(screen.getAllByLabelText("Descendre")[1]).toBeDisabled();
  });

  it("calls reorderLotsAction with the full swapped id list when moving a lot down", async () => {
    const user = userEvent.setup();
    render(<LotsSection tenderId="tender-1" lots={lots} canManage={true} />);

    await user.click(screen.getAllByLabelText("Descendre")[0]!);

    expect(reorderLotsAction).toHaveBeenCalledWith("tender-1", ["lot-2", "lot-1"]);
  });

  it("shows an undo banner after deleting a lot and restores it on demand", async () => {
    const user = userEvent.setup();
    render(<LotsSection tenderId="tender-1" lots={lots} canManage={true} />);

    await user.click(screen.getAllByRole("button", { name: "Supprimer" })[0]!);

    expect(deleteLotAction).toHaveBeenCalledWith("tender-1", "lot-1");
    expect(await screen.findByText(/Lot travaux.*supprime/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(restoreLotAction).toHaveBeenCalledWith("tender-1", "lot-1");
  });

  describe("read-only role (AUDIT-005)", () => {
    it("hides create/edit/delete/reorder actions when canManage is false", () => {
      render(<LotsSection tenderId="tender-1" lots={lots} canManage={false} />);

      expect(screen.getByText("Lot 01 — Lot travaux")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Ajouter" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Modifier" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Monter")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Descendre")).not.toBeInTheDocument();
    });

    it("never calls any mutation action when canManage is false, even if a lot was just deleted upstream", () => {
      render(<LotsSection tenderId="tender-1" lots={lots} canManage={false} />);

      expect(createLotAction).not.toHaveBeenCalled();
      expect(updateLotAction).not.toHaveBeenCalled();
      expect(deleteLotAction).not.toHaveBeenCalled();
      expect(restoreLotAction).not.toHaveBeenCalled();
      expect(reorderLotsAction).not.toHaveBeenCalled();
    });
  });
});
