// Positionnement du panneau d'une visite guidée (visite de bienvenue ET guides de page) — calcul
// pur, sans DOM, pour rester testable et unique : aucun des deux guides ne réimplémente son propre
// placement. Aucune librairie de positionnement dans ce repo (choix volontaire, Sprint 25).

/** Marge minimale entre le panneau et le bord de l'écran (mission §25.90 « jamais hors écran »). */
export const GUIDE_VIEWPORT_MARGIN = 12;
/** Espace entre la cible et le panneau. */
export const GUIDE_TARGET_GAP = 10;
/** En dessous : panneau pleine largeur, au-dessus ou en dessous de la cible (même seuil que `sm:`). */
export const GUIDE_MOBILE_BREAKPOINT = 640;
/** Taille estimée du panneau tant qu'il n'a pas encore été mesuré (premier rendu). */
export const GUIDE_PANEL_ESTIMATED_SIZE: GuideSize = { width: 320, height: 190 };

/**
 * `beside` : à droite de la cible (liens du menu latéral, visite de bienvenue).
 * `auto` : sous la cible, au-dessus si la place manque (éléments dans la page, guides de page).
 */
export type GuideAnchor = "beside" | "auto";

export type GuidePlacement = "right" | "below" | "above";

export type GuidePanelPosition = Readonly<{ top: number; left: number; placement: GuidePlacement }>;

export type GuideSize = Readonly<{ width: number; height: number }>;

export type GuideTargetRect = Readonly<{ top: number; bottom: number; left: number; right: number }>;

function clamp(value: number, min: number, max: number): number {
  // `max < min` quand le panneau est plus grand que l'écran : on garde alors le bord haut/gauche visible.
  return Math.max(min, Math.min(value, max));
}

/** Place le panneau sous la cible, au-dessus si la place manque, sinon du côté le plus spacieux,
 *  toujours ramené à l'intérieur de l'écran. */
function verticalPosition(rect: GuideTargetRect, viewport: GuideSize, panel: GuideSize): { top: number; placement: "below" | "above" } {
  const below = rect.bottom + GUIDE_TARGET_GAP;
  const above = rect.top - GUIDE_TARGET_GAP - panel.height;
  const maxTop = viewport.height - GUIDE_VIEWPORT_MARGIN - panel.height;

  if (below <= maxTop) return { top: below, placement: "below" };
  if (above >= GUIDE_VIEWPORT_MARGIN) return { top: above, placement: "above" };

  const roomBelow = viewport.height - rect.bottom;
  const placement = roomBelow >= rect.top ? "below" : "above";
  return { top: clamp(placement === "below" ? below : above, GUIDE_VIEWPORT_MARGIN, maxTop), placement };
}

/**
 * Position du panneau (coordonnées `fixed`, en px) pour une cible donnée.
 *
 * - Mobile (< 640px) : pleine largeur (`left` = marge), sous la cible ou au-dessus, quel que soit
 *   le mode — même règle qu'avant pour la visite de bienvenue, désormais jamais hors écran en bas.
 * - `beside` (bureau) : à droite de la cible, aligné sur son haut — comportement historique de la
 *   visite de bienvenue, borné verticalement et horizontalement à l'écran.
 * - `auto` (bureau) : aligné sur le bord gauche de la cible, sous/au-dessus, borné horizontalement.
 */
export function computeGuidePanelPosition(rect: GuideTargetRect, viewport: GuideSize, panel: GuideSize, anchor: GuideAnchor): GuidePanelPosition {
  if (viewport.width < GUIDE_MOBILE_BREAKPOINT) {
    const { top, placement } = verticalPosition(rect, viewport, panel);
    return { top, left: GUIDE_VIEWPORT_MARGIN, placement };
  }

  const maxLeft = viewport.width - GUIDE_VIEWPORT_MARGIN - panel.width;

  if (anchor === "beside") {
    const top = clamp(rect.top, GUIDE_VIEWPORT_MARGIN, viewport.height - GUIDE_VIEWPORT_MARGIN - panel.height);
    const left = clamp(rect.right + GUIDE_VIEWPORT_MARGIN, GUIDE_VIEWPORT_MARGIN, maxLeft);
    return { top, left, placement: "right" };
  }

  const { top, placement } = verticalPosition(rect, viewport, panel);
  return { top, left: clamp(rect.left, GUIDE_VIEWPORT_MARGIN, maxLeft), placement };
}
