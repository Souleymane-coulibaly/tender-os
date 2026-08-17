import type { ReactNode } from "react";

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — carte de base réutilisée par tous les écrans métier,
 * généralisée depuis le motif déjà établi par le Dashboard Premium (Sprint 25) :
 * `rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm`. Un seul point de vérité pour
 * ce motif au lieu de sa répétition ad hoc dans chaque section (mission §25F.3/§25F.4).
 *
 * Design System Checkpoint B — ajout `interactive` (mission §13 "interactive card"), reproduisant
 * exactement le survol déjà utilisé par `StatCard` (`hover:shadow-md`) — jamais un second motif de
 * survol divergent. Additif, défaut inchangé (`false`) : aucun appelant existant n'est affecté.
 */
export function Card({
  children,
  title,
  description,
  actions,
  padding = "normal",
  interactive = false,
  className = "",
}: {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  padding?: "normal" | "tight" | "none";
  interactive?: boolean;
  className?: string;
}) {
  const paddingClass = padding === "none" ? "" : padding === "tight" ? "p-4" : "p-5";
  const interactiveClass = interactive ? "transition hover:shadow-md" : "";
  return (
    <section className={`rounded-2xl border border-tenderos-navy/10 bg-white shadow-sm ${paddingClass} ${interactiveClass} ${className}`}>
      {title || actions ? (
        <div className={`flex items-start justify-between gap-3 ${description ? "mb-1" : "mb-4"}`}>
          {title ? <h2 className="font-tenderos-display text-base font-bold text-tenderos-navy">{title}</h2> : <span />}
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {description ? <p className="mb-4 text-sm text-tenderos-slate">{description}</p> : null}
      {children}
    </section>
  );
}
