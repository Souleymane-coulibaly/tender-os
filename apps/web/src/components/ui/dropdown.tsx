"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "./icons";

/**
 * Design System Checkpoint B (Core Primitives) — menu contextuel léger (mission §20), périmètre
 * volontairement borné : déclencheur STANDARD (bouton fourni par ce composant, jamais un
 * déclencheur custom arbitraire — un besoin d'avatar/icône seule pour le menu utilisateur relève de
 * l'App Shell, Checkpoint C, qui décidera alors s'il faut étendre cette API). Fermeture au clic
 * extérieur ET à Échap ; navigation fléchée au clavier volontairement HORS périmètre (le focus
 * standard Tab suffit pour ce Checkpoint — noté au rapport, jamais silencieusement omis).
 */
export function Dropdown({
  trigger,
  children,
  align = "start",
  className = "",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-tenderos-navy/15 px-3 py-2 text-sm font-medium text-tenderos-navy transition hover:bg-tenderos-light"
      >
        {trigger}
        <ChevronDownIcon className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute z-20 mt-1.5 min-w-[10rem] rounded-lg border border-tenderos-navy/10 bg-white p-1 shadow-lg ${align === "end" ? "right-0" : "left-0"} ${className}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Élément de menu — `href` rend un `<Link>` (navigation), son absence un `<button>` (action locale),
 *  même discipline que `Button`. */
export function DropdownItem({
  href,
  onClick,
  danger = false,
  children,
}: {
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  const classes = `flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
    danger ? "text-red-700 hover:bg-red-50" : "text-tenderos-navy hover:bg-tenderos-light"
  }`;
  if (href) {
    return (
      <Link href={href} role="menuitem" className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" role="menuitem" onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
