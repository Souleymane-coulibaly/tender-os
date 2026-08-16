"use client";

import { useEffect, useRef, useState } from "react";
import { useTour } from "./tour-provider";

type Position = { top: number; left: number; placement: "right" | "below" };

const VIEWPORT_MARGIN = 12;
const MOBILE_BREAKPOINT = 640;

function computePosition(target: HTMLElement): Position {
  const rect = target.getBoundingClientRect();
  const isMobile = window.innerWidth < MOBILE_BREAKPOINT;

  if (isMobile) {
    const top = Math.min(rect.bottom + 10, window.innerHeight - VIEWPORT_MARGIN);
    return { top, left: VIEWPORT_MARGIN, placement: "below" };
  }

  const top = Math.min(Math.max(rect.top, VIEWPORT_MARGIN), window.innerHeight - VIEWPORT_MARGIN);
  const left = Math.min(rect.right + 12, window.innerWidth - VIEWPORT_MARGIN);
  return { top, left, placement: "right" };
}

/**
 * V2 Sprint 25 (Guide interactif) — mission §25.86 (targets stables `data-tour`) / §25.89
 * (accessibilité : clavier, Escape, focus, aria, contraste, responsive, reduced motion) / §25.90
 * (mobile 390px, jamais hors écran) / §25.88 (Suivant/Précédent/Passer/Fermer). Positionnement
 * manuel volontaire (`getBoundingClientRect`, aucune librairie de positionnement dans ce repo) —
 * recalculé au resize/scroll, jamais figé au premier rendu.
 */
export function TourTooltip() {
  const { steps, isTourActive, currentStepIndex, next, previous, closeTour } = useTour();
  const [position, setPosition] = useState<Position | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const step = steps[currentStepIndex];

  useEffect(() => {
    if (!isTourActive || !step) {
      setPosition(null);
      return;
    }

    let frame = 0;
    function recompute() {
      const target = document.querySelector<HTMLElement>(`[data-tour="${step!.target}"]`);
      if (!target) {
        setPosition(null);
        return;
      }
      setPosition(computePosition(target));
    }

    function scheduleRecompute() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recompute);
    }

    recompute();
    window.addEventListener("resize", scheduleRecompute);
    window.addEventListener("scroll", scheduleRecompute, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleRecompute);
      window.removeEventListener("scroll", scheduleRecompute, true);
    };
  }, [isTourActive, step]);

  // mission §25.89 "focus management" — jamais un piège de focus (le tour ne force rien), mais le
  // panneau reçoit le focus à chaque étape pour que le lecteur d'écran l'annonce et que Tab/Escape
  // fonctionnent immédiatement.
  useEffect(() => {
    if (position) panelRef.current?.focus();
  }, [position, currentStepIndex]);

  useEffect(() => {
    if (!isTourActive) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeTour();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isTourActive, closeTour]);

  if (!isTourActive || !step || !position) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-tooltip-title"
      aria-describedby="tour-tooltip-body"
      tabIndex={-1}
      className="tenderos-tour-tooltip fixed z-50 w-[calc(100vw-24px)] max-w-sm rounded-2xl border border-tenderos-navy/10 bg-white p-4 shadow-xl sm:w-80"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-start justify-between gap-2">
        <p id="tour-tooltip-title" className="font-tenderos-display text-sm font-bold text-tenderos-navy">
          {step.title}
        </p>
        <button type="button" onClick={closeTour} aria-label="Fermer la visite guidée" className="shrink-0 rounded p-1 text-tenderos-slate hover:bg-tenderos-light">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p id="tour-tooltip-body" className="mt-2 text-sm text-tenderos-slate">
        {step.body}
      </p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs font-medium text-tenderos-slate">
          Étape {currentStepIndex + 1} / {steps.length}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={closeTour} className="text-xs font-medium text-tenderos-slate hover:underline">
            Passer
          </button>
          {currentStepIndex > 0 ? (
            <button type="button" onClick={previous} className="rounded-lg border border-tenderos-navy/15 px-3 py-1.5 text-xs font-semibold text-tenderos-navy hover:bg-tenderos-light">
              Précédent
            </button>
          ) : null}
          <button type="button" onClick={next} className="rounded-lg bg-tenderos-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-tenderos-navy/90">
            {currentStepIndex >= steps.length - 1 ? "Terminer" : "Suivant"}
          </button>
        </div>
      </div>
    </div>
  );
}
