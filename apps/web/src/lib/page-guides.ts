// Guides de page — une courte visite propre à chaque écran (3 à 5 étapes), en complément de la
// visite de bienvenue (`tour-steps.ts`, qui parcourt le menu latéral). Chaque étape cible un
// élément RÉEL et STABLE de la page par son attribut `data-tour` (jamais un sélecteur fragile) ;
// convention : `guide-<clé du guide>-<élément>`. Une étape dont la cible est absente à l'écran
// (liste vide, action masquée pour ce rôle ou ce forfait) est retirée à l'exécution — le guide ne
// pointe jamais dans le vide. Textes : ce que la page fait réellement, jamais une promesse.
//
// L'état « déjà vu » (terminé / ignoré) est mémorisé côté serveur, par utilisateur
// (`/api/v1/auth/me/page-guides`), jamais dans le navigateur.

import { TENDER_FINALISATION_GUIDES } from "./page-guides-tender-finalisation";
import { TENDER_PREPARATION_GUIDES } from "./page-guides-tender-preparation";
import { ORGANISATION_GUIDES } from "./page-guides-organisation";

/** Ressources et paramètres de l'organisation (registre `page-guides-organisation.ts`). Intégrations
 *  et Configuration IA : un guide par section (en-tête et onglets dans un layout commun) — les
 *  étapes propres à un onglet sont retirées sur les autres onglets, faute de cible à l'écran. */
export type OrganisationGuideKey =
  | "subscription"
  | "members"
  | "integrations"
  | "ai-configuration"
  | "ai-costs"
  | "candidate-companies"
  | "subcontractors";

/** Onglets de la fiche AO — préparation de la réponse (registre `page-guides-tender-preparation.ts`). */
export type TenderPreparationGuideKey =
  | "tender-dce"
  | "tender-analysis"
  | "tender-checklist"
  | "tender-collaboration"
  | "tender-assistant"
  | "tender-technical-memo"
  | "tender-administrative-dossier"
  | "tender-pricing-schedule"
  | "tender-pricing";

/** Onglets de la fiche AO — finalisation et dépôt (registre `page-guides-tender-finalisation.ts`). */
export type TenderFinalisationGuideKey =
  | "tender-deliverables"
  | "tender-generations"
  | "tender-documents-generated"
  | "tender-validation"
  | "tender-signature"
  | "tender-submission-package"
  | "tender-response-package"
  | "tender-submission"
  | "tender-export";

export type PageGuideKey =
  | "dashboard"
  | "market-watch"
  | "opportunities"
  | "tenders"
  | "tender-overview"
  | "knowledge"
  | "documents"
  | "clients"
  | "validations"
  | TenderPreparationGuideKey
  | TenderFinalisationGuideKey
  | OrganisationGuideKey;

export type PageGuideStep = Readonly<{
  /** Valeur de l'attribut `data-tour` de l'élément ciblé. */
  target: string;
  title: string;
  body: string;
}>;

export type PageGuide = Readonly<{
  key: PageGuideKey;
  /** Nom de la page tel que l'utilisateur la connaît (bandeau de première visite). */
  pageLabel: string;
  steps: readonly PageGuideStep[];
}>;

/** Au plus 5 étapes par guide (lisibilité, pages denses comprises). */
export const PAGE_GUIDE_MAX_STEPS = 5;

// Étapes dans l'ordre visuel de la page (haut → bas). Une étape marquée « conditionnelle » vise un
// élément absent dans certains cas (rôle, liste vide, état de la page) : le moteur la retire alors ;
// chaque guide garde au moins deux étapes toujours présentes.
export const PAGE_GUIDES: Readonly<Record<PageGuideKey, PageGuide>> = {
  dashboard: {
    key: "dashboard",
    pageLabel: "Tableau de bord",
    steps: [],
  },
  "market-watch": {
    key: "market-watch",
    pageLabel: "Veille",
    steps: [],
  },
  opportunities: {
    key: "opportunities",
    pageLabel: "Opportunités",
    steps: [],
  },
  tenders: {
    key: "tenders",
    pageLabel: "Appels d'offres",
    steps: [],
  },
  "tender-overview": {
    key: "tender-overview",
    pageLabel: "Fiche appel d'offres",
    steps: [],
  },
  knowledge: {
    key: "knowledge",
    pageLabel: "Base de connaissances",
    steps: [],
  },
  documents: {
    key: "documents",
    pageLabel: "Documents",
    steps: [],
  },
  clients: {
    key: "clients",
    pageLabel: "Clients",
    steps: [],
  },
  validations: {
    key: "validations",
    pageLabel: "Mes validations",
    steps: [],
  },
  // Onglets de la fiche AO : un registre par étape du flux, pour garder ce fichier lisible.
  ...TENDER_PREPARATION_GUIDES,
  ...TENDER_FINALISATION_GUIDES,
  ...ORGANISATION_GUIDES,
};

/** Format de clé accepté par l'API (même règle des deux côtés). */
export const PAGE_GUIDE_KEY_PATTERN = /^[a-z0-9-]{1,64}$/;
