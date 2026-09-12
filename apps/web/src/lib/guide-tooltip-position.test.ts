import { describe, expect, it } from "vitest";
import { computeGuidePanelPosition, GUIDE_VIEWPORT_MARGIN } from "./guide-tooltip-position";

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const PANEL = { width: 320, height: 190 };

function rect(top: number, left: number, height = 40, width = 200) {
  return { top, bottom: top + height, left, right: left + width };
}

describe("computeGuidePanelPosition — cibles dans la page (auto)", () => {
  it("se place sous la cible quand la place le permet, aligné sur son bord gauche", () => {
    expect(computeGuidePanelPosition(rect(100, 300), DESKTOP, PANEL, "auto")).toEqual({ top: 150, left: 300, placement: "below" });
  });

  it("bascule au-dessus quand la place manque en dessous", () => {
    expect(computeGuidePanelPosition(rect(700, 300), DESKTOP, PANEL, "auto")).toEqual({ top: 700 - 10 - 190, left: 300, placement: "above" });
  });

  it("reste dans l'écran quand ni dessous ni dessus ne suffisent", () => {
    const tallPanel = { width: 320, height: 600 };
    const position = computeGuidePanelPosition(rect(300, 300), { width: 1280, height: 700 }, tallPanel, "auto");
    expect(position.top).toBeGreaterThanOrEqual(GUIDE_VIEWPORT_MARGIN);
    expect(position.top + tallPanel.height).toBeLessThanOrEqual(700 - GUIDE_VIEWPORT_MARGIN);
  });

  it("borne horizontalement le panneau à l'écran (marges de 12px)", () => {
    expect(computeGuidePanelPosition(rect(100, 1100), DESKTOP, PANEL, "auto").left).toBe(1280 - 12 - 320);
    expect(computeGuidePanelPosition(rect(100, -50), DESKTOP, PANEL, "auto").left).toBe(12);
  });
});

describe("computeGuidePanelPosition — menu latéral (beside, visite de bienvenue)", () => {
  it("garde le placement historique à droite du lien, aligné sur son haut", () => {
    expect(computeGuidePanelPosition(rect(200, 16, 40, 224), DESKTOP, PANEL, "beside")).toEqual({ top: 200, left: 16 + 224 + 12, placement: "right" });
  });

  it("ne déborde jamais en bas de l'écran", () => {
    expect(computeGuidePanelPosition(rect(780, 16, 40, 224), DESKTOP, PANEL, "beside").top).toBe(800 - 12 - 190);
  });
});

describe("computeGuidePanelPosition — mobile (< 640px)", () => {
  it.each(["auto", "beside"] as const)("pleine largeur (%s) : bord gauche à la marge, sous la cible", (anchor) => {
    expect(computeGuidePanelPosition(rect(100, 200), MOBILE, { width: 366, height: 190 }, anchor)).toEqual({ top: 150, left: 12, placement: "below" });
  });

  it("bascule au-dessus d'une cible en bas d'écran, jamais hors écran", () => {
    const position = computeGuidePanelPosition(rect(760, 20), MOBILE, { width: 366, height: 190 }, "auto");
    expect(position).toEqual({ top: 760 - 10 - 190, left: 12, placement: "above" });
  });
});
