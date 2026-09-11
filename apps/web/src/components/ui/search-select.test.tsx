import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchSelect, type SearchSelectOption } from "./search-select";

const DOCS: SearchSelectOption[] = [
  { value: "doc-1", label: "Kbis 2026", description: "Administratif" },
  { value: "doc-2", label: "Kbis 2025" },
  { value: "doc-3", label: "Attestation URSSAF" },
];

function searchIn(options: SearchSelectOption[]) {
  return vi.fn(async (query: string) => options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())));
}

function hidden(container: HTMLElement) {
  return container.querySelector('input[type="hidden"]') as HTMLInputElement;
}

describe("SearchSelect", () => {
  it("BLOQUANT — choisir un résultat met son identifiant dans le champ caché nommé, envoyé par le formulaire", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <form>
        <SearchSelect name="documentId" ariaLabel="Document existant" search={searchIn(DOCS)} debounceMs={0} />
      </form>,
    );

    await user.type(screen.getByRole("combobox", { name: "Document existant" }), "kbis");
    await user.click(await screen.findByRole("option", { name: /Kbis 2025/ }));

    expect(hidden(container)).toHaveAttribute("name", "documentId");
    expect(hidden(container).value).toBe("doc-2");
    expect(screen.getByRole("combobox")).toHaveValue("Kbis 2025");
  });

  it("un texte tapé sans sélection n'est JAMAIS envoyé comme identifiant", async () => {
    const user = userEvent.setup();
    const { container } = render(<SearchSelect name="documentId" ariaLabel="Document" search={searchIn(DOCS)} debounceMs={0} />);

    await user.type(screen.getByRole("combobox"), "3f2a9c1e-uuid-tape-a-la-main");
    expect(hidden(container).value).toBe("");
  });

  it("modifier le texte après un choix annule la sélection", async () => {
    const user = userEvent.setup();
    const { container } = render(<SearchSelect name="documentId" ariaLabel="Document" search={searchIn(DOCS)} debounceMs={0} />);

    await user.type(screen.getByRole("combobox"), "urssaf");
    await user.click(await screen.findByRole("option", { name: /URSSAF/ }));
    expect(hidden(container).value).toBe("doc-3");

    await user.type(screen.getByRole("combobox"), "x");
    expect(hidden(container).value).toBe("");
  });

  it("se pilote au clavier : flèches, Entrée pour choisir, Échap pour fermer", async () => {
    const user = userEvent.setup();
    const { container } = render(<SearchSelect name="documentId" ariaLabel="Document" search={searchIn(DOCS)} debounceMs={0} />);
    const combobox = screen.getByRole("combobox");

    await user.type(combobox, "kbis");
    await screen.findByRole("listbox");
    expect(combobox).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{ArrowDown}{Enter}");
    expect(hidden(container).value).toBe("doc-2");

    await user.type(combobox, "{Backspace}");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(combobox).toHaveAttribute("aria-expanded", "false");
  });

  it("ne cherche pas en dessous du nombre minimal de caractères", async () => {
    const user = userEvent.setup();
    const search = searchIn(DOCS);
    render(<SearchSelect ariaLabel="Document" search={search} debounceMs={0} minQueryLength={3} />);

    await user.type(screen.getByRole("combobox"), "kb");
    await act(async () => {});
    expect(search).not.toHaveBeenCalled();
  });

  it("n'affiche que la réponse à la DERNIÈRE recherche, même si une plus ancienne arrive après", async () => {
    const user = userEvent.setup();
    const resolvers: Record<string, (value: SearchSelectOption[]) => void> = {};
    const search = vi.fn((query: string) => new Promise<SearchSelectOption[]>((resolve) => (resolvers[query] = resolve)));
    render(<SearchSelect ariaLabel="Document" search={search} debounceMs={0} />);

    await user.type(screen.getByRole("combobox"), "kb");
    await waitFor(() => expect(resolvers.kb).toBeDefined());
    await user.type(screen.getByRole("combobox"), "i");
    await waitFor(() => expect(resolvers.kbi).toBeDefined());

    await act(async () => resolvers.kbi!([{ value: "new", label: "Réponse récente" }]));
    await act(async () => resolvers.kb!([{ value: "old", label: "Réponse périmée" }]));

    expect(screen.getByRole("option", { name: /Réponse récente/ })).toBeInTheDocument();
    expect(screen.queryByText("Réponse périmée")).not.toBeInTheDocument();
  });

  it("dit clairement quand la recherche échoue, au lieu d'afficher une liste vide trompeuse", async () => {
    const user = userEvent.setup();
    const search = vi.fn(async () => {
      throw new Error("réseau");
    });
    render(<SearchSelect ariaLabel="Document" search={search} debounceMs={0} />);

    await user.type(screen.getByRole("combobox"), "kbis");
    expect(await screen.findByText("La recherche est momentanément indisponible.")).toBeInTheDocument();
  });
});
