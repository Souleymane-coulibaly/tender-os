import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuideTestApp, TendersTestPage } from "../../app/app/(protected)/page-guide-test-fixtures";
import { PageHeader } from "./page-header";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/tenders" }));

const recordPageGuideAction = vi.fn(async (_key: string, _action: string) => ({}));
vi.mock("../../app/app/page-guide-actions", () => ({ recordPageGuideAction: (key: string, action: string) => recordPageGuideAction(key, action) }));

vi.mock("../../app/app/tour-actions", () => ({ updateTourStateAction: vi.fn(async () => ({})) }));

const HEADER_CLASSES = "flex flex-col gap-4 rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between";
const BANNER_NAME = "Guide de la page Appels d'offres";

beforeEach(() => {
  window.sessionStorage.clear();
  recordPageGuideAction.mockClear();
});

describe("PageHeader", () => {
  it("sans guideKey : rendu inchangé — un seul bloc, aucun bouton de guide, aucun bandeau", () => {
    const { container } = render(<PageHeader title="Dossiers" description="Vos dossiers" actions={<button type="button">Nouveau</button>} />);
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.className).toBe(HEADER_CLASSES);
    expect(screen.getByRole("button", { name: "Nouveau" }).parentElement?.className).toBe("flex shrink-0 flex-wrap items-center gap-2");
    expect(screen.queryByRole("button", { name: "Guide de cette page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("sans guideKey ni actions : aucune zone d'actions", () => {
    const { container } = render(<PageHeader title="Dossiers" />);
    expect(container.firstElementChild?.children).toHaveLength(1);
  });

  it("guideKey hors PageGuideProvider : aucun bouton, aucune erreur", async () => {
    render(
      <>
        <PageHeader title="Appels d'offres" guideKey="tenders" />
        <div data-tour="guide-tenders-list">Liste</div>
      </>,
    );
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "Appels d'offres" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guide de cette page" })).not.toBeInTheDocument();
  });

  it("guideKey sans cible à l'écran : ni bouton ni bandeau, zone d'actions vide masquée", async () => {
    render(
      <GuideTestApp>
        <PageHeader title="Appels d'offres" guideKey="tenders" />
      </GuideTestApp>,
    );
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Guide de cette page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: BANNER_NAME })).not.toBeInTheDocument();
    const header = screen.getByRole("heading", { name: "Appels d'offres" }).closest(`[class="${HEADER_CLASSES}"]`);
    const actionsArea = header?.lastElementChild;
    expect(actionsArea).toHaveClass("empty:hidden");
    expect(actionsArea).toBeEmptyDOMElement();
  });

  it("guideKey et cibles présentes : bouton discret avant les actions existantes", async () => {
    render(
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>,
    );
    const guideButton = await screen.findByRole("button", { name: "Guide de cette page" });
    const actionButton = screen.getByRole("button", { name: "Nouveau dossier" });
    expect(guideButton.parentElement).toBe(actionButton.parentElement);
    expect(guideButton.compareDocumentPosition(actionButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("bandeau de première visite quand le guide n'a été ni terminé ni ignoré", async () => {
    render(
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>,
    );
    const banner = await screen.findByRole("region", { name: BANNER_NAME });
    expect(banner).toHaveTextContent("Nouveau sur Appels d'offres ? Découvrez-la en quelques étapes.");
  });

  it("aucun bandeau pour un guide déjà terminé ou ignoré (le bouton reste là)", async () => {
    render(
      <GuideTestApp seen={["tenders"]}>
        <TendersTestPage />
      </GuideTestApp>,
    );
    await screen.findByRole("button", { name: "Guide de cette page" });
    expect(screen.queryByRole("region", { name: BANNER_NAME })).not.toBeInTheDocument();
  });

  it("aucun bandeau tant que le bandeau de bienvenue est affiché", async () => {
    render(
      <GuideTestApp hasEverInteractedWithTour={false}>
        <TendersTestPage />
      </GuideTestApp>,
    );
    await screen.findByRole("button", { name: "Guide de cette page" });
    expect(screen.queryByRole("region", { name: BANNER_NAME })).not.toBeInTheDocument();
  });

  it("pendant la visite de bienvenue : bandeau masqué, bouton désactivé", async () => {
    const user = userEvent.setup();
    render(
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>,
    );
    await screen.findByRole("region", { name: BANNER_NAME });
    await user.click(screen.getByRole("button", { name: "Démarrer la visite de bienvenue" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: BANNER_NAME })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Guide de cette page" })).toBeDisabled();
  });

  it("« Plus tard » enregistre DISMISS et masque le bandeau", async () => {
    const user = userEvent.setup();
    render(
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>,
    );
    await screen.findByRole("region", { name: BANNER_NAME });
    await user.click(screen.getByRole("button", { name: "Plus tard" }));
    expect(screen.queryByRole("region", { name: BANNER_NAME })).not.toBeInTheDocument();
    expect(recordPageGuideAction).toHaveBeenCalledWith("tenders", "DISMISS");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
