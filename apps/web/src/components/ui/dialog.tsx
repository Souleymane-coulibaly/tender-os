"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";

/**
 * Design System Checkpoint B (Core Primitives) — mission §19/§45/§46 : construit sur `<dialog>`
 * NATIF (`showModal()`) plutôt qu'une bibliothèque de modale — focus trap, fermeture Échap, et
 * `::backdrop` sont fournis par le navigateur, zéro dépendance/zéro gestion manuelle du focus.
 * `open`/`onClose` restent contrôlés par l'appelant (React reste la source de vérité de l'état),
 * l'effet ne fait QUE synchroniser l'élément natif vers cet état.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) {
      node.showModal();
    } else if (!open && node.open) {
      node.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        // Le clic sur le `::backdrop` natif remonte comme un clic sur `<dialog>` lui-même (jamais
        // sur son contenu, qui stoppe la propagation implicitement via son propre rectangle) —
        // fermeture au clic extérieur sans détection manuelle des coordonnées.
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-tenderos-navy/10 bg-white p-0 shadow-xl backdrop:bg-tenderos-navy/40 ${className}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-tenderos-navy/10 p-5">
        <h2 id={titleId} className="font-tenderos-display text-lg font-bold text-tenderos-navy">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-tenderos-slate transition hover:bg-tenderos-light"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="p-5 text-sm text-tenderos-navy">{children}</div>
      {footer ? <div className="flex items-center justify-end gap-2 border-t border-tenderos-navy/10 p-5">{footer}</div> : null}
    </dialog>
  );
}
