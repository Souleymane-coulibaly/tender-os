// V2 Sprint 23A (landing, finalisation) — mission §42U "éviter de hardcoder la même FAQ à
// plusieurs endroits". SEULE source de vérité, consommée par `faq-section.tsx` (affichage) et par
// le JSON-LD `FAQPage` (`page.tsx`) — les deux DOIVENT rester identiques (mission §42T "aucune
// information trompeuse", le schema ne doit jamais diverger du contenu réellement affiché).

export type LandingFaqItem = Readonly<{ question: string; answer: string }>;

export const LANDING_FAQ: readonly LandingFaqItem[] = [
  {
    question: "Qu'est-ce que TenderOS ?",
    answer:
      "TenderOS est une plateforme de gestion et de préparation des réponses aux appels d'offres. Elle permet de centraliser le DCE, analyser les documents, extraire les exigences, préparer les pièces administratives, les mémoires techniques, les chiffrages et le package final.",
  },
  {
    question: "TenderOS fonctionne-t-il avec les marchés publics et privés ?",
    answer: "Oui. TenderOS est conçu pour accompagner la préparation des réponses aux appels d'offres publics et privés.",
  },
  {
    question: "Puis-je utiliser TenderOS pour un seul appel d'offres ?",
    answer: "Oui. Le Pass AO à 99 € HT permet de traiter ponctuellement un appel d'offres sans souscrire à un abonnement.",
  },
  {
    question: "Que comprend le Pass AO ?",
    answer:
      "Le Pass AO donne accès aux fonctionnalités métier cœur de Starter pour un dossier unique, sans abonnement récurrent. Les fonctions Business et Entreprise, comme les circuits de validation avancés, l'API ou les Webhooks, ne sont pas incluses.",
  },
  {
    question: "Comment fonctionnent les crédits AO ?",
    answer:
      "Starter reçoit 2 crédits AO par mois avec un report jusqu'à 6 crédits disponibles. Business reçoit 10 crédits AO par mois avec un report jusqu'à 60 crédits. Les crédits non utilisés sont conservés jusqu'au plafond du forfait.",
  },
  {
    question: "Que se passe-t-il avec un abonnement annuel ?",
    answer:
      "L'abonnement annuel est payé en une fois et offre un mois. Les crédits AO continuent cependant à être attribués chaque mois : ils ne sont pas tous crédités au début de l'année.",
  },
  {
    question: "Puis-je changer de forfait ?",
    answer: "Oui. Le passage d'un forfait à un autre est prévu dans TenderOS. Les règles de changement de plan sont gérées sans supprimer les dossiers ou données existantes.",
  },
  {
    question: "Mes données sont-elles supprimées si j'atteins une limite ?",
    answer:
      "Non. Lorsqu'un quota est atteint, TenderOS bloque uniquement la nouvelle consommation concernée. Les dossiers et documents existants restent accessibles selon les droits de l'utilisateur.",
  },
  {
    question: "Puis-je travailler avec plusieurs personnes ?",
    answer: "Oui. Starter inclut la collaboration simple. Business et Entreprise ajoutent des fonctions de collaboration avancée et des circuits de validation.",
  },
  {
    question: "TenderOS peut-il générer un mémoire technique ?",
    answer:
      "Oui. TenderOS peut analyser votre modèle DOCX ou utiliser un modèle TenderOS, puis générer le contenu à partir du DCE, des données entreprise, des références et de la bibliothèque intelligente, tout en conservant une validation humaine.",
  },
  {
    question: "TenderOS peut-il traiter les BPU, DPGF et DQE ?",
    answer:
      "Oui. TenderOS peut détecter ces fichiers dans le DCE, extraire les lignes, permettre le chiffrage, contrôler les incohérences et générer une version finale à partir du fichier original lorsque le format le permet.",
  },
  {
    question: "TenderOS remplit-il les documents administratifs ?",
    answer: "TenderOS permet de préparer les pièces administratives intégrées au workflow et de générer ou préremplir les documents pris en charge selon les formats disponibles.",
  },
  {
    question: "TenderOS prend-il la décision GO / NO-GO à ma place ?",
    answer: "Non. TenderOS fournit des informations, analyses et indicateurs pour aider à la décision. La validation finale reste toujours humaine.",
  },
  {
    question: "Quelles intégrations sont disponibles ?",
    answer:
      "TenderOS propose des intégrations avec Microsoft 365 et Google Workspace, ainsi qu'une API publique et des Webhooks pour le forfait Entreprise. Des automatisations peuvent également être réalisées avec des outils comme n8n ou Make via ces interfaces.",
  },
  {
    question: "Ai-je besoin d'installer un logiciel ?",
    answer: "Non. TenderOS est une application SaaS accessible depuis un navigateur moderne.",
  },
  {
    question: "Puis-je utiliser mes propres modèles Word ?",
    answer: "Oui. Vous pouvez importer votre propre modèle DOCX de mémoire technique. TenderOS analyse sa structure et génère le contenu sans modifier volontairement l'organisation générale du document.",
  },
  {
    question: "TenderOS peut-il fonctionner avec plusieurs clients ou entreprises candidates ?",
    answer: "Oui. TenderOS permet de structurer les dossiers selon les organisations, clients, entreprises candidates, lots et sous-traitants selon les droits configurés.",
  },
  {
    question: "Puis-je connecter TenderOS à n8n ou Make ?",
    answer: "Oui, avec le forfait Entreprise via API et Webhooks. Ceci n'est pas un connecteur natif : aucun node/application natif TenderOS n'est publié dans leurs catalogues respectifs.",
  },
  {
    question: "Comment fonctionne l'intelligence artificielle ?",
    answer:
      "L'IA de TenderOS travaille à partir du contexte du dossier : DCE, lot, exigences, entreprise candidate, documents, bibliothèque et autres données autorisées. Elle assiste l'utilisateur mais ne remplace pas les validations humaines.",
  },
  {
    question: "Puis-je demander un accompagnement personnalisé ?",
    answer: "Oui. L'offre Conseil est disponible sur devis pour les besoins de paramétrage, formation, accompagnement ou intégrations spécifiques.",
  },
] as const;
