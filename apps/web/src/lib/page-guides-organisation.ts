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
    steps: [
      {
        target: "guide-subscription-current-plan",
        title: "Votre forfait",
        body: "Consultez votre forfait, son statut, sa facturation et vos prochains crédits AO. Abonnement payé via Stripe : cliquez sur « Gérer mon abonnement ».",
      },
      {
        target: "guide-subscription-plans",
        title: "Choisir un forfait",
        body: "Comparez les forfaits en « Mensuel » ou « Annuel », puis cliquez sur « Passer à … » pour confirmer sur Stripe. Réservé au Propriétaire et à l'Administrateur.",
      },
      {
        target: "guide-subscription-pass",
        title: "Besoin ponctuel : le Pass AO",
        body: "Pour un seul appel d'offres, cliquez sur « Acheter un Pass AO » : paiement unique, sans engagement. Vos dossiers disponibles s'affichent ici.",
      },
      {
        target: "guide-subscription-usage",
        title: "Votre utilisation",
        body: "Suivez vos crédits AO disponibles, le nombre d'utilisateurs, les messages de chat IA du jour et le stockage, comparés aux limites de votre forfait.",
      },
      {
        target: "guide-subscription-credit-history",
        title: "Historique des crédits AO",
        body: "Chaque attribution ou consommation de crédit AO apparaît ici : date, type, variation, solde après et appel d'offres concerné.",
      },
    ],
  },
  members: {
    key: "members",
    pageLabel: "Membres",
    steps: [
      {
        target: "guide-members-seat-limit",
        title: "Votre plafond de membres",
        body: "Le nombre de membres actifs dépend de votre offre. Cliquez sur « Abonnement & utilisation » pour connaître votre plafond actuel.",
      },
      {
        // Conditionnelle : réservée au Propriétaire et à l'Administrateur.
        target: "guide-members-invite",
        title: "Inviter un membre",
        body: "Cliquez sur « + Inviter un membre », saisissez son email et choisissez son rôle. La personne doit déjà avoir un compte TenderOS.",
      },
      {
        target: "guide-members-list",
        title: "Les membres de l'équipe",
        body: "Voyez le rôle et le statut de chaque membre. Propriétaire ou Administrateur : changez un rôle dans la liste, ou cliquez sur « Suspendre » ou « Retirer ».",
      },
    ],
  },
  integrations: {
    key: "integrations",
    pageLabel: "Intégrations",
    steps: [
      {
        target: "guide-integrations-tabs",
        title: "Clés API, webhooks, connecteurs",
        body: "« Clés API » ouvre l'API publique, « Webhooks » envoie des événements à vos outils, « Connecteurs » relie Microsoft 365 ou Google Workspace.",
      },
      {
        // Conditionnelle : onglets Clés API et Webhooks, Propriétaire et Administrateur.
        target: "guide-integrations-create",
        title: "Créer une clé ou un webhook",
        body: "Remplissez le formulaire puis cliquez sur « Créer la clé » ou « Créer le webhook » ; le secret ne s'affiche qu'une fois. Hors offre, un lien mène à l'abonnement.",
      },
      {
        // Conditionnelle : onglets Clés API et Webhooks.
        target: "guide-integrations-list",
        title: "Clés et webhooks existants",
        body: "Suivez le statut de chaque clé ou webhook. Cliquez sur « Révoquer » pour couper une clé, ou sur l'adresse d'un webhook pour ouvrir sa fiche.",
      },
      {
        // Conditionnelle : onglet Connecteurs.
        target: "guide-integrations-connectors",
        title: "Microsoft 365 et Google Workspace",
        body: "Cliquez sur « Connecter » (selon votre offre) puis sur « Tester la connexion ». Une fois active, parcourez les dossiers pour importer ou exporter des documents.",
      },
    ],
  },
  "ai-configuration": {
    key: "ai-configuration",
    pageLabel: "Configuration IA",
    steps: [
      {
        target: "guide-ai-configuration-tabs",
        title: "Les rubriques de la configuration",
        body: "Passez d'un onglet à l'autre : modèles, choix des modèles, prompts, templates d'export, documentaires et de mémoire, identité documentaire.",
      },
      {
        // Conditionnelle : onglet Choix des modèles.
        target: "guide-ai-configuration-model-choice",
        title: "Le modèle de chaque fonctionnalité",
        body: "TenderOS choisit automatiquement le modèle. Pour une fonctionnalité, sélectionnez un autre modèle compatible dans la liste, ou revenez à « Automatique ».",
      },
      {
        // Conditionnelle : onglets hors Choix des modèles, Propriétaire et Administrateur.
        target: "guide-ai-configuration-create",
        title: "Ajouter un élément",
        body: "Selon l'onglet, cliquez sur « Enregistrer un modèle » ou « Nouveau template », ou remplissez le formulaire de création. Réservé au Propriétaire et à l'Administrateur.",
      },
      {
        // Conditionnelle : onglets hors Choix des modèles.
        target: "guide-ai-configuration-list",
        title: "Éléments configurés",
        body: "Retrouvez les modèles, templates ou thèmes déjà configurés pour votre organisation. Cliquez sur un nom pour ouvrir sa fiche ou le déplier.",
      },
    ],
  },
  "ai-costs": {
    key: "ai-costs",
    pageLabel: "Coûts IA",
    steps: [
      {
        target: "guide-ai-costs-total",
        title: "Coût IA réel de l'organisation",
        body: "Le coût technique réel de vos appels IA, toutes activités confondues et par devise. C'est votre consommation IA, jamais le prix de votre abonnement.",
      },
      {
        target: "guide-ai-costs-by-client",
        title: "Répartition par client",
        body: "Le même coût réparti par client, sans jamais additionner les clients entre eux. Vide tant qu'aucune donnée de coût n'existe.",
      },
      {
        target: "guide-ai-costs-by-task-type",
        title: "Répartition par type de tâche",
        body: "Voyez quelles tâches IA pèsent le plus dans votre coût : chaque type de tâche affiche son propre total, par devise.",
      },
      {
        target: "guide-ai-costs-disclaimer",
        title: "Des montants indicatifs",
        body: "Ces montants sont des estimations non contractuelles, calculées avec les tarifs connus au moment du calcul : ni un prix garanti, ni une facture.",
      },
    ],
  },
  "candidate-companies": {
    key: "candidate-companies",
    pageLabel: "Entreprises candidates",
    steps: [
      {
        target: "guide-candidate-companies-create",
        title: "Nouvelle entreprise candidate",
        body: "Cliquez sur « Nouvelle entreprise candidate » pour créer la fiche de l'entité juridique qui répond à vos appels d'offres, distincte de vos clients.",
      },
      {
        target: "guide-candidate-companies-list",
        title: "Vos entreprises candidates",
        body: "Une organisation peut porter plusieurs entreprises candidates. Chacune affiche son nom, sa raison sociale, son SIREN, sa forme juridique et son statut.",
      },
      {
        // Conditionnelle : seulement quand au moins une entreprise candidate existe.
        target: "guide-candidate-companies-open",
        title: "Compléter une fiche",
        body: "Cliquez sur un nom ou sur « Ouvrir » pour compléter la fiche : identité, établissements, représentants, certifications, assurances, références, documents.",
      },
    ],
  },
  subcontractors: {
    key: "subcontractors",
    pageLabel: "Sous-traitants",
    steps: [
      {
        target: "guide-subcontractors-create",
        title: "Nouveau sous-traitant",
        body: "Cliquez sur « Nouveau sous-traitant » pour l'ajouter au répertoire de l'organisation, réutilisable pour tous vos appels d'offres.",
      },
      {
        target: "guide-subcontractors-filters",
        title: "Rechercher un sous-traitant",
        body: "Recherchez par raison sociale, filtrez par statut, puis cliquez sur « Filtrer ».",
      },
      {
        target: "guide-subcontractors-list",
        title: "Votre répertoire",
        body: "Chaque ligne affiche raison sociale, SIRET, domaines et statut. Cliquez sur un nom ou sur « Ouvrir » pour gérer assurances, certifications, références et documents.",
      },
    ],
  },
};
