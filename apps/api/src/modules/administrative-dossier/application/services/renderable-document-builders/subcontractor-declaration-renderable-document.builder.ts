import type { RenderableDocument } from "../../../../export";
import type { SubcontractorDeclaration } from "../../../domain/subcontractor-declaration.aggregate";
import { fieldParagraph, formatMoney, heading } from "./shared";

/** Sprint 8C Phase 3 — DC4 (déclaration de sous-traitance), une par `SubcontractorDeclaration` —
 *  plusieurs déclarations peuvent exister pour un même Tender, chacune génère son propre document. */
export function buildSubcontractorDeclarationRenderableDocument(input: { declaration: SubcontractorDeclaration; tenderTitle: string }): RenderableDocument {
  const { declaration, tenderTitle } = input;
  return {
    documentTitle: "DC4 — Déclaration de sous-traitance",
    showPageNumbers: true,
    showTableOfContents: false,
    sections: [
      {
        id: "sous-traitance",
        label: "Sous-traitance",
        blocks: [
          heading(1, "DC4 — Déclaration de sous-traitance"),
          fieldParagraph("Marché", tenderTitle),
          fieldParagraph("Sous-traitant", declaration.subcontractorName),
          fieldParagraph("Identifiant légal", declaration.subcontractorLegalIdentifier),
          fieldParagraph("Prestations sous-traitées", declaration.servicesDescription),
          fieldParagraph("Montant", formatMoney(declaration.amountValue, declaration.amountCurrency)),
          fieldParagraph("Pourcentage du marché", declaration.percentageOfTotal !== undefined ? `${declaration.percentageOfTotal}%` : undefined),
          fieldParagraph("Modalités de paiement", declaration.paymentTerms),
          fieldParagraph("Paiement direct applicable", declaration.directPaymentApplicable === undefined ? undefined : declaration.directPaymentApplicable ? "Oui" : "Non"),
        ],
      },
    ],
  };
}
