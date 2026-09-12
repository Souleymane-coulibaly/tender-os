import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GUIDE_TARGET_HIGHLIGHT_CLASS } from "./guide-tooltip-panel";
import { GuideTestApp, TendersTestPage } from "./page-guide-test-fixtures";

const navigation = vi.hoisted(() => ({ pathname: "/app/tenders", push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push }), usePathname: () => navigation.pathname }));

const recordPageGuideAction = vi.fn(async (_key: string, _action: string): Promise<{ error?: string }> => ({}));
vi.mock("../page-guide-actions", () => ({ recordPageGuideAction: (key: string, action: string) => recordPageGuideAction(key, action) }));

const updateTourStateAction = vi.fn(async (_action: string) => ({}));
vi.mock("../tour-actions", () => ({ updateTourStateAction: (action: string) => updateTourStateAction(action) }));

const trackEvent = vi.fn();
vi.mock("../../../lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/analytics")>()),
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

beforeEach(() => {
  window.sessionStorage.clear();
  navigation.pathname = "/app/tenders";
  recordPageGuideAction.mockClear();
  updateTourStateAction.mockClear();
  trackEvent.mockClear();
});

async function startGuideFromButton(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Guide de cette page" }));
  return screen.getByRole("dialog");
}

describe("PageGuideProvider", () => {
  it("démarre avec les seules étapes dont la cible est à l'écran", async () => {
    const user = userEvent.setup();
    render(
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>,
    );

    const dialog = await startGuideFromButton(user);
    expect(dialog).toHaveTextContent("Étape 1 / 2");
    expect(dialog).toHaveAccessibleName("Filtrer vos dossiers");
    expect(dialog).toHaveFocus();
    expect(screen.getByRole("button", { name: "Fermer le guide de la page" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fermer la visite guidée" })).not.toBeInTheDocument();
    expect(trackEvent).toHaveBeenCalledWith("page_guide_started", { guide_key: "tenders" });
  });

  it("Suivant / Précédent déplacent la mise en évidence ; Terminer enregistre COMPLETE et le guide devient vu", async () => {
    const user = userEvent.setup();
    render(
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>,
    );
    const filters = screen.getByText("Filtres");
    const list = screen.getByText("Liste");
    expect(screen.getByRole("status", { name: "État du guide" })).toHaveTextContent("non vu");

    await startGuideFromButton(user);
    expect(filters).toHaveClass(GUIDE_TARGET_HIGHLIGHT_CLASS);

    await user.click(screen.getByRole("button", { name: "Suivant" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Étape 2 / 2");
    expect(filters).not.toHaveClass(GUIDE_TARGET_HIGHLIGHT_CLASS);
    expect(list).toHaveClass(GUIDE_TARGET_HIGHLIGHT_CLASS);

    await user.click(screen.getByRole("button", { name: "Précédent" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Étape 1 / 2");
    await user.click(screen.getByRole("button", { name: "Suivant" }));
    await user.click(screen.getByRole("button", { name: "Terminer" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(recordPageGuideAction).toHaveBeenCalledWith("tenders", "COMPLETE");
    expect(recordPageGuideAction).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveClass(GUIDE_TARGET_HIGHLIGHT_CLASS);
    expect(screen.getByRole("status", { name: "État du guide" })).toHaveTextContent("vu");
    expect(trackEvent).toHaveBeenCalledWith("page_guide_completed", { guide_key: "tenders" });
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("Passer enregistre DISMISS", async () => {
    const user = userEvent.setup();
    render(
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>,
    );
    await startGuideFromButton(user);
    await user.click(screen.getByRole("button", { name: "Passer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(recordPageGuideAction).toHaveBeenCalledWith("tenders", "DISMISS");
    expect(screen.getByRole("status", { name: "État du guide" })).toHaveTextContent("vu");
  });

  it("Escape ferme le guide et enregistre DISMISS", async () => {
    const user = userEvent.setup();
    render(
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>,
    );
    await startGuideFromButton(user);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(recordPageGuideAction).toHaveBeenCalledWith("tenders", "DISMISS");
    expect(updateTourStateAction).not.toHaveBeenCalled();
  });

  it("un échec d'enregistrement ne casse jamais l'interface", async () => {
    const user = userEvent.setup();
    recordPageGuideAction.mockRejectedValueOnce(new Error("réseau"));
    render(
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>,
    );
    await startGuideFromButton(user);
    await user.click(screen.getByRole("button", { name: "Passer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("status", { name: "État du guide" })).toHaveTextContent("vu");
    expect(screen.getByRole("button", { name: "Guide de cette page" })).toBeEnabled();
  });

  it("état serveur inconnu → tout est considéré vu (aucun bandeau), le bouton reste utilisable", async () => {
    const user = userEvent.setup();
    render(
      <GuideTestApp seen={null}>
        <TendersTestPage />
      </GuideTestApp>,
    );
    expect(screen.getByRole("status", { name: "État du guide" })).toHaveTextContent("vu");
    await startGuideFromButton(user);
    expect(screen.queryByRole("region", { name: "Guide de la page Appels d'offres" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Étape 1 / 2");
  });

  it("« Découvrir » démarre le guide et masque le bandeau", async () => {
    const user = userEvent.setup();
    render(
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>,
    );
    const banner = await screen.findByRole("region", { name: "Guide de la page Appels d'offres" });
    await user.click(screen.getByRole("button", { name: "Découvrir" }));
    expect(banner).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Étape 1 / 2");
  });

  it("la visite de bienvenue a priorité : elle referme le guide de page, qui ne peut plus démarrer", async () => {
    const user = userEvent.setup();
    render(
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>,
    );
    await startGuideFromButton(user);

    await user.click(screen.getByRole("button", { name: "Démarrer la visite de bienvenue" }));
    expect(await screen.findByRole("button", { name: "Fermer la visite guidée" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fermer le guide de la page" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(recordPageGuideAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guide de cette page" })).toBeDisabled();
  });

  it("changer de page referme le guide sans rien enregistrer", async () => {
    const user = userEvent.setup();
    const tree = (
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>
    );
    const { rerender } = render(tree);
    await startGuideFromButton(user);

    navigation.pathname = "/app/knowledge";
    rerender(
      <GuideTestApp>
        <TendersTestPage />
      </GuideTestApp>,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(recordPageGuideAction).not.toHaveBeenCalled();
  });

  it("aucune cible à l'écran → ni bouton ni bandeau", async () => {
    render(
      <GuideTestApp>
        <TendersTestPage withTargets={false} />
      </GuideTestApp>,
    );
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Guide de cette page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Guide de la page Appels d'offres" })).not.toBeInTheDocument();
  });
});
