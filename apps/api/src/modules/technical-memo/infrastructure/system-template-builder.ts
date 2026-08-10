import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

/**
 * Gabarit système TenderOS (Parcours B, "Générer sans modèle", mission §20) — structure standard à
 * 12 sections, générée programmatiquement (mêmes techniques `docx` que `build-memo-fixture.ts`)
 * plutôt qu'un artefact binaire hand-verified (contrairement à DC1/DC2/DC4, Sprint 11) : ce gabarit
 * n'a PAS de format légal externe imposé à respecter — TenderOS en est le seul auteur, donc la
 * génération programmatique reste vérifiable par test (round-trip, headings) sans étape de
 * vérification manuelle externe. Versionné explicitement (mission "versionné, immuable") — toute
 * évolution de la structure incrémente `SYSTEM_TEMPLATE_VERSION`, jamais une réécriture silencieuse
 * qui désynchroniserait des mémoires déjà générés avec une version antérieure.
 */
export const SYSTEM_TEMPLATE_VERSION = 1;

const STANDARD_SECTIONS: readonly { title: string; instruction: string }[] = [
  { title: "1. Présentation de l'entreprise", instruction: "Présentez votre entreprise : identité, savoir-faire, organisation générale." },
  { title: "2. Compréhension du besoin", instruction: "Démontrez votre compréhension du contexte, des enjeux et des attentes du pouvoir adjudicateur." },
  { title: "3. Méthodologie", instruction: "Décrivez la méthodologie et la démarche proposées pour répondre au marché." },
  { title: "4. Organisation", instruction: "Décrivez l'organisation et le pilotage prévus pour l'exécution du marché." },
  { title: "5. Moyens humains", instruction: "Présentez les moyens humains mobilisés : effectifs, qualifications, rôles." },
  { title: "6. Moyens techniques", instruction: "Présentez les moyens matériels et techniques mobilisés." },
  { title: "7. Planning", instruction: "Présentez le planning et les jalons prévisionnels d'exécution." },
  { title: "8. Qualité", instruction: "Décrivez la démarche qualité mise en œuvre." },
  { title: "9. Sécurité", instruction: "Décrivez les dispositions de sécurité et de prévention mises en œuvre." },
  { title: "10. Responsabilité sociétale (RSE)", instruction: "Décrivez les engagements RSE et environnementaux." },
  { title: "11. Références", instruction: "Présentez les références les plus pertinentes pour ce marché." },
  { title: "12. Engagements", instruction: "Formalisez les engagements pris dans le cadre de cette offre." },
];

export async function buildTenderOsSystemMemoTemplate(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Mémoire technique", heading: HeadingLevel.TITLE }),
          new Paragraph({
            children: [new TextRun({ text: `Modèle standard TenderOS — version ${SYSTEM_TEMPLATE_VERSION}`, italics: true, size: 16 })],
          }),
          ...STANDARD_SECTIONS.flatMap((section) => [
            new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ children: [new TextRun({ text: section.instruction, italics: true })] }),
          ]),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
