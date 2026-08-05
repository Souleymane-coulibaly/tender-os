import type { RenderableDocument } from "../../../../export";
import type { Consortium } from "../../../domain/consortium.aggregate";
import type { Dc1Declaration } from "../../../domain/dc1-declaration.aggregate";
import { fieldParagraph, heading, notice } from "./shared";

const CANDIDATE_TYPE_LABELS: Record<string, string> = { INDIVIDUAL: "Candidat individuel", CONSORTIUM: "Groupement" };
const CONSORTIUM_TYPE_LABELS: Record<string, string> = { JOINT: "Groupement conjoint", SOLIDARITY: "Groupement solidaire", OTHER: "Autre" };

/** Sprint 8C Phase 3 — DC1 (lettre de candidature) : identité du candidat, type de candidature, et
 *  s'il s'agit d'un groupement, la composition telle que déclarée dans `Consortium` — jamais une
 *  recopie divergente, la SEULE source des membres reste l'agrégat `Consortium`. */
export function buildDc1RenderableDocument(input: { dc1: Dc1Declaration; consortium?: Consortium | undefined; tenderTitle: string }): RenderableDocument {
  const { dc1, consortium, tenderTitle } = input;

  return {
    documentTitle: "DC1 — Lettre de candidature",
    showPageNumbers: true,
    showTableOfContents: false,
    sections: [
      {
        id: "identite",
        label: "Identité du candidat",
        blocks: [
          heading(1, "DC1 — Lettre de candidature"),
          fieldParagraph("Marché", tenderTitle),
          fieldParagraph("Type de candidature", CANDIDATE_TYPE_LABELS[dc1.candidateType] ?? dc1.candidateType),
          fieldParagraph("Signataire", dc1.signatoryName),
          fieldParagraph("Qualité du signataire", dc1.signatoryCapacity),
          ...(dc1.declarations ? [{ kind: "paragraph" as const, text: dc1.declarations }] : []),
        ],
      },
      ...(dc1.candidateType === "CONSORTIUM"
        ? [
            {
              id: "groupement",
              label: "Groupement",
              blocks: consortium
                ? [
                    heading(2, "Composition du groupement"),
                    fieldParagraph("Type de groupement", CONSORTIUM_TYPE_LABELS[consortium.type] ?? consortium.type),
                    fieldParagraph("Forme juridique", consortium.legalForm),
                    ...(consortium.members.length > 0
                      ? [
                          {
                            kind: "table" as const,
                            headerRow: ["Membre", "Rôle", "Pourcentage", "Mandataire"],
                            rows: consortium.members.map((m) => [
                              m.name,
                              m.role,
                              m.percentage !== undefined ? `${m.percentage}%` : "(non renseigné)",
                              consortium.mandataireMemberId === m.memberId ? "Oui" : "",
                            ]),
                          },
                        ]
                      : [notice("Aucun membre déclaré dans le groupement.")]),
                  ]
                : [notice("Candidature de groupement déclarée, mais aucun groupement (Consortium) n'a encore été renseigné.")],
            },
          ]
        : []),
    ],
  };
}
