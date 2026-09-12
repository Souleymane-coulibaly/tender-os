"use client";

import { useEffect, useRef, useState } from "react";
import { computeGuidePanelPosition, GUIDE_PANEL_ESTIMATED_SIZE, type GuideAnchor, type GuidePanelPosition } from "../../../lib/guide-tooltip-position";
import { findGuideTarget } from "../../../lib/page-guide-runtime";

/** Classe posée sur l'élément ciblé par l'étape courante (contour, voir `globals.css`). */
export const GUIDE_TARGET_HIGHLIGHT_CLASS = "tenderos-guide-target";

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Amène la cible au centre de l'écran seulement si elle n'est pas déjà entièrement visible —
 *  instantané si l'utilisateur préfère moins de mouvement (mission §25.89). */
function scrollIntoViewIfNeeded(element: HTMLElement): void {
  if (typeof element.scrollIntoView !== "function") return;
  const rect = element.getBoundingClientRect();
  if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
  element.scrollIntoView({ block: "center", inline: "nearest", behavior: prefersReducedMotion() ? "instant" : "smooth" });
}

function samePosition(a: GuidePanelPosition | null, b: GuidePanelPosition): boolean {
  return a !== null && a.top === b.top && a.left === b.left && a.placement === b.placement;
}

export type GuideTooltipPanelProps = Readonly<{
  /** Préfixe des `id` du titre et du texte (`<idPrefix>-title` / `<idPrefix>-body`). */
  idPrefix: string;
  /** Valeur `data-tour` de l'élément ciblé. */
  target: string;
  title: string;
  body: string;
  /** Index (à partir de 0) de l'étape courante. */
  stepIndex: number;
  stepCount: number;
  anchor: GuideAnchor;
  /** Libellé accessible du bouton de fermeture — distinct par type de guide. */
  closeLabel: string;
  /** Faire défiler la page jusqu'à la cible (cibles dans la page, jamais le menu latéral). */
  scrollTargetIntoView?: boolean;
  onNext: () => void | Promise<void>;
  onPrevious: () => void;
  /** Passer / fermer / Escape. */
  onClose: () => void | Promise<void>;
}>;

/**
 * Panneau commun à la visite de bienvenue (`TourTooltip`) et aux guides de page
 * (`PageGuideTooltip`) — une seule implémentation du placement, de la mise en évidence de la cible
 * et de l'accessibilité (mission §25.89 : clavier, Escape, focus, aria, reduced motion ; §25.90 :
 * mobile 390px, jamais hors écran). Non modal : jamais de piège de focus ni d'overlay bloquant.
 * Positionnement manuel (`getBoundingClientRect`), recalculé au resize/scroll, puis une seconde
 * fois après le premier rendu avec la taille réelle du panneau.
 */
export function GuideTooltipPanel({
  idPrefix,
  target,
  title,
  body,
  stepIndex,
  stepCount,
  anchor,
  closeLabel,
  scrollTargetIntoView = false,
  onNext,
  onPrevious,
  onClose,
}: GuideTooltipPanelProps) {
  const [position, setPosition] = useState<GuidePanelPosition | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initial = findGuideTarget(target);
    if (!initial) {
      setPosition(null);
      return;
    }
    let highlighted: HTMLElement = initial;
    highlighted.classList.add(GUIDE_TARGET_HIGHLIGHT_CLASS);
    if (scrollTargetIntoView) scrollIntoViewIfNeeded(highlighted);

    let frame = 0;
    function recompute() {
      // La cible a pu être remplacée par un nouveau rendu : on la retrouve et on déplace le contour.
      const element = highlighted.isConnected ? highlighted : findGuideTarget(target);
      if (!element) {
        setPosition(null);
        return;
      }
      if (element !== highlighted) {
        highlighted.classList.remove(GUIDE_TARGET_HIGHLIGHT_CLASS);
        element.classList.add(GUIDE_TARGET_HIGHLIGHT_CLASS);
        highlighted = element;
      }
      const panelRect = panelRef.current?.getBoundingClientRect();
      const panelSize = panelRect && panelRect.width > 0 ? { width: panelRect.width, height: panelRect.height } : GUIDE_PANEL_ESTIMATED_SIZE;
      const next = computeGuidePanelPosition(element.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, panelSize, anchor);
      setPosition((previous) => (samePosition(previous, next) ? previous : next));
    }

    function scheduleRecompute() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recompute);
    }

    recompute();
    // Seconde passe : le panneau est alors rendu et mesurable (hauteur réelle selon le texte).
    scheduleRecompute();
    window.addEventListener("resize", scheduleRecompute);
    window.addEventListener("scroll", scheduleRecompute, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleRecompute);
      window.removeEventListener("scroll", scheduleRecompute, true);
      highlighted.classList.remove(GUIDE_TARGET_HIGHLIGHT_CLASS);
    };
  }, [target, anchor, scrollTargetIntoView]);

  // Le panneau reçoit le focus à chaque étape pour que le lecteur d'écran l'annonce et que
  // Tab/Escape fonctionnent immédiatement — jamais à chaque recalcul de position (défilement),
  // qui volerait le focus d'un bouton du panneau. `preventScroll` : ne gêne pas le défilement vers
  // la cible.
  const hasPosition = position !== null;
  useEffect(() => {
    if (hasPosition) panelRef.current?.focus({ preventScroll: true });
  }, [hasPosition, stepIndex]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") void onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!position) return null;

  const titleId = `${idPrefix}-title`;
  const bodyId = `${idPrefix}-body`;
  const isLastStep = stepIndex >= stepCount - 1;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      data-guide-placement={position.placement}
      className="tenderos-tour-tooltip fixed z-50 w-[calc(100vw-24px)] max-w-sm rounded-2xl border border-tenderos-navy/10 bg-white p-4 shadow-xl sm:w-80"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-start justify-between gap-2">
        <p id={titleId} className="font-tenderos-display text-sm font-bold text-tenderos-navy">
          {title}
        </p>
        <button type="button" onClick={() => void onClose()} aria-label={closeLabel} className="shrink-0 rounded p-1 text-tenderos-slate hover:bg-tenderos-light">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p id={bodyId} className="mt-2 text-sm text-tenderos-slate">
        {body}
      </p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs font-medium text-tenderos-slate">
          Étape {stepIndex + 1} / {stepCount}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void onClose()} className="text-xs font-medium text-tenderos-slate hover:underline">
            Passer
          </button>
          {stepIndex > 0 ? (
            <button type="button" onClick={onPrevious} className="rounded-lg border border-tenderos-navy/15 px-3 py-1.5 text-xs font-semibold text-tenderos-navy hover:bg-tenderos-light">
              Précédent
            </button>
          ) : null}
          <button type="button" onClick={() => void onNext()} className="rounded-lg bg-tenderos-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-tenderos-navy/90">
            {isLastStep ? "Terminer" : "Suivant"}
          </button>
        </div>
      </div>
    </div>
  );
}
