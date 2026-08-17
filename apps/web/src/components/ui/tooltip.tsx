import type { ReactNode } from "react";

/**
 * Design System Checkpoint B (Core Primitives) — mission §22, CSS pur (`group-hover`/
 * `group-focus-within`, jamais de JS de positionnement/librairie de popover, mission §46) : Server
 * Component. Positionnement simple (haut/bas, centré), sans détection de collision — suffisant pour
 * une infobulle courte ; un besoin de positionnement avancé sortirait du périmètre "sobre" de la
 * mission §21/§47.
 */
export function Tooltip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" }) {
  const positionClass = side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5";
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${positionClass} z-30 whitespace-nowrap rounded-md bg-tenderos-navy px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100`}
      >
        {content}
      </span>
    </span>
  );
}
