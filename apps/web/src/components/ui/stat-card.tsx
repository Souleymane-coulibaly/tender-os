import Link from "next/link";
import type { ReactNode } from "react";

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — généralisé depuis `KpiCard` (Dashboard Premium,
 * `dashboard-kpi-row.tsx`) pour toute la surface `/app` (statistiques Tenders, etc.).
 */
export function StatCard({
  label,
  value,
  subtitle,
  icon,
  iconBg = "bg-tenderos-blue/10",
  href,
}: {
  label: string;
  value: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  iconBg?: string;
  href?: string;
}) {
  const content = (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-center gap-3">
        {icon ? (
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="text-sm font-medium text-tenderos-slate">{label}</span>
      </div>
      <span className="text-3xl font-extrabold tabular-nums text-tenderos-navy">{value}</span>
      {subtitle ? <p className="text-xs text-tenderos-slate">{subtitle}</p> : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}
