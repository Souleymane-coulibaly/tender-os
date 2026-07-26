import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ArchiveButton } from "./archive-button";

vi.mock("../../../actions", () => ({
  archiveTenderAction: vi.fn(async (_tenderId: string, _prevState: unknown, _formData: FormData) => ({})),
}));

describe("ArchiveButton", () => {
  it("shows an Archiver button that reveals a confirmation step before submitting", async () => {
    const user = userEvent.setup();
    render(<ArchiveButton tenderId="tender-1" />);

    expect(screen.getByRole("button", { name: "Archiver" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archiver" }));

    expect(screen.getByText(/pourra plus etre modifie normalement/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmer l'archivage" })).toBeInTheDocument();
  });

  it("returns to the initial state when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    render(<ArchiveButton tenderId="tender-1" />);

    await user.click(screen.getByRole("button", { name: "Archiver" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.getByRole("button", { name: "Archiver" })).toBeInTheDocument();
  });
});
