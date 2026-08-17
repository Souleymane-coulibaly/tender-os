import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Select } from "./select";

describe("Input", () => {
  it("BLOQUANT — the label is associated with the field WITHOUT relying on a generated id (label wraps the control, works as a Server Component)", async () => {
    const user = userEvent.setup();
    render(<Input label="Adresse e-mail" />);

    const field = screen.getByLabelText("Adresse e-mail");
    await user.type(field, "test@tenderos.fr");
    expect(field).toHaveValue("test@tenderos.fr");
  });

  it("shows the error message and marks the field aria-invalid, never both error and hint at once", () => {
    render(<Input label="SIRET" hint="14 chiffres" error="Ce champ est obligatoire." />);
    expect(screen.getByText("Ce champ est obligatoire.")).toBeInTheDocument();
    expect(screen.queryByText("14 chiffres")).not.toBeInTheDocument();
    expect(screen.getByLabelText("SIRET")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows the hint when there is no error", () => {
    render(<Input label="SIRET" hint="14 chiffres" />);
    expect(screen.getByText("14 chiffres")).toBeInTheDocument();
  });
});

describe("Textarea", () => {
  it("is labelled the same way as Input", () => {
    render(<Textarea label="Description" />);
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
  });
});

describe("Select", () => {
  it("is labelled and lets the user choose an option", async () => {
    const user = userEvent.setup();
    render(
      <Select label="Statut">
        <option value="draft">Brouillon</option>
        <option value="published">Publié</option>
      </Select>,
    );

    const select = screen.getByLabelText("Statut");
    await user.selectOptions(select, "published");
    expect(select).toHaveValue("published");
  });
});
