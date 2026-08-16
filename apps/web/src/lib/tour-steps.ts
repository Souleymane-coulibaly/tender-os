// V2 Sprint 25 (Guide interactif) — mission §25.72-§25.90. Chaque étape cible un élément RÉEL et
// STABLE (mission §25.86 "data-tour=... jamais un selector nth-child fragile") : les liens de la
// barre latérale (`(protected)/layout.tsx`), toujours présents sur toute page `/app/*`, jamais un
// élément propre à une seule route qui obligerait à orchestrer une navigation synchronisée.
//
// Mission §25.73 propose 8 thèmes ("Analyse DCE", "Collaboration" inclus) ; ce produit n'a
// aujourd'hui aucune entrée de navigation dédiée à ces deux thèmes (l'analyse DCE et la
// collaboration ont lieu À L'INTÉRIEUR d'un dossier, jamais comme destination autonome) — les
// pointer vers un `data-tour` inventé aurait violé la même règle anti-fabrication que mission §25.56
// "uniquement routes réellement disponibles". Leur contenu est donc plié dans l'étape "Appels
// d'offres" (copie honnête : "ouvrez un dossier pour...", jamais une fausse destination séparée).

export type TourStepId = "dashboard" | "market-watch" | "tenders" | "knowledge" | "documents" | "integrations" | "subscription";

export type TourStep = Readonly<{
  id: TourStepId;
  target: string;
  title: string;
  body: string;
  href: string;
}>;

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "dashboard",
    target: "dashboard",
    title: "Votre centre de pilotage",
    body: "Suivez vos dossiers, échéances, opportunités et votre utilisation depuis un seul écran.",
    href: "/app",
  },
  {
    id: "market-watch",
    target: "market-watch",
    title: "Trouvez les bonnes opportunités",
    body: "Configurez vos critères et TenderOS vous alerte lorsqu'un marché correspond à vos besoins.",
    href: "/app/market-watch",
  },
  {
    id: "tenders",
    target: "tenders",
    title: "Pilotez vos réponses",
    body: "Retrouvez ici vos dossiers en préparation et finalisés. Ouvrez-en un pour analyser son DCE : lots, exigences, documents attendus, critères et points de vigilance, puis collaborer avec votre équipe.",
    href: "/app/tenders",
  },
  {
    id: "knowledge",
    target: "knowledge",
    title: "Capitalisez vos réponses",
    body: "Centralisez vos références, certifications et contenus réutilisables.",
    href: "/app/knowledge",
  },
  {
    id: "documents",
    target: "documents",
    title: "Préparez votre dossier final",
    body: "Mémoire technique, administratif, BPU/DPGF/DQE et package final sont intégrés au workflow.",
    href: "/app/documents",
  },
  {
    id: "integrations",
    target: "integrations",
    title: "Connectez vos outils",
    body: "API et Webhooks vous permettent de relier TenderOS à vos outils métier.",
    href: "/app/integrations/api-keys",
  },
  {
    id: "subscription",
    target: "subscription",
    title: "Suivez votre utilisation",
    body: "Consultez crédits AO, utilisation IA, stockage et abonnement.",
    href: "/app/subscription",
  },
] as const;

/**
 * mission §25.84 "GUIDE PLAN-AWARE" — "integrations" (API/Webhooks) n'est montrée que si
 * l'organisation dispose réellement de l'entitlement `PUBLIC_API` ou `WEBHOOKS` (jamais un nom de
 * palier codé en dur : une organisation avec un entitlement accordé manuellement doit voir l'étape
 * même sur un palier qui ne l'inclut pas par défaut, mission "toujours les Entitlements réels").
 * mission §25.73 "max 8 étapes" — ce produit en propose 7 au maximum (Enterprise/override),
 * 6 sinon, toujours sous le plafond.
 */
export function resolveTourSteps(hasApiOrWebhooksEntitlement: boolean): readonly TourStep[] {
  return hasApiOrWebhooksEntitlement ? TOUR_STEPS : TOUR_STEPS.filter((step) => step.id !== "integrations");
}
