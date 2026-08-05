import type { RenderableDocument, RenderableSection } from "../../../../export";
import type { StructuredCapacityStatement } from "../../../domain/structured-capacity-statement";
import { fieldParagraph, formatMoney, heading, notice } from "./shared";

/** Sprint 8C Phase 3 — DC2 et DUME partagent EXACTEMENT le même contenu métier
 *  (`StructuredCapacityStatement`, déjà partagé côté domaine, mission §11/§13) : un seul
 *  constructeur de sections, jamais deux implémentations divergentes. Seul le titre du document et
 *  le libellé de version diffèrent entre les deux appelants. */
function buildStructuredCapacityStatementSections(data: StructuredCapacityStatement): readonly RenderableSection[] {
  return [
    {
      id: "identite",
      label: "Identité et chiffre d'affaires",
      blocks: [
        heading(1, "Identité légale"),
        fieldParagraph("Identité légale", data.legalIdentity),
        heading(2, "Chiffre d'affaires par exercice"),
        ...(data.revenueByYear && data.revenueByYear.length > 0
          ? [
              {
                kind: "table" as const,
                headerRow: ["Exercice", "Montant"],
                rows: data.revenueByYear.map((r) => [String(r.year), formatMoney(r.amountValue, r.amountCurrency)]),
              },
            ]
          : [notice("Aucune donnée de chiffre d'affaires renseignée.")]),
      ],
    },
    {
      id: "capacites",
      label: "Capacités",
      blocks: [
        heading(1, "Capacités et moyens"),
        fieldParagraph("Capacité financière", data.financialCapacity),
        fieldParagraph("Capacité technique", data.technicalCapacity),
        fieldParagraph("Moyens humains", data.humanResources),
        fieldParagraph("Moyens techniques", data.technicalResources),
        fieldParagraph("Assurances", data.insurances),
        fieldParagraph("Certifications", data.certifications),
        ...(data.additionalInfo ? [{ kind: "paragraph" as const, text: data.additionalInfo }] : []),
      ],
    },
  ];
}

export function buildDc2RenderableDocument(input: { data: StructuredCapacityStatement; version: number; tenderTitle: string }): RenderableDocument {
  return {
    documentTitle: `DC2 — Déclaration du candidat (version ${input.version})`,
    showPageNumbers: true,
    showTableOfContents: false,
    sections: [{ id: "marche", label: "Marché", blocks: [fieldParagraph("Marché", input.tenderTitle)] }, ...buildStructuredCapacityStatementSections(input.data)],
  };
}

/** Mission — le DUME n'est PAS le format d'échange officiel européen (ESPD) : ce PDF est une mise
 *  en forme lisible des mêmes données structurées, jamais une prétention de conformité au schéma
 *  XML officiel (voir `dume-xml-draft.builder.ts` pour l'export XML, séparé et explicitement
 *  étiqueté "brouillon non officiel"). */
export function buildDumeRenderableDocument(input: { data: StructuredCapacityStatement; version: number; tenderTitle: string }): RenderableDocument {
  return {
    documentTitle: `DUME — Document unique de marché européen (version ${input.version})`,
    showPageNumbers: true,
    showTableOfContents: false,
    sections: [
      {
        id: "marche",
        label: "Marché",
        blocks: [fieldParagraph("Marché", input.tenderTitle), notice("Mise en forme lisible du DUME — ne remplace pas un dépôt au format d'échange officiel ESPD.")],
      },
      ...buildStructuredCapacityStatementSections(input.data),
    ],
  };
}
