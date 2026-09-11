import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileInput } from "./file-input";

function file(name: string) {
  return new File(["contenu"], name, { type: "application/pdf" });
}

describe("FileInput", () => {
  it("BLOQUANT — garde un vrai champ fichier nommé, rattaché au formulaire : le FormData envoyé ne change pas", async () => {
    // Le `FormData` de jsdom lit sa liste interne de fichiers, que `userEvent.upload` ne remplit
    // pas (il redéfinit la propriété `files`) : l'interroger rendrait un fichier vide sans rien dire
    // du composant. On vérifie donc ce qui détermine réellement l'envoi — un `<input type="file">`
    // natif, nommé, appartenant au formulaire, portant le fichier choisi. La preuve de bout en bout
    // se fait dans un vrai navigateur (Playwright, dépôt d'un document).
    const user = userEvent.setup();
    const { container } = render(
      <form>
        <FileInput name="file" aria-label="Pièce à déposer" />
      </form>,
    );

    const input = screen.getByLabelText("Pièce à déposer") as HTMLInputElement;
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("name", "file");
    expect(input.form).toBe(container.querySelector("form"));

    await user.upload(input, file("kbis.pdf"));
    expect(input.files?.[0]?.name).toBe("kbis.pdf");
  });

  it("affiche le nom du fichier choisi, jamais le texte natif tronqué", async () => {
    const user = userEvent.setup();
    render(<FileInput aria-label="Fichier" />);

    expect(screen.getByText("Aucun fichier choisi")).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Fichier"), file("attestation-urssaf.pdf"));
    expect(screen.getByText("attestation-urssaf.pdf")).toBeInTheDocument();
  });

  it("résume une sélection multiple par un nombre", async () => {
    const user = userEvent.setup();
    render(<FileInput multiple aria-label="Fichiers" />);

    expect(screen.getByText("Choisir des fichiers")).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Fichiers"), [file("a.pdf"), file("b.pdf"), file("c.pdf")]);
    expect(screen.getByText("3 fichiers")).toBeInTheDocument();
  });

  it("transmet l'événement au onChange de l'appelant (usages contrôlés : signature, mémoire technique)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FileInput aria-label="Fichier" onChange={onChange} />);

    await user.upload(screen.getByLabelText("Fichier"), file("memoire.docx"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].target.files[0].name).toBe("memoire.docx");
  });

  it("un reset du formulaire efface le nom affiché : jamais un fichier qui n'est plus sélectionné", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <form>
        <FileInput aria-label="Fichier" />
      </form>,
    );

    await user.upload(screen.getByLabelText("Fichier"), file("kbis.pdf"));
    expect(screen.getByText("kbis.pdf")).toBeInTheDocument();

    fireEvent.reset(container.querySelector("form")!);
    expect(await screen.findByText("Aucun fichier choisi")).toBeInTheDocument();
  });

  it("reste atteignable au clavier : le champ natif est focalisable, pas retiré du flux", () => {
    render(<FileInput aria-label="Fichier" />);
    const input = screen.getByLabelText("Fichier");

    input.focus();
    expect(input).toHaveFocus();
    expect(input.className).toContain("sr-only");
  });
});
