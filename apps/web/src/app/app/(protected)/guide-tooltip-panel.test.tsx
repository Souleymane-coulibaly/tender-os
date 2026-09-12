import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GUIDE_TARGET_HIGHLIGHT_CLASS, GuideTooltipPanel, type GuideTooltipPanelProps } from "./guide-tooltip-panel";

const DEFAULT_VIEWPORT = { width: window.innerWidth, height: window.innerHeight };

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: height });
}

/** Cible ajoutée hors de l'arbre React, avec une géométrie maîtrisée. */
function addTarget(value: string, box: { top: number; left: number; height?: number; width?: number }) {
  const element = document.createElement("div");
  element.dataset.tour = value;
  const height = box.height ?? 40;
  const width = box.width ?? 200;
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    top: box.top,
    bottom: box.top + height,
    left: box.left,
    right: box.left + width,
    width,
    height,
    x: box.left,
    y: box.top,
    toJSON: () => ({}),
  });
  document.body.appendChild(element);
  return element;
}

function buildProps(overrides: Partial<GuideTooltipPanelProps> = {}): GuideTooltipPanelProps {
  return {
    idPrefix: "test-guide",
    target: "guide-test-a",
    title: "Titre de l'étape",
    body: "Texte de l'étape",
    stepIndex: 0,
    stepCount: 2,
    anchor: "auto",
    closeLabel: "Fermer le guide de test",
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  setViewport(DEFAULT_VIEWPORT.width, DEFAULT_VIEWPORT.height);
  document.querySelectorAll("[data-tour]").forEach((element) => element.remove());
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("GuideTooltipPanel", () => {
  it("ne rend rien si la cible est absente", () => {
    render(<GuideTooltipPanel {...buildProps({ target: "guide-test-absent" })} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dialog non modal, titré, décrit, focalisé, avec le compteur d'étapes", () => {
    addTarget("guide-test-a", { top: 100, left: 300 });
    render(<GuideTooltipPanel {...buildProps()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(dialog).toHaveAccessibleName("Titre de l'étape");
    expect(dialog).toHaveAccessibleDescription("Texte de l'étape");
    expect(dialog).toHaveFocus();
    expect(dialog).toHaveTextContent("Étape 1 / 2");
    expect(screen.getByRole("button", { name: "Suivant" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Précédent" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fermer le guide de test" })).toBeInTheDocument();
  });

  it("dernière étape : Terminer et Précédent", () => {
    addTarget("guide-test-a", { top: 100, left: 300 });
    render(<GuideTooltipPanel {...buildProps({ stepIndex: 1 })} />);
    expect(screen.getByRole("button", { name: "Terminer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Précédent" })).toBeInTheDocument();
  });

  it("Passer, fermer et Escape appellent onClose ; Suivant appelle onNext", async () => {
    const user = userEvent.setup();
    addTarget("guide-test-a", { top: 100, left: 300 });
    const props = buildProps();
    render(<GuideTooltipPanel {...props} />);

    await user.click(screen.getByRole("button", { name: "Passer" }));
    await user.click(screen.getByRole("button", { name: "Fermer le guide de test" }));
    await user.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalledTimes(3);

    await user.click(screen.getByRole("button", { name: "Suivant" }));
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it("met en évidence la cible courante, déplace puis retire la mise en évidence", () => {
    const first = addTarget("guide-test-a", { top: 100, left: 300 });
    const second = addTarget("guide-test-b", { top: 300, left: 300 });
    const { rerender, unmount } = render(<GuideTooltipPanel {...buildProps()} />);
    expect(first).toHaveClass(GUIDE_TARGET_HIGHLIGHT_CLASS);

    rerender(<GuideTooltipPanel {...buildProps({ target: "guide-test-b", stepIndex: 1 })} />);
    expect(first).not.toHaveClass(GUIDE_TARGET_HIGHLIGHT_CLASS);
    expect(second).toHaveClass(GUIDE_TARGET_HIGHLIGHT_CLASS);

    unmount();
    expect(second).not.toHaveClass(GUIDE_TARGET_HIGHLIGHT_CLASS);
  });

  it("bascule au-dessus d'une cible proche du bas de l'écran", () => {
    setViewport(1280, 800);
    addTarget("guide-test-a", { top: 700, left: 300 });
    render(<GuideTooltipPanel {...buildProps()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-guide-placement", "above");
    expect(dialog.style.top).toBe(`${700 - 10 - 190}px`);
  });

  it("mobile 390px : pleine largeur, collé à la marge gauche", () => {
    setViewport(390, 844);
    addTarget("guide-test-a", { top: 100, left: 200 });
    render(<GuideTooltipPanel {...buildProps()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.left).toBe("12px");
    expect(dialog).toHaveClass("w-[calc(100vw-24px)]");
  });

  it("amène une cible hors écran au centre, instantanément si reduced motion", () => {
    setViewport(1280, 800);
    const element = addTarget("guide-test-a", { top: 2000, left: 300 });
    const scrollIntoView = vi.fn();
    element.scrollIntoView = scrollIntoView;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true })) });

    render(<GuideTooltipPanel {...buildProps({ scrollTargetIntoView: true })} />);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", inline: "nearest", behavior: "instant" });
  });

  it("ne fait pas défiler une cible déjà visible", () => {
    const element = addTarget("guide-test-a", { top: 100, left: 300 });
    const scrollIntoView = vi.fn();
    element.scrollIntoView = scrollIntoView;
    render(<GuideTooltipPanel {...buildProps({ scrollTargetIntoView: true })} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
