export type NavLink = Readonly<{ href: string; label: string; tourTarget?: string }>;
export type NavSection = Readonly<{ label: string; items: readonly NavLink[] }>;

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — mission §25F.6 : regroupement de la sidebar en sections
 * lisibles, à partir des routes RÉELLEMENT existantes uniquement (aucune route inventée). Reprend
 * l'ensemble exact des entrées de l'ancien `NAV_ITEMS` plat (Sprint 25 Guide interactif), qui reste
 * la seule source d'autorité sur les `data-tour` (`tour-steps.ts`) — jamais une seconde liste
 * divergente.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: "Vue d'ensemble",
    items: [{ href: "/app", label: "Tableau de bord", tourTarget: "dashboard" }],
  },
  {
    label: "Activités",
    items: [
      { href: "/app/tenders", label: "Appels d'offres", tourTarget: "tenders" },
      { href: "/app/opportunities", label: "Opportunités" },
      { href: "/app/market-watch", label: "Veille", tourTarget: "market-watch" },
      { href: "/app/validations", label: "Mes validations" },
    ],
  },
  {
    label: "Ressources",
    items: [
      { href: "/app/documents", label: "Documents", tourTarget: "documents" },
      { href: "/app/knowledge", label: "Base de connaissances", tourTarget: "knowledge" },
      { href: "/app/clients", label: "Clients" },
      { href: "/app/candidate-companies", label: "Entreprises candidates" },
      { href: "/app/subcontractor-profiles", label: "Sous-traitants" },
    ],
  },
  {
    label: "Paramètres",
    items: [
      { href: "/app/subscription", label: "Abonnement & utilisation", tourTarget: "subscription" },
      { href: "/app/integrations/api-keys", label: "Intégrations", tourTarget: "integrations" },
      { href: "/app/ai-configuration/models", label: "Configuration IA" },
      { href: "/app/pricing", label: "Pricing organisation" },
    ],
  },
];
