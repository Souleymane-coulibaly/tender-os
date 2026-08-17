import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./toast";

function TriggerButton({ title, tone }: { title: string; tone?: "success" | "danger" }) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show({ title, tone })}>
      Déclencher
    </button>
  );
}

describe("Toast", () => {
  it("BLOQUANT — useToast() throws outside of a ToastProvider (never a silent no-op)", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Orphan() {
      useToast();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow("useToast must be used within a <ToastProvider>.");
    consoleError.mockRestore();
  });

  it("show() renders a toast with the correct title and dismiss button", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TriggerButton title="Modification enregistrée" tone="success" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Déclencher" }));
    expect(screen.getByText("Modification enregistrée")).toBeInTheDocument();
  });

  it("clicking the close button dismisses the toast immediately", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TriggerButton title="Erreur réseau" tone="danger" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Déclencher" }));
    expect(screen.getByText("Erreur réseau")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByText("Erreur réseau")).not.toBeInTheDocument();
  });

  it("auto-dismisses after the configured delay", () => {
    // `fireEvent` (synchrone) plutôt que `userEvent` (délais internes basés sur de vrais timers) —
    // motif standard pour combiner interaction + `vi.useFakeTimers()` sans blocage.
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <TriggerButton title="Sauvegarde automatique" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Déclencher" }));
    expect(screen.getByText("Sauvegarde automatique")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Sauvegarde automatique")).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
