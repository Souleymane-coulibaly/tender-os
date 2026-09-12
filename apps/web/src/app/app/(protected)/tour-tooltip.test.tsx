import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUIDE_TARGET_HIGHLIGHT_CLASS } from "./guide-tooltip-panel";
import { GlobalTourControls, TEST_TOUR_STEPS } from "./page-guide-test-fixtures";
import { TourProvider } from "./tour-provider";
import { TourTooltip } from "./tour-tooltip";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }), usePathname: () => "/app" }));

const updateTourStateAction = vi.fn(async (_action: string) => ({}));
vi.mock("../tour-actions", () => ({ updateTourStateAction: (action: string) => updateTourStateAction(action) }));

// Le fixture importe aussi le fournisseur des guides de page (et donc ses actions serveur).
vi.mock("../page-guide-actions", () => ({ recordPageGuideAction: vi.fn(async () => ({})) }));

function renderTour() {
  return render(
    <TourProvider steps={TEST_TOUR_STEPS} hasEverInteractedWithTour>
      <nav>
        <Link href="/app" data-tour="dashboard">
          Tableau de bord
        </Link>
        <Link href="/app/tenders" data-tour="tenders">
          Dossiers
        </Link>
      </nav>
      <GlobalTourControls />
      <TourTooltip />
    </TourProvider>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  pushMock.mockClear();
  updateTourStateAction.mockClear();
});

/** Non-régression de la visite de bienvenue après extraction du panneau partagé : mêmes textes,
 *  mêmes libellés, mêmes appels (tests/guide.spec.ts s'appuie dessus). */
describe("TourTooltip (visite de bienvenue)", () => {
  it("parcourt les étapes avec les mêmes textes et libellés, et enregistre COMPLETE", async () => {
    const user = userEvent.setup();
    renderTour();

    await user.click(screen.getByRole("button", { name: "Démarrer la visite de bienvenue" }));
    const dialog = await screen.findByRole("dialog");
    expect(updateTourStateAction).toHaveBeenCalledWith("START");
    expect(dialog).toHaveAttribute("aria-labelledby", "tour-tooltip-title");
    expect(dialog).toHaveAccessibleName("Votre centre de pilotage");
    expect(dialog).toHaveTextContent("Étape 1 / 2");
    expect(screen.getByRole("button", { name: "Fermer la visite guidée" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tableau de bord" })).toHaveClass(GUIDE_TARGET_HIGHLIGHT_CLASS);

    await user.click(screen.getByRole("button", { name: "Suivant" }));
    expect(pushMock).toHaveBeenLastCalledWith("/app/tenders");
    expect(screen.getByRole("dialog")).toHaveTextContent("Étape 2 / 2");
    expect(screen.getByRole("link", { name: "Tableau de bord" })).not.toHaveClass(GUIDE_TARGET_HIGHLIGHT_CLASS);

    await user.click(screen.getByRole("button", { name: "Précédent" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Étape 1 / 2");

    await user.click(screen.getByRole("button", { name: "Suivant" }));
    await user.click(screen.getByRole("button", { name: "Terminer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateTourStateAction).toHaveBeenLastCalledWith("COMPLETE");
  });

  it("Passer enregistre DISMISS", async () => {
    const user = userEvent.setup();
    renderTour();
    await user.click(screen.getByRole("button", { name: "Démarrer la visite de bienvenue" }));
    await user.click(await screen.findByRole("button", { name: "Passer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateTourStateAction).toHaveBeenLastCalledWith("DISMISS");
  });

  it("Escape ferme la visite et enregistre DISMISS", async () => {
    const user = userEvent.setup();
    renderTour();
    await user.click(screen.getByRole("button", { name: "Démarrer la visite de bienvenue" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateTourStateAction).toHaveBeenLastCalledWith("DISMISS");
  });
});
