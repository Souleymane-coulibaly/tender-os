import Link from "next/link";
import type { ReactNode } from "react";

export type Breadcrumb = { label: string; href?: string };

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — en-tête de page standard, mission §25F.8 : fil d'Ariane,
 * titre, description courte, statut éventuel, actions à droite. Généralisé depuis `DashboardHeader`
 * (Sprint 25 Dashboard Premium) pour toute la surface `/app`, jamais un second motif divergent par
 * écran métier.
 */
export function PageHeader({
  breadcrumb,
  title,
  description,
  status,
  actions,
}: {
  breadcrumb?: readonly Breadcrumb[];
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label="Fil d'Ariane" className="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-tenderos-slate">
            {breadcrumb.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-tenderos-navy hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={index === breadcrumb.length - 1 ? "font-medium text-tenderos-navy" : undefined}>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-tenderos-display text-xl font-extrabold text-tenderos-navy sm:text-2xl">{title}</h1>
          {status}
        </div>
        {description ? <p className="mt-1 text-sm text-tenderos-slate">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
