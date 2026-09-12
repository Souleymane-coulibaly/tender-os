// Guides de page — onglets de la fiche AO, finalisation et dépôt (livrables → export). Mêmes
// règles que `page-guides.ts` : cibles `data-tour="guide-<clé>-<élément>"` sur de vrais éléments de
// l'onglet, 3 à 5 étapes dans l'ordre visuel, textes fidèles à ce que l'onglet fait réellement.
// La barre d'onglets elle-même est présentée par le guide de la vue d'ensemble : jamais reciblée ici.
// Une cible répétée sur chaque élément d'une liste (carte, version…) désigne le premier affiché.

import type { PageGuide, TenderFinalisationGuideKey } from "./page-guides";

export const TENDER_FINALISATION_GUIDES: Readonly<Record<TenderFinalisationGuideKey, PageGuide>> = {
  "tender-deliverables": {
    key: "tender-deliverables",
    pageLabel: "Livrables",
    steps: [],
  },
  "tender-generations": {
    key: "tender-generations",
    pageLabel: "Générations",
    steps: [],
  },
  "tender-documents-generated": {
    key: "tender-documents-generated",
    pageLabel: "Documents générés",
    steps: [],
  },
  "tender-validation": {
    key: "tender-validation",
    pageLabel: "Validation",
    steps: [],
  },
  "tender-signature": {
    key: "tender-signature",
    pageLabel: "Signature",
    steps: [],
  },
  "tender-submission-package": {
    key: "tender-submission-package",
    pageLabel: "Dossier de soumission",
    steps: [],
  },
  "tender-response-package": {
    key: "tender-response-package",
    pageLabel: "Dossier final",
    steps: [],
  },
  "tender-submission": {
    key: "tender-submission",
    pageLabel: "Dépôt",
    steps: [],
  },
  "tender-export": {
    key: "tender-export",
    pageLabel: "Export",
    steps: [],
  },
};
