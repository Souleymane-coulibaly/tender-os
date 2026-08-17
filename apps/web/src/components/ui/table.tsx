import Link from "next/link";
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

/**
 * Design System Checkpoint C (Application Primitives) — mission §15 : header/row/hover/selected/
 * actions/responsive standardisés (`empty`/`loading` réutilisent volontairement `EmptyState`/
 * `TableSkeleton`, déjà consolidés au Checkpoint A — jamais un second système). Server Components
 * (aucune interactivité propre à la structure elle-même — le tri/la sélection restent gérés par la
 * page appelante).
 */
export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-2xl border border-tenderos-navy/10 bg-white shadow-sm ${className}`}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-tenderos-navy/10 bg-tenderos-light/50 text-xs font-semibold uppercase tracking-wide text-tenderos-slate">{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

/** `selected` = ligne active (ex. panneau de détail ouvert sur cette ligne) — distinct du simple
 *  survol, jamais confondu au même token de couleur (mission §15 "hover/selected"). */
export function TableRow({ children, selected = false, className = "" }: { children: ReactNode; selected?: boolean; className?: string }) {
  return (
    <tr className={`border-b border-tenderos-navy/5 transition last:border-0 hover:bg-tenderos-light/60 ${selected ? "bg-tenderos-blue/5" : ""} ${className}`}>{children}</tr>
  );
}

export function TableHeaderCell({ children, className = "", ...rest }: { children: ReactNode; className?: string } & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={`px-4 py-2.5 font-semibold ${className}`} {...rest}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = "", ...rest }: { children: ReactNode; className?: string } & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 text-tenderos-navy ${className}`} {...rest}>
      {children}
    </td>
  );
}

/** Pagination via `<Link>` (jamais un état client — mission §46 "préserver les Server Components",
 *  motif standard Next.js App Router : la page numérotée fait partie de l'URL/des search params,
 *  résolue par l'appelant via `getHref`). Masquée d'elle-même quand une seule page existe. */
export function TablePagination({
  page,
  pageCount,
  getHref,
  className = "",
}: {
  page: number;
  pageCount: number;
  getHref: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const canGoPrevious = page > 1;
  const canGoNext = page < pageCount;

  return (
    <nav aria-label="Pagination" className={`flex items-center justify-between gap-3 border-t border-tenderos-navy/10 px-4 py-3 text-sm text-tenderos-slate ${className}`}>
      <span>
        Page {page} sur {pageCount}
      </span>
      <div className="flex items-center gap-1">
        <Link
          href={getHref(Math.max(1, page - 1))}
          aria-disabled={!canGoPrevious}
          tabIndex={canGoPrevious ? undefined : -1}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${canGoPrevious ? "text-tenderos-navy hover:bg-tenderos-light" : "pointer-events-none opacity-40"}`}
        >
          Précédent
        </Link>
        <Link
          href={getHref(Math.min(pageCount, page + 1))}
          aria-disabled={!canGoNext}
          tabIndex={canGoNext ? undefined : -1}
          className={`rounded-lg px-3 py-1.5 font-medium transition ${canGoNext ? "text-tenderos-navy hover:bg-tenderos-light" : "pointer-events-none opacity-40"}`}
        >
          Suivant
        </Link>
      </div>
    </nav>
  );
}
