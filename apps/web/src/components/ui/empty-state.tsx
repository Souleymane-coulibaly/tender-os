import type { ReactNode } from "react";

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — état vide standard, mission §25F.76 : pourquoi cette page
 * est vide, que puis-je faire maintenant, CTA utile. Remplace les `<p>` texte brut dispersés dans
 * chaque écran ("Aucun ... à afficher.").
 */
export function EmptyState({
  icon,
  title,
  description,
  actions,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-tenderos-navy/15 bg-tenderos-light/50 px-6 py-12 text-center">
      {icon ? (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-tenderos-blue shadow-sm" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <h3 className="font-tenderos-display text-base font-bold text-tenderos-navy">{title}</h3>
      {description ? <p className="max-w-md text-sm text-tenderos-slate">{description}</p> : null}
      {actions ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
