// Guides de page — onglets de la fiche AO, préparation de la réponse (DCE → estimation). Mêmes
// règles que `page-guides.ts` : cibles `data-tour="guide-<clé>-<élément>"` sur de vrais éléments de
// l'onglet, 3 à 5 étapes dans l'ordre visuel, textes fidèles à ce que l'onglet fait réellement.
// La barre d'onglets elle-même est présentée par le guide de la vue d'ensemble : jamais reciblée ici.

import type { PageGuide, TenderPreparationGuideKey } from "./page-guides";

export const TENDER_PREPARATION_GUIDES: Readonly<Record<TenderPreparationGuideKey, PageGuide>> = {
  "tender-dce": {
    key: "tender-dce",
    pageLabel: "DCE",
    steps: [],
  },
  "tender-analysis": {
    key: "tender-analysis",
    pageLabel: "Analyse",
    steps: [],
  },
  "tender-checklist": {
    key: "tender-checklist",
    pageLabel: "Checklist",
    steps: [],
  },
  "tender-collaboration": {
    key: "tender-collaboration",
    pageLabel: "Collaboration",
    steps: [],
  },
  "tender-assistant": {
    key: "tender-assistant",
    pageLabel: "Assistant IA",
    steps: [],
  },
  "tender-technical-memo": {
    key: "tender-technical-memo",
    pageLabel: "Rédaction IA du mémoire",
    steps: [],
  },
  "tender-administrative-dossier": {
    key: "tender-administrative-dossier",
    pageLabel: "Dossier administratif",
    steps: [],
  },
  "tender-pricing-schedule": {
    key: "tender-pricing-schedule",
    pageLabel: "Chiffrage",
    steps: [],
  },
  "tender-pricing": {
    key: "tender-pricing",
    pageLabel: "Estimation & coûts IA",
    steps: [],
  },
};
