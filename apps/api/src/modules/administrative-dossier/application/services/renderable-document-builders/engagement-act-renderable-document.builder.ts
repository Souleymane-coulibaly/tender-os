import type { RenderableDocument } from "../../../../export";
import type { EngagementAct } from "../../../domain/engagement-act.aggregate";
import { fieldParagraph, formatMoney, heading, notice } from "./shared";

/** Sprint 8C Phase 3 — Acte d'engagement : le montant rendu est TOUJOURS le montant déjà gelé
 *  (`frozenAmountValue`/`frozenAmountCurrency`), jamais recalculé au moment de la génération — le
 *  use case appelant refuse de générer tant qu'aucun montant n'est gelé (mission "jamais un montant
 *  implicite dans un document juridique"). */
export function buildEngagementActRenderableDocument(input: { act: EngagementAct; tenderTitle: string }): RenderableDocument {
  const { act, tenderTitle } = input;
  return {
    documentTitle: "Acte d'engagement",
    showPageNumbers: true,
    showTableOfContents: false,
    sections: [
      {
        id: "acte-engagement",
        label: "Acte d'engagement",
        blocks: [
          heading(1, "Acte d'engagement"),
          fieldParagraph("Marché", tenderTitle),
          fieldParagraph("Référence", act.reference),
          fieldParagraph("Référence de lot", act.lotReference),
          fieldParagraph("Objet", act.object),
          fieldParagraph("Durée (mois)", act.durationMonths),
          fieldParagraph("Variantes", act.variants),
          fieldParagraph("Sous-traitance", act.subcontractingSummary),
          fieldParagraph("Signataire", act.signatoryName),
          fieldParagraph("Qualité du signataire", act.signatoryCapacity),
          heading(2, "Montant engagé"),
          act.frozenAmountValue !== undefined && act.frozenAmountCurrency !== undefined
            ? fieldParagraph("Montant", formatMoney(act.frozenAmountValue, act.frozenAmountCurrency))
            : notice("Aucun montant gelé."),
        ],
      },
    ],
  };
}
