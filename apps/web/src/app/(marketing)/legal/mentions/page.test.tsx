import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LEGAL_TO_CONFIRM } from "../../../../lib/legal-entity";
import LegalMentionsPage from "./page";

describe("Mentions légales — identité de l'éditeur", () => {
  it("présente TenderOS comme le service et Digiura.ai comme la société éditrice et exploitante", () => {
    render(<LegalMentionsPage />);

    expect(
      screen.getByText(
        "Le service TenderOS est édité et exploité par Digiura.ai, Société par actions simplifiée au capital de 1 000 euros, dont le siège social est situé 200 rue de la Croix Nivert, 75015 Paris, France, immatriculée sous le numéro SIREN 103 774 246.",
      ),
    ).toBeInTheDocument();
    for (const value of ["Digiura.ai", "103 774 246", "103 774 246 00013", "FR86103774246", "5829C — Édition de logiciels applicatifs", "16 avril 2026"]) {
      expect(screen.getByText(value), value).toBeInTheDocument();
    }
    expect(screen.getAllByText("Souleymane COULIBALY")).toHaveLength(2);
  });

  it("laisse « À CONFIRMER » ce qui n'a pas été fourni (RCS, hébergeur, email juridique), jamais une valeur inventée", () => {
    const { container } = render(<LegalMentionsPage />);

    expect(screen.getByText("RCS (ville d'immatriculation)").nextElementSibling).toHaveTextContent(LEGAL_TO_CONFIRM);
    expect(container).toHaveTextContent(`Hébergeur(s), adresse et contact : ${LEGAL_TO_CONFIRM}`);
    expect(container).toHaveTextContent(`Adresse email juridique : ${LEGAL_TO_CONFIRM}`);
    expect(container).not.toHaveTextContent("PENDING LEGAL CONTENT");
  });
});
