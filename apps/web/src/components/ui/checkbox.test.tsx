import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";
import { Switch } from "./switch";

describe("Checkbox", () => {
  it("BLOQUANT — clicking the label toggles the underlying native checkbox (real keyboard/screen-reader semantics preserved)", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="J'accepte les conditions" />);

    const checkbox = screen.getByRole("checkbox", { name: "J'accepte les conditions" });
    expect(checkbox).not.toBeChecked();

    await user.click(screen.getByText("J'accepte les conditions"));
    expect(checkbox).toBeChecked();
  });

  it("is togglable via the keyboard (Space), not just the mouse", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Se souvenir de moi" />);
    const checkbox = screen.getByRole("checkbox", { name: "Se souvenir de moi" });

    checkbox.focus();
    await user.keyboard(" ");
    expect(checkbox).toBeChecked();
  });
});

describe("Switch", () => {
  it("BLOQUANT — exposes role=switch (never a plain checkbox semantic) and toggles on click", async () => {
    const user = userEvent.setup();
    render(<Switch label="Notifications" />);

    const toggle = screen.getByRole("switch", { name: "Notifications" });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    expect(toggle).toBeChecked();
  });
});
