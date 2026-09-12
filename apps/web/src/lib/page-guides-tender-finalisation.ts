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
    steps: [
      {
        target: "guide-tender-deliverables-list",
        title: "Vos livrables",
        body: "Chaque dossier compte un livrable par type (mémoire technique, synthèse exécutive, matrice de conformité, checklist, rapports, annexes…), créé automatiquement.",
      },
      {
        target: "guide-tender-deliverables-card",
        title: "Ouvrir un livrable",
        body: "Cliquez sur une carte pour ouvrir le livrable : mémoire technique et synthèse s'éditent par sections, les rapports et le package final se consultent en lecture seule.",
      },
      {
        target: "guide-tender-deliverables-status",
        title: "Statut et dernière modification",
        body: "Le badge indique où en est le livrable (non démarré, brouillon, prêt pour revue, validé…) ; la date indique sa dernière modification.",
      },
    ],
  },
  "tender-generations": {
    key: "tender-generations",
    pageLabel: "Générations",
    steps: [
      {
        // Conditionnelle : réservée aux rôles autorisés à lancer une génération (pas en lecture seule).
        target: "guide-tender-generations-task-type",
        title: "Choisir le type de contenu",
        body: "Sélectionnez le contenu à produire par l'IA. Un type marqué « (non configuré) » ne peut pas encore être généré.",
      },
      {
        // Conditionnelle : réservée aux rôles autorisés à lancer une génération (pas en lecture seule).
        target: "guide-tender-generations-generate",
        title: "Lancer la génération",
        body: "Cliquez sur « Générer » : l'IA produit le contenu à partir des analyses du dossier et de votre base de connaissances.",
      },
      {
        target: "guide-tender-generations-list",
        title: "Vos générations",
        body: "Retrouvez chaque contenu généré avec son type, sa version et son statut. Toute génération doit être relue et validée par un humain avant utilisation.",
      },
      {
        // Conditionnelle : seulement quand au moins une génération existe.
        target: "guide-tender-generations-card",
        title: "Relire, éditer, valider",
        body: "Sur un contenu généré, cliquez sur « Éditer » ou « Régénérer », puis sur « Valider » ou « Rejeter ». En cas d'échec, cliquez sur « Réessayer ».",
      },
    ],
  },
  "tender-documents-generated": {
    key: "tender-documents-generated",
    pageLabel: "Documents générés",
    steps: [
      {
        // Conditionnelle : réservée aux rôles autorisés à générer un document.
        target: "guide-tender-documents-generated-new",
        title: "Nouveau document",
        body: "Choisissez un template activé, un titre facultatif et remplissez les champs. Sans template actif, un administrateur doit d'abord en activer un.",
      },
      {
        // Conditionnelle : seulement quand au moins un template a une version active.
        target: "guide-tender-documents-generated-generate",
        title: "Générer le DOCX",
        body: "Cliquez sur « Générer » pour produire un DOCX éditable. Un champ requis manquant bloque la génération, sauf si le template autorise la génération partielle.",
      },
      {
        target: "guide-tender-documents-generated-history",
        title: "Historique des documents",
        body: "Tous les documents générés pour ce dossier. Cliquez sur un titre pour afficher ses révisions et télécharger une révision terminée.",
      },
      {
        // Conditionnelle : seulement quand au moins un document a été généré.
        target: "guide-tender-documents-generated-document",
        title: "Révisions d'un document",
        body: "Chaque révision indique son statut et ses champs manquants. « Régénérer » crée une nouvelle révision ; l'ancienne reste inchangée.",
      },
    ],
  },
  "tender-validation": {
    key: "tender-validation",
    pageLabel: "Validation",
    steps: [
      {
        target: "guide-tender-validation-readiness",
        title: "Statut de préparation",
        body: "Le badge indique où en est le dossier, de la validation à la signature et au dépôt. Après approbation, un second badge signale si elle est toujours à jour.",
      },
      {
        // Conditionnelle : réservée aux rôles autorisés à lancer un contrôle (pas en lecture seule).
        target: "guide-tender-validation-run",
        title: "Lancer un contrôle",
        body: "Choisissez un aperçu généré dans l'onglet Export, puis cliquez sur « Lancer la validation » pour vérifier pièces obligatoires et contenus non validés.",
      },
      {
        target: "guide-tender-validation-controls",
        title: "Contrôles détectés",
        body: "Les contrôles du dernier lancement s'affichent ici. Saisissez une justification, puis cliquez sur « Résoudre » ou « Rouvrir ».",
      },
      {
        // Conditionnelle : après un contrôle, pour les rôles d'approbation, tant que rien n'est approuvé.
        target: "guide-tender-validation-approve",
        title: "Approuver la version finale",
        body: "Ajoutez un commentaire facultatif, puis cliquez sur « Approuver la version finale ». Impossible tant qu'un contrôle bloquant reste ouvert.",
      },
    ],
  },
  "tender-signature": {
    key: "tender-signature",
    pageLabel: "Signature",
    steps: [
      {
        target: "guide-tender-signature-requirements",
        title: "Exigences de signature",
        body: "Cliquez sur « Ajouter une exigence » pour indiquer un document à signer (ex. acte d'engagement), puis confirmez-la ou rejetez-la.",
      },
      {
        target: "guide-tender-signature-signatories",
        title: "Signataires",
        body: "Cliquez sur « Affecter un signataire » (prénom, nom, email professionnel), puis sur « Vérifier le pouvoir ». Seuls les signataires vérifiés sont proposés.",
      },
      {
        target: "guide-tender-signature-transactions",
        title: "Transactions de signature",
        body: "Suivez chaque transaction : « Démarrer », synchroniser, récupérer le document et la preuve, puis « Vérifier l'intégrité ». Un PDF signé peut aussi être importé.",
      },
      {
        // Conditionnelle : réservée aux rôles d'approbation (propriétaire, administrateur, responsable).
        target: "guide-tender-signature-prepare",
        title: "Préparer une transaction",
        body: "Choisissez un export FINAL (disponible après approbation dans l'onglet Validation) et des signataires vérifiés, puis cliquez sur « Préparer la transaction ».",
      },
    ],
  },
  "tender-submission-package": {
    key: "tender-submission-package",
    pageLabel: "Dossier de soumission",
    steps: [
      {
        // Conditionnelle : réservée aux rôles d'approbation (propriétaire, administrateur, responsable).
        target: "guide-tender-submission-package-create",
        title: "Constituer le package",
        body: "Cliquez sur « Constituer le package » : document exporté, pièces de signature vérifiées et manifest. Nécessite une approbation finale active.",
      },
      {
        // Conditionnelle : seulement quand la dernière version est terminée.
        target: "guide-tender-submission-package-ready",
        title: "Package prêt",
        body: "Ce bandeau confirme que la dernière version du package est constituée et rappelle son état de préparation.",
      },
      {
        target: "guide-tender-submission-package-history",
        title: "Historique des packages",
        body: "Chaque constitution crée une nouvelle version, jamais une mise à jour de la précédente. Retrouvez ici toutes les versions et leur statut.",
      },
      {
        // Conditionnelle : seulement quand au moins un package a été constitué.
        target: "guide-tender-submission-package-version",
        title: "Contenu d'une version",
        body: "Chaque version liste ses fichiers et leur origine. Cliquez sur « Télécharger le ZIP » pour récupérer un package terminé.",
      },
    ],
  },
  "tender-response-package": {
    key: "tender-response-package",
    pageLabel: "Dossier final",
    steps: [
      {
        target: "guide-tender-response-package-create",
        title: "Créer un dossier de réponse",
        body: "Choisissez un lot ou « Tous lots (dossier global) », puis cliquez sur « Créer le dossier de réponse ».",
      },
      {
        target: "guide-tender-response-package-packages",
        title: "Vos dossiers",
        body: "Chaque dossier (par lot ou global) affiche son statut. Cliquez sur un dossier pour afficher son détail et le construire.",
      },
      {
        // Conditionnelle : seulement une fois un dossier sélectionné.
        target: "guide-tender-response-package-build",
        title: "Construire le dossier",
        body: "Cliquez sur « Construire le dossier depuis la Checklist » pour rassembler les pièces déjà produites. Chaque reconstruction crée une nouvelle version.",
      },
      {
        // Conditionnelle : seulement une fois une version construite.
        target: "guide-tender-response-package-completeness",
        title: "Complétude",
        body: "Suivez les pièces obligatoires et facultatives disponibles et celles à vérifier. Une pièce facultative absente ne bloque jamais le dossier.",
      },
      {
        // Conditionnelle : seulement une fois une version construite.
        target: "guide-tender-response-package-finalize",
        title: "Valider et générer le ZIP",
        body: "Cliquez sur « Valider le dossier » pour figer la version, puis sur « Générer le package final » et « Télécharger le ZIP », prêt pour votre dépôt manuel.",
      },
    ],
  },
  "tender-submission": {
    key: "tender-submission",
    pageLabel: "Dépôt",
    steps: [
      {
        target: "guide-tender-submission-file-readiness",
        title: "Dossier prêt au dépôt",
        body: "Le badge indique si le dossier est complet. Les points bloquants ou à surveiller sont listés, avec un lien vers l'onglet concerné quand c'est possible.",
      },
      {
        target: "guide-tender-submission-readiness",
        title: "État de préparation",
        body: "Retrouvez le package à déposer (version et empreinte), la date limite de remise et le temps restant.",
      },
      {
        // Conditionnelle : seulement quand un dépôt peut être enregistré (package prêt, aucun dépôt actif).
        target: "guide-tender-submission-record",
        title: "Enregistrer un dépôt",
        body: "Après votre dépôt sur la plateforme acheteur, indiquez plateforme, date et références, puis cliquez sur « Enregistrer le dépôt ». TenderOS le trace, sans déposer.",
      },
      {
        // Conditionnelle : seulement quand un dépôt est en cours.
        target: "guide-tender-submission-active",
        title: "Suivre le dépôt actif",
        body: "Selon l'état du dépôt, ajoutez une preuve, confirmez le reçu, enregistrez un retrait ou un rejet. Rien n'est effectué sur la plateforme acheteur.",
      },
      {
        target: "guide-tender-submission-history",
        title: "Historique des dépôts",
        body: "Chaque dépôt enregistré apparaît ici, du plus récent au plus ancien, avec son statut, sa plateforme et sa date.",
      },
    ],
  },
  "tender-export": {
    key: "tender-export",
    pageLabel: "Export",
    steps: [
      {
        // Conditionnelle : réservée aux rôles autorisés à exporter (pas en lecture seule).
        target: "guide-tender-export-preview",
        title: "Nouvel aperçu",
        body: "Choisissez un template pour générer un aperçu du document. Si l'export n'est pas encore disponible, la raison s'affiche ici.",
      },
      {
        // Conditionnelle : seulement quand un template actif définit des sections.
        target: "guide-tender-export-sections",
        title: "Sources des sections",
        body: "Pour chaque section, choisissez sa source : génération IA, estimation de coût, contenu manuel ou annexe.",
      },
      {
        // Conditionnelle : seulement quand l'export est disponible et qu'un template est actif.
        target: "guide-tender-export-generate",
        title: "Générer l'aperçu",
        body: "Cliquez sur « Générer l'aperçu », puis sur « Télécharger ». L'export FINAL figé n'est produit qu'après approbation dans l'onglet Validation.",
      },
      {
        target: "guide-tender-export-history",
        title: "Historique des exports",
        body: "Chaque export (aperçu ou final) affiche son type, sa version, son statut et sa date. Cliquez sur « Télécharger » quand il est terminé.",
      },
    ],
  },
};
