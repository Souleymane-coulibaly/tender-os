// Guides de page — onglets de la fiche AO, préparation de la réponse (DCE → estimation). Mêmes
// règles que `page-guides.ts` : cibles `data-tour="guide-<clé>-<élément>"` sur de vrais éléments de
// l'onglet, 3 à 5 étapes dans l'ordre visuel, textes fidèles à ce que l'onglet fait réellement.
// La barre d'onglets elle-même est présentée par le guide de la vue d'ensemble : jamais reciblée ici.

import type { PageGuide, TenderPreparationGuideKey } from "./page-guides";

export const TENDER_PREPARATION_GUIDES: Readonly<Record<TenderPreparationGuideKey, PageGuide>> = {
  "tender-dce": {
    key: "tender-dce",
    pageLabel: "DCE",
    steps: [
      {
        target: "guide-tender-dce-section",
        title: "Le DCE du dossier",
        body: "Retrouvez ici les pièces du dossier de consultation (DCE) de cet appel d'offres : elles alimentent l'analyse IA et le chiffrage.",
      },
      {
        // Conditionnelle : tant que le DCE n'est pas initialisé, pour les rôles autorisés à importer.
        target: "guide-tender-dce-init",
        title: "Initialiser le DCE",
        body: "Cliquez sur « Initialiser le DCE » pour créer le DCE de cet appel d'offres : vous pourrez ensuite importer ses documents.",
      },
      {
        // Conditionnelle : une fois le DCE initialisé.
        target: "guide-tender-dce-documents",
        title: "Documents du DCE",
        body: "Chaque document affiche sa taille et son statut de traitement. Cliquez sur « Analyser » pour lancer son analyse IA, ou sur « Télécharger ».",
      },
      {
        // Conditionnelle : DCE initialisé, rôles autorisés à importer.
        target: "guide-tender-dce-import",
        title: "Importer des documents",
        body: "Choisissez des fichiers puis cliquez sur « Importer », ou déposez tout le DCE d'un coup avec « Importer une archive ZIP ».",
      },
    ],
  },
  "tender-analysis": {
    key: "tender-analysis",
    pageLabel: "Analyse",
    steps: [
      {
        target: "guide-tender-analysis-actions",
        title: "Lancer l'analyse IA",
        body: "Cliquez sur « Lancer l'analyse » pour analyser les documents du DCE importés, puis sur « Actualiser » pour suivre son statut. En cas d'échec : « Relancer ».",
      },
      {
        target: "guide-tender-analysis-summary",
        title: "Synthèse et recommandation",
        body: "Complexité, recommandation GO / NO-GO, fraîcheur, éléments manquants et points à clarifier : une aide à la décision générée par IA, à valider par un humain.",
      },
      {
        target: "guide-tender-analysis-findings",
        title: "Constats détaillés",
        body: "Dépliez une rubrique : échéances, critères, exigences, clauses, risques, questions pour l'acheteur. Chaque constat cite sa source et son niveau de confiance.",
      },
    ],
  },
  "tender-checklist": {
    key: "tender-checklist",
    pageLabel: "Checklist",
    steps: [
      {
        target: "guide-tender-checklist-compare",
        title: "Comparer avec l'analyse",
        body: "Cliquez sur « Comparer avec la dernière analyse » : les écarts deviennent des suggestions à valider, la checklist n'est jamais modifiée sans vous.",
      },
      {
        // Conditionnelle : absente si la progression de la checklist n'a pas pu être lue.
        target: "guide-tender-checklist-progress",
        title: "Progression",
        body: "Suivez les éléments validés sur les éléments applicables, ainsi que les bloquants, manquants, expirés et à vérifier.",
      },
      {
        target: "guide-tender-checklist-items",
        title: "Éléments de la checklist",
        body: "Changez le statut d'un élément, cliquez sur « Valider » ou « Non applicable », recherchez un document justificatif ou créez une tâche.",
      },
      {
        target: "guide-tender-checklist-add",
        title: "Ajouter un élément",
        body: "Saisissez un intitulé, choisissez le type, le niveau d'exigence et la criticité, puis cliquez sur « Ajouter ».",
      },
      {
        target: "guide-tender-checklist-suggestions",
        title: "Suggestions IA à valider",
        body: "Les propositions issues de l'analyse IA arrivent ici : cliquez sur « Appliquer » ou « Rejeter ». Aucune n'est appliquée automatiquement.",
      },
    ],
  },
  "tender-collaboration": {
    key: "tender-collaboration",
    pageLabel: "Collaboration",
    steps: [
      {
        target: "guide-tender-collaboration-summary",
        title: "En un coup d'œil",
        body: "Taille de l'équipe, tâches par statut, échéances proches et validations en attente sur ce dossier.",
      },
      {
        target: "guide-tender-collaboration-team",
        title: "L'équipe du dossier",
        body: "Choisissez un membre de l'organisation et son rôle sur ce dossier, puis cliquez sur « Ajouter ». « Retirer » l'enlève de l'équipe, selon vos droits.",
      },
      {
        target: "guide-tender-collaboration-approvals",
        title: "Demandes de validation",
        body: "Choisissez une tâche et un approbateur, puis cliquez sur « Demander une validation » (selon votre forfait). L'approbateur valide, demande des modifications ou rejette.",
      },
      {
        target: "guide-tender-collaboration-tasks",
        title: "Tâches",
        body: "Créez une tâche avec sa priorité et son responsable, filtrez par statut, changez son statut ou cliquez sur « Commenter » pour échanger avec l'équipe.",
      },
      {
        target: "guide-tender-collaboration-activity",
        title: "Activité récente",
        body: "Retrouvez l'historique des actions menées sur ce dossier : qui a fait quoi, et quand.",
      },
    ],
  },
  "tender-assistant": {
    key: "tender-assistant",
    pageLabel: "Assistant IA",
    steps: [
      {
        target: "guide-tender-assistant-conversations",
        title: "Vos conversations",
        body: "Cliquez sur « + Nouvelle conversation » pour démarrer un échange, ou sur une conversation existante pour la reprendre. « Archiver » la retire de la liste.",
      },
      {
        // Conditionnelle : seulement tant qu'aucune conversation n'est ouverte.
        target: "guide-tender-assistant-suggestions",
        title: "Questions suggérées",
        body: "Cliquez sur un exemple (date limite, critères, pièces manquantes, risques) pour le poser directement à l'assistant.",
      },
      {
        target: "guide-tender-assistant-thread",
        title: "Réponses et sources",
        body: "Les échanges s'affichent ici. Chaque réponse cite ses sources : dépliez « Sources » pour voir le document ou la fiche utilisés.",
      },
      {
        target: "guide-tender-assistant-composer",
        title: "Poser une question",
        body: "Saisissez votre question sur ce dossier puis cliquez sur « Envoyer ». L'assistant ne modifie jamais vos données.",
      },
    ],
  },
  "tender-technical-memo": {
    key: "tender-technical-memo",
    pageLabel: "Rédaction IA du mémoire",
    steps: [
      {
        // Conditionnelle : tant qu'aucun mémoire n'a été créé.
        target: "guide-tender-technical-memo-template",
        title: "Choisir le modèle",
        body: "Choisissez « Générer sans modèle » (modèle standard TenderOS), le modèle de votre entreprise ou la trame imposée par le DCE, à fournir en .docx.",
      },
      {
        // Conditionnelle : tant qu'aucun mémoire n'a été créé.
        target: "guide-tender-technical-memo-create",
        title: "Créer le mémoire",
        body: "Cliquez sur « Créer et analyser » : TenderOS crée le mémoire et en dégage les sections à rédiger.",
      },
      {
        // Conditionnelle : une fois le mémoire créé.
        target: "guide-tender-technical-memo-toolbar",
        title: "Mapper, préparer, exporter",
        body: "Cliquez sur « Mapper aux exigences DCE » pour suivre la couverture, puis « Préparer le gabarit » et « Exporter le DOCX final » quand les sections sont à jour.",
      },
      {
        // Conditionnelle : une fois le mémoire créé.
        target: "guide-tender-technical-memo-sections",
        title: "Rédiger section par section",
        body: "Cliquez sur « Générer » pour rédiger une section, ajoutez une instruction si besoin, relisez ses sources, modifiez le texte puis cliquez sur « Valider ».",
      },
    ],
  },
  "tender-administrative-dossier": {
    key: "tender-administrative-dossier",
    pageLabel: "Dossier administratif",
    steps: [
      {
        target: "guide-tender-administrative-dossier-summary",
        title: "Complétude et validation",
        body: "Suivez la complétude du dossier administratif et son état de validation humaine. La signature se gère dans l'onglet « Signature ».",
      },
      {
        // Conditionnelle : seulement quand des pièces obligatoires manquent ou ont expiré.
        target: "guide-tender-administrative-dossier-blockers",
        title: "Points bloquants",
        body: "Les pièces obligatoires manquantes ou expirées, et les autres points à traiter, s'affichent ici. Ouvrez la checklist pour les régler.",
      },
      {
        target: "guide-tender-administrative-dossier-actions",
        title: "Checklist et pièces structurées",
        body: "Cliquez sur « Ouvrir la checklist » pour suivre les pièces, ou ouvrez l'écran groupement, DC1/DC2/DUME, sous-traitance, acte d'engagement et pouvoirs.",
      },
      {
        target: "guide-tender-administrative-dossier-forms",
        title: "Formulaires officiels",
        body: "DC1, DC2 et DC4 sont préremplis depuis le dossier. Cliquez sur « Prévisualiser » pour vérifier les champs, puis sur « Générer le DOCX » si besoin.",
      },
    ],
  },
  "tender-pricing-schedule": {
    key: "tender-pricing-schedule",
    pageLabel: "Chiffrage",
    steps: [
      {
        target: "guide-tender-pricing-schedule-section",
        title: "Du DCE au fichier financier",
        body: "Le chiffrage part des fichiers BPU, DPGF ou DQE de votre DCE : vous saisissez vos prix, validez, puis générez une copie du classeur acheteur avec vos prix.",
      },
      {
        // Conditionnelle : seulement si le DCE contient un fichier financier pas encore chiffré.
        target: "guide-tender-pricing-schedule-detected",
        title: "Fichiers financiers détectés",
        body: "Les fichiers financiers repérés dans le DCE s'affichent ici. Cliquez sur « Créer le chiffrage » pour démarrer, sans réimporter le fichier.",
      },
      {
        target: "guide-tender-pricing-schedule-schedules",
        title: "Vos chiffrages",
        body: "Chaque chiffrage correspond à un fichier financier du DCE : cliquez dessus pour ouvrir son détail. Sans fichier détecté, importez d'abord le DCE.",
      },
      {
        // Conditionnelle : seulement quand un chiffrage est ouvert.
        target: "guide-tender-pricing-schedule-detail",
        title: "Extraire et saisir vos prix",
        body: "Cliquez sur « Extraire les lignes du classeur », saisissez le prix unitaire des lignes puis « OK », et vérifiez les anomalies signalées par les contrôles.",
      },
      {
        // Conditionnelle : seulement quand les lignes du chiffrage ont été extraites.
        target: "guide-tender-pricing-schedule-finalize",
        title: "Valider et générer",
        body: "Cliquez sur « Valider le chiffrage » (justification requise si des erreurs subsistent), puis sur « Générer les fichiers financiers ».",
      },
    ],
  },
  "tender-pricing": {
    key: "tender-pricing",
    pageLabel: "Estimation & coûts IA",
    steps: [
      {
        target: "guide-tender-pricing-costs",
        title: "Coût IA réel",
        body: "Le coût technique IA réellement consommé par ce dossier, au total et par type de tâche. « Coût non disponible » tant qu'aucun coût n'est connu.",
      },
      {
        // Conditionnelle : seulement quand une estimation est active.
        target: "guide-tender-pricing-estimate",
        title: "Estimation active",
        body: "Montant prévisionnel indicatif et son détail. Cliquez sur « Recalculer » (raison obligatoire) pour créer une nouvelle version, ou sur « Archiver ».",
      },
      {
        // Conditionnelle : sans estimation active, pour les rôles autorisés à estimer.
        target: "guide-tender-pricing-create",
        title: "Créer une estimation",
        body: "Cliquez sur « Nouvelle estimation », renseignez temps, taux horaire, effectif et frais, prévisualisez le coût IA puis cliquez sur « Calculer et enregistrer ».",
      },
      {
        target: "guide-tender-pricing-history",
        title: "Historique des estimations",
        body: "Toutes les estimations du dossier, actives et archivées. Cliquez sur « Voir la version » pour consulter une version passée, jamais recalculée.",
      },
    ],
  },
};
