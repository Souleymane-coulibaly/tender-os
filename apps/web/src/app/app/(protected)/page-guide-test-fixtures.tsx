import Link from "next/link";
import type { ReactNode } from "react";
import { usePageGuides } from "../../../components/page-guide/page-guide-context";
import { PageHeader } from "../../../components/ui/page-header";
import type { PageGuideRegistry } from "../../../lib/page-guide-runtime";
import { PAGE_GUIDES, type PageGuideKey } from "../../../lib/page-guides";
import type { TourStep } from "../../../lib/tour-steps";
import { PageGuideProvider } from "./page-guide-provider";
import { PageGuideTooltip } from "./page-guide-tooltip";
import { TourProvider, useTour } from "./tour-provider";
import { TourTooltip } from "./tour-tooltip";

// Fixtures partagées des tests des guides (visite de bienvenue et guides de page) — jamais importé
// par le produit. Les `vi.mock` restent dans chaque fichier de test (hissés par fichier).

export const TEST_TOUR_STEPS: readonly TourStep[] = [
  { id: "dashboard", target: "dashboard", title: "Votre centre de pilotage", body: "Suivez vos dossiers.", href: "/app" },
  { id: "tenders", target: "tenders", title: "Pilotez vos réponses", body: "Retrouvez vos dossiers.", href: "/app/tenders" },
];

/** Registre injecté : le contenu réel (`PAGE_GUIDES`) n'est jamais une dépendance des tests du moteur. */
export const TEST_GUIDES: PageGuideRegistry = {
  ...PAGE_GUIDES,
  tenders: {
    key: "tenders",
    pageLabel: "Appels d'offres",
    steps: [
      { target: "guide-tenders-filters", title: "Filtrer vos dossiers", body: "Retrouvez un dossier par statut." },
      { target: "guide-tenders-absent", title: "Étape sans cible", body: "Cette cible n'est jamais à l'écran." },
      { target: "guide-tenders-list", title: "Vos dossiers", body: "Chaque ligne ouvre un dossier." },
    ],
  },
};

export function GlobalTourControls() {
  const { startTour } = useTour();
  return (
    <button type="button" onClick={() => void startTour()}>
      Démarrer la visite de bienvenue
    </button>
  );
}

export function SeenProbe({ guideKey }: { guideKey: PageGuideKey }) {
  const context = usePageGuides();
  return <output aria-label="État du guide">{context?.isSeen(guideKey) ? "vu" : "non vu"}</output>;
}

/** Arbre applicatif minimal : mêmes fournisseurs et panneaux que `(protected)/layout.tsx`. */
export function GuideTestApp({
  seen = [],
  hasEverInteractedWithTour = true,
  children,
}: {
  seen?: readonly PageGuideKey[] | null;
  hasEverInteractedWithTour?: boolean;
  children: ReactNode;
}) {
  return (
    <TourProvider steps={TEST_TOUR_STEPS} hasEverInteractedWithTour={hasEverInteractedWithTour}>
      <PageGuideProvider seenGuideKeys={seen} guides={TEST_GUIDES}>
        <nav aria-label="Menu">
          <Link href="/app" data-tour="dashboard">
            Tableau de bord
          </Link>
          <Link href="/app/tenders" data-tour="tenders">
            Dossiers
          </Link>
        </nav>
        <GlobalTourControls />
        <SeenProbe guideKey="tenders" />
        {children}
        <TourTooltip />
        <PageGuideTooltip />
      </PageGuideProvider>
    </TourProvider>
  );
}

export function TendersTestPage({ withTargets = true }: { withTargets?: boolean }) {
  return (
    <>
      <PageHeader title="Appels d'offres" guideKey="tenders" actions={<button type="button">Nouveau dossier</button>} />
      {withTargets ? (
        <>
          <div data-tour="guide-tenders-filters">Filtres</div>
          <div data-tour="guide-tenders-list">Liste</div>
        </>
      ) : null}
    </>
  );
}
