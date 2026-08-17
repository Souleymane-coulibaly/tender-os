import type { ReactNode } from "react";

/**
 * Design System Checkpoint C (Application Primitives) — mission §53 "Section/Card patterns" :
 * groupement de PAGE (titre + espacement entre plusieurs `Card`), distinct de `Card` elle-même
 * (une surface bordée/ombrée) — une `Section` n'a ni bordure ni fond propre, c'est un conteneur de
 * mise en page, jamais une seconde carte imbriquée.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="font-tenderos-display text-base font-bold text-tenderos-navy">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-tenderos-slate">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
