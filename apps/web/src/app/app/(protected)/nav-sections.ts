import { canUseMarketWatch } from "../../../lib/market-watch-types";
import { isOrganizationAdmin } from "../../../lib/authorization";

/** Pictogramme d'une entrée du menu latéral (dessins : `nav-icons.tsx`). */
export type NavIconName =
  | "dashboard"
  | "tenders"
  | "opportunities"
  | "watch"
  | "validations"
  | "documents"
  | "knowledge"
  | "clients"
  | "companies"
  | "subcontractors"
  | "subscription"
  | "members"
  | "integrations"
  | "ai"
  | "costs";

export type NavLink = Readonly<{
  href: string;
  label: string;
  /** Une clé, jamais un composant : la liste reste de la donnée pure (sérialisable). */
  icon: NavIconName;
  tourTarget?: string;
  /** Checkpoint TENDEROS-2.1-P2.3-E6 (mission §16/§17) — absent = visible à tout rôle authentifié
   *  (lecture largement ouverte côté backend pour cette route, ex. Billing/AI config/Pricing :
   *  seules les mutations y sont gate-ées, jamais la lecture). Présent = même capability helper déjà
   *  utilisé par la page cible, JAMAIS une règle réinventée ici (audit §11/§12 : ne pas créer un
   *  second moteur RBAC). N'affiche jamais un lien qui mènerait systématiquement à un état
   *  "Accès refusé" plein écran (mission §14 "ne pas afficher des boutons morts"). */
  isVisible?: (role: string | undefined) => boolean;
}>;
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
    items: [{ href: "/app", label: "Tableau de bord", icon: "dashboard", tourTarget: "dashboard" }],
  },
  {
    label: "Activités",
    items: [
      { href: "/app/tenders", label: "Appels d'offres", icon: "tenders", tourTarget: "tenders" },
      { href: "/app/opportunities", label: "Opportunités", icon: "opportunities" },
      // Checkpoint E6 — audit §23 : `canUseMarketWatch` exclut déjà READ_ONLY/EXTERNAL_CONSULTANT
      // au niveau des actions de la page ; la nav restait la seule surface encore non filtrée.
      { href: "/app/market-watch", label: "Veille", icon: "watch", tourTarget: "market-watch", isVisible: canUseMarketWatch },
      { href: "/app/validations", label: "Mes validations", icon: "validations" },
    ],
  },
  {
    label: "Ressources",
    items: [
      { href: "/app/documents", label: "Documents", icon: "documents", tourTarget: "documents" },
      { href: "/app/knowledge", label: "Base de connaissances", icon: "knowledge", tourTarget: "knowledge" },
      { href: "/app/clients", label: "Clients", icon: "clients" },
      { href: "/app/candidate-companies", label: "Entreprises candidates", icon: "companies" },
      { href: "/app/subcontractor-profiles", label: "Sous-traitants", icon: "subcontractors" },
    ],
  },
  {
    label: "Paramètres",
    items: [
      { href: "/app/subscription", label: "Abonnement & utilisation", icon: "subscription", tourTarget: "subscription" },
      // Checkpoint E7 — audit §35, preuve HTTP+PostgreSQL réelle
      // (`organization-memberships-authorization-http.integration.spec.ts`) : contrairement à
      // l'hypothèse implicite d'E6 (jamais vérifiée), `OrganizationPermission.MemberList` est
      // restreint à OWNER/ORGANIZATION_ADMIN — même palier que Intégrations ci-dessous, PAS le
      // palier "lecture ouverte à tous" de Billing/AI-config/Pricing. Corrige un angle mort d'E6
      // (E6-D1) : "Membres" menait vraiment à un "Accès refusé" pour BID_MANAGER/CONTRIBUTOR/
      // EXTERNAL_CONSULTANT/READ_ONLY, jamais filtré jusqu'ici.
      { href: "/app/members", label: "Membres", icon: "members", isVisible: isOrganizationAdmin },
      // Checkpoint E6 — audit §29/§33 : confirmé via `IntegrationPermission` (backend) que
      // Read/Manage sont TOUS DEUX restreints à OWNER/ORGANIZATION_ADMIN, contrairement à
      // Billing/AI-config/Pricing (lecture ouverte à tout rôle, seules les mutations gate-ées) —
      // "l'existence même d'un webhook/d'une clé API est une information organisationnelle
      // sensible" (commentaire backend). 200 OK backend confirmé pour AI models même en READ_ONLY,
      // donc Configuration IA reste volontairement PAS filtrée ci-dessous.
      { href: "/app/integrations/api-keys", label: "Intégrations", icon: "integrations", tourTarget: "integrations", isVisible: isOrganizationAdmin },
      // Une seule entrée IA : le choix du modèle par fonctionnalité (ex-« IA / Modèles ») est un
      // onglet de Configuration IA, « Choix des modèles » — deux entrées « IA » se confondaient.
      { href: "/app/ai-configuration/models", label: "Configuration IA", icon: "ai" },
      // Coût technique IA réel de l'organisation — jamais l'abonnement (« Abonnement & utilisation »),
      // avec lequel l'ancien libellé « Pricing organisation » se confondait.
      { href: "/app/pricing", label: "Coûts IA", icon: "costs" },
    ],
  },
];

/** Checkpoint TENDEROS-2.1-P2.3-E6 — projection capability-aware de `NAV_SECTIONS` (mission §16
 *  NAVIGATION_CAPABILITY_MATRIX). Une section qui n'a plus aucun item visible disparaît entièrement
 *  (jamais un titre de section orphelin sans contenu). Reste un confort UX : la page cible revalide
 *  toujours son propre accès côté serveur (mission §17 "masquer un menu ne suffit pas"). */
export function getVisibleNavSections(actorRole: string | undefined): readonly NavSection[] {
  return NAV_SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) => !item.isVisible || item.isVisible(actorRole)) })).filter(
    (section) => section.items.length > 0,
  );
}
