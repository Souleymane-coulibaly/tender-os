import type { LandingFaqItem } from "./landing-faq";

// V2 Sprint 25 (Pricing dédié) — mission §25.51 "FAQ PRICING", questions commerciales/facturation
// distinctes de `LANDING_FAQ` (produit/fonctionnel) : les deux catalogues restent séparés (jamais
// fusionnés) car ils répondent à des intentions différentes, mais partagent le même type et le même
// composant d'affichage (`FaqSection`), jamais une deuxième implémentation d'accordéon.

export const PRICING_FAQ: readonly LandingFaqItem[] = [
  {
    question: "Comment fonctionne l'essai Starter ?",
    answer:
      "L'essai Starter dure 14 jours. Une carte bancaire est enregistrée dès le départ mais aucun montant n'est débité pendant l'essai : vous avez accès à l'ensemble des fonctionnalités et quotas Starter pendant toute sa durée.",
  },
  {
    question: "Quand serai-je débité ?",
    answer:
      "Le premier débit intervient automatiquement à la fin des 14 jours d'essai, si vous n'avez pas résilié avant cette date. Le montant facturé correspond au forfait Starter choisi, mensuel ou annuel.",
  },
  {
    question: "Puis-je résilier avant la fin des 14 jours ?",
    answer: "Oui. Vous pouvez résilier à tout moment pendant l'essai depuis votre espace Abonnement. Aucun montant n'est débité si la résiliation intervient avant la fin des 14 jours.",
  },
  {
    question: "Ai-je besoin d'une carte bancaire ?",
    answer: "Oui, une carte bancaire est requise pour démarrer l'essai Starter. TenderOS ne stocke aucune donnée de carte : le paiement est géré directement par Stripe.",
  },
  {
    question: "Comment fonctionnent les crédits AO ?",
    answer:
      "Starter reçoit 2 crédits AO par mois et Business 10 crédits AO par mois, avec un report possible jusqu'au plafond du forfait. Entreprise dispose de crédits AO illimités en fair-use.",
  },
  {
    question: "Les crédits sont-ils reportables ?",
    answer: "Oui, dans la limite du plafond de report du forfait : jusqu'à 6 crédits pour Starter et 60 crédits pour Business. Au-delà de ce plafond, les crédits non utilisés ne sont pas cumulés.",
  },
  {
    question: "Comment fonctionne le paiement annuel ?",
    answer:
      "L'abonnement annuel est facturé en une seule fois et équivaut à un mois offert par rapport au paiement mensuel. Les crédits AO continuent néanmoins à être attribués chaque mois, jamais tous en une fois en début d'année.",
  },
  {
    question: "Puis-je changer de forfait ?",
    answer: "Oui. Le passage d'un forfait à un autre est prévu depuis votre espace Abonnement, sans suppression des dossiers ou données existantes.",
  },
  {
    question: "Que se passe-t-il lorsque j'atteins une limite ?",
    answer: "TenderOS bloque uniquement la nouvelle consommation concernée par la limite atteinte (crédits AO, utilisateurs, messages Chat IA ou stockage). Les dossiers et documents déjà créés restent accessibles.",
  },
  {
    question: "Puis-je acheter uniquement un Pass ?",
    answer: "Oui. Le Pass AO à 99 € HT permet de traiter un appel d'offres ponctuel avec les fonctionnalités métier Starter, sans engagement ni abonnement récurrent.",
  },
  {
    question: "Quelle différence entre Starter et Business ?",
    answer: "Business offre davantage de crédits AO, d'utilisateurs, de messages Chat IA et de stockage que Starter, ainsi que la collaboration avancée et les circuits de validation, absents de Starter.",
  },
  {
    question: "Quand utiliser Entreprise ?",
    answer: "Le forfait Entreprise convient aux organisations avec des besoins avancés : crédits AO et utilisateurs illimités en fair-use, API publique, Webhooks et connecteurs d'automatisation comme n8n ou Make.",
  },
  {
    question: "Mes données restent-elles accessibles après résiliation ?",
    answer:
      "Vos données (dossiers, documents, bibliothèque, configuration) ne sont jamais supprimées après une résiliation. L'accès peut être limité selon votre statut d'abonnement, mais aucune donnée n'est perdue.",
  },
] as const;
