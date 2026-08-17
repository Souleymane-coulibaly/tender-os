import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog";

/**
 * jsdom n'implémente pas `HTMLDialogElement.showModal()`/`close()` (limitation connue, throw "Not
 * implemented" sinon) — mocké ici pour tester la LOGIQUE de synchronisation React → élément natif
 * (ce que `Dialog` fait réellement), jamais le comportement du navigateur lui-même.
 */
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
});

describe("Dialog", () => {
  it("BLOQUANT — calls showModal() when open becomes true, close() when open becomes false", () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => {}} title="Confirmer">
        Contenu
      </Dialog>,
    );
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();

    rerender(
      <Dialog open onClose={() => {}} title="Confirmer">
        Contenu
      </Dialog>,
    );
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);

    rerender(
      <Dialog open={false} onClose={() => {}} title="Confirmer">
        Contenu
      </Dialog>,
    );
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is activated", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Confirmer la suppression">
        Cette action est irréversible.
      </Dialog>,
    );

    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("associates the visible title with the dialog via aria-labelledby (accessible name)", () => {
    render(
      <Dialog open onClose={() => {}} title="Archiver le document">
        Contenu
      </Dialog>,
    );
    // getByRole("dialog") vérifie que le nom accessible calculé correspond bien au titre affiché —
    // preuve que `aria-labelledby`/`useId()` sont correctement câblés, jamais juste "visuellement".
    expect(screen.getByRole("dialog", { name: "Archiver le document" })).toBeInTheDocument();
  });
});
