// Guides de page — ressources et paramètres de l'organisation. Mêmes règles que `page-guides.ts` :
// cibles `data-tour="guide-<clé>-<élément>"` sur de vrais éléments, 3 à 5 étapes dans l'ordre
// visuel, textes fidèles à ce que la page fait réellement.
//
// Intégrations et Configuration IA ont leur en-tête et leurs onglets dans un layout commun : un seul
// guide par section. Une étape présente la barre d'onglets ; les étapes propres à un onglet ne
// trouvent leur cible que sur cet onglet et sont retirées ailleurs par le moteur.

import type { OrganisationGuideKey, PageGuide } from "./page-guides";

export const ORGANISATION_GUIDES: Readonly<Record<OrganisationGuideKey, PageGuide>> = {
  subscription: {
    key: "subscription",
    pageLabel: "Abonnement & utilisation",
    steps: [],
  },
  members: {
    key: "members",
    pageLabel: "Membres",
    steps: [],
  },
  integrations: {
    key: "integrations",
    pageLabel: "Intégrations",
    steps: [],
  },
  "ai-configuration": {
    key: "ai-configuration",
    pageLabel: "Configuration IA",
    steps: [],
  },
  "ai-costs": {
    key: "ai-costs",
    pageLabel: "Coûts IA",
    steps: [],
  },
  "candidate-companies": {
    key: "candidate-companies",
    pageLabel: "Entreprises candidates",
    steps: [],
  },
  subcontractors: {
    key: "subcontractors",
    pageLabel: "Sous-traitants",
    steps: [],
  },
};
