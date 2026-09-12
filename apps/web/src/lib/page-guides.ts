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
    steps: [
      {
        // Conditionnelle : seulement si l'utilisateur a accès à au moins un client.
        target: "guide-dashboard-filters",
        title: "Filtrer par client",
        body: "Choisissez un client puis cliquez sur « Appliquer » : indicateurs, dossiers prioritaires, échéances et activité se limitent alors à ce client.",
      },
      {
        target: "guide-dashboard-kpis",
        title: "Vos indicateurs clés",
        body: "Suivez vos appels d'offres en cours, les échéances à 7 jours, les dossiers à valider et les opportunités. Cliquez sur une carte pour ouvrir la liste associée.",
      },
      {
        target: "guide-dashboard-pipeline",
        title: "Pipeline et décisions",
        body: "Visualisez la répartition de vos dossiers actifs par statut, vos décisions GO / NO-GO de la période et l'état de préparation des dossiers.",
      },
      {
        target: "guide-dashboard-priorities",
        title: "Dossiers prioritaires et échéances",
        body: "Retrouvez les dossiers qui demandent votre attention et les prochaines dates de remise des offres. Cliquez sur un dossier pour l'ouvrir.",
      },
      {
        target: "guide-dashboard-follow-up",
        title: "Veille, activité et tâches",
        body: "Consultez les opportunités recommandées par votre veille, l'activité récente, vos tâches et, selon vos droits, les actions rapides.",
      },
    ],
  },
  "market-watch": {
    key: "market-watch",
    pageLabel: "Veille",
    steps: [
      {
        target: "guide-market-watch-saved-searches",
        title: "Vos veilles",
        body: "« Mes veilles » regroupe vos recherches enregistrées. Cliquez sur une veille pour voir ses marchés ; survolez-la pour la mettre en pause ou la supprimer.",
      },
      {
        target: "guide-market-watch-new",
        title: "Créer une veille",
        body: "Cliquez sur « + Nouvelle » pour définir une recherche : mots-clés, département, budget minimum et alertes.",
      },
      {
        // Conditionnelle : formulaire affiché à la création (et tant qu'aucune veille n'existe).
        target: "guide-market-watch-create-form",
        title: "Paramétrer la veille",
        body: "Nommez la veille, décrivez ce que vous recherchez, choisissez vos alertes (notification ou email), puis cliquez sur « Créer la veille ».",
      },
      {
        // Conditionnelle : seulement sur une veille active.
        target: "guide-market-watch-run-now",
        title: "Tester la veille",
        body: "Cliquez sur « Tester la veille » pour lancer une recherche immédiate, sans attendre la collecte automatique qui s'exécute toutes les heures.",
      },
      {
        // Conditionnelle : seulement quand la veille a trouvé des marchés.
        target: "guide-market-watch-matches",
        title: "Marchés détectés",
        body: "Chaque marché affiche son score de pertinence. Marquez-le « Favori », ignorez-le ou cliquez sur « Ajouter à mes opportunités » pour le qualifier.",
      },
    ],
  },
  opportunities: {
    key: "opportunities",
    pageLabel: "Opportunités",
    steps: [
      {
        target: "guide-opportunities-create",
        title: "Nouvelle opportunité",
        body: "Cliquez sur « Nouvelle opportunité » pour enregistrer un marché à préqualifier avant d'en faire un appel d'offres.",
      },
      {
        target: "guide-opportunities-filters",
        title: "Filtrer par statut",
        body: "Cliquez sur un statut pour n'afficher que les opportunités concernées, ou sur « Toutes » pour revenir à la liste complète.",
      },
      {
        target: "guide-opportunities-list",
        title: "Vos opportunités",
        body: "Chaque ligne indique l'acheteur, le statut et la date limite. Cliquez sur « Ouvrir » pour scorer l'opportunité, décider, puis la promouvoir.",
      },
    ],
  },
  tenders: {
    key: "tenders",
    pageLabel: "Appels d'offres",
    steps: [
      {
        target: "guide-tenders-create",
        title: "Créer un appel d'offres",
        body: "Cliquez sur « Nouvel appel d'offres » pour créer un dossier de réponse : c'est aussi le point de départ pour importer votre DCE.",
      },
      {
        target: "guide-tenders-view-switcher",
        title: "Liste ou Kanban",
        body: "Basculez entre la vue « Liste » et la vue « Kanban » : vos filtres actifs sont conservés.",
      },
      {
        target: "guide-tenders-statistics",
        title: "Vos indicateurs",
        body: "Dossiers actifs, échéances à 7 jours, retards, dossiers prêts à déposer, à risque et préparation moyenne : l'état de votre activité en un coup d'œil.",
      },
      {
        target: "guide-tenders-filters",
        title: "Rechercher et filtrer",
        body: "Recherchez par titre, référence ou acheteur, filtrez par statut, client ou échéance, choisissez le tri, puis cliquez sur « Filtrer ».",
      },
      {
        target: "guide-tenders-list",
        title: "Vos appels d'offres",
        body: "Chaque ligne affiche statut, date limite, score, risques et checklist. Cliquez sur l'objet ou sur « Ouvrir » pour accéder au dossier.",
      },
    ],
  },
  "tender-overview": {
    key: "tender-overview",
    pageLabel: "Fiche appel d'offres",
    steps: [
      {
        target: "guide-tender-overview-tabs",
        title: "Les onglets du dossier",
        body: "Passez d'une étape à l'autre : DCE, analyse, checklist, rédaction IA du mémoire, chiffrage, validation, dépôt et export.",
      },
      {
        target: "guide-tender-overview-cockpit",
        title: "Le cockpit",
        body: "Voyez l'étape en cours, la prochaine action conseillée, les alertes et l'état de chaque module. Cliquez sur un module pour l'ouvrir.",
      },
      {
        target: "guide-tender-overview-completeness",
        title: "Complétude du dossier",
        body: "Chaque rubrique indique si ses informations sont renseignées. Indicateur informatif : il n'empêche jamais la sauvegarde d'un dossier incomplet.",
      },
      {
        // Conditionnelle : réservée aux rôles autorisés à modifier l'appel d'offres.
        target: "guide-tender-overview-edit",
        title: "Modifier les informations",
        body: "Dépliez « Modifier les informations de l'appel d'offres » pour mettre à jour les données du dossier, acheteur compris.",
      },
      {
        target: "guide-tender-overview-readiness",
        title: "Score de préparation",
        body: "Le score sur 100 résume l'avancement du dossier ; le détail par critère vous montre où concentrer vos efforts.",
      },
    ],
  },
  knowledge: {
    key: "knowledge",
    pageLabel: "Base de connaissances",
    steps: [
      {
        target: "guide-knowledge-search",
        title: "Rechercher",
        body: "Cliquez sur « Rechercher » pour retrouver un contenu dans votre base de connaissances.",
      },
      {
        target: "guide-knowledge-import",
        title: "Importer un document",
        body: "Cliquez sur « Importer un document » pour alimenter la base à partir d'un fichier existant.",
      },
      {
        target: "guide-knowledge-create",
        title: "Nouvelle entrée",
        body: "Cliquez sur « Nouvelle entrée » pour rédiger un contenu réutilisable dans vos réponses aux appels d'offres.",
      },
      {
        target: "guide-knowledge-filters",
        title: "Filtrer la base",
        body: "Filtrez par titre, catégorie, statut ou client, incluez les archives si besoin, puis cliquez sur « Filtrer ».",
      },
      {
        target: "guide-knowledge-list",
        title: "Vos entrées",
        body: "Chaque entrée affiche sa portée (globale ou client), sa catégorie, ses tags, son statut et sa version. Cliquez sur un titre pour l'ouvrir.",
      },
    ],
  },
  documents: {
    key: "documents",
    pageLabel: "Documents",
    steps: [
      {
        target: "guide-documents-create",
        title: "Nouveau document",
        body: "Cliquez sur « Nouveau document » pour ajouter un fichier à votre bibliothèque.",
      },
      {
        target: "guide-documents-filters",
        title: "Rechercher un document",
        body: "Recherchez par titre ou nom de fichier, filtrez par statut, origine ou domaine, puis cliquez sur « Filtrer ».",
      },
      {
        target: "guide-documents-list",
        title: "Votre bibliothèque",
        body: "Chaque document affiche son domaine, son origine, son statut, sa version et sa taille. Cliquez sur un titre pour le consulter.",
      },
    ],
  },
  clients: {
    key: "clients",
    pageLabel: "Clients",
    steps: [
      {
        target: "guide-clients-create",
        title: "Nouveau client",
        body: "Cliquez sur « Nouveau client » pour ajouter un client à votre portefeuille, selon vos droits.",
      },
      {
        target: "guide-clients-filters",
        title: "Filtrer les clients",
        body: "Recherchez un client par nom, filtrez par statut, incluez les clients archivés si besoin, puis cliquez sur « Filtrer ».",
      },
      {
        target: "guide-clients-list",
        title: "Votre portefeuille",
        body: "Chaque ligne affiche le nom, la raison sociale, le secteur et le statut du client. Cliquez sur « Ouvrir » pour accéder à sa fiche.",
      },
    ],
  },
  validations: {
    key: "validations",
    pageLabel: "Mes validations",
    steps: [
      {
        target: "guide-validations-filters",
        title: "Filtrer par statut",
        body: "Cliquez sur « En attente » pour voir les demandes à traiter, ou sur un autre statut pour consulter l'historique.",
      },
      {
        target: "guide-validations-list",
        title: "Vos demandes de validation",
        body: "Retrouvez les demandes où vous êtes désigné approbateur, tous appels d'offres confondus. « Ouvrir le Tender » mène à son espace de collaboration.",
      },
      {
        // Conditionnelle : seulement quand au moins une demande correspond au filtre.
        target: "guide-validations-items",
        title: "Traiter une demande",
        body: "Cliquez sur une demande en attente pour la déplier, puis sur « Approuver », « Demander des modifications » ou « Rejeter » (raison obligatoire).",
      },
    ],
  },
  // Onglets de la fiche AO : un registre par étape du flux, pour garder ce fichier lisible.
  ...TENDER_PREPARATION_GUIDES,
  ...TENDER_FINALISATION_GUIDES,
  ...ORGANISATION_GUIDES,
};

/** Format de clé accepté par l'API (même règle des deux côtés). */
export const PAGE_GUIDE_KEY_PATTERN = /^[a-z0-9-]{1,64}$/;
