import Link from "next/link";
import type { ReactNode } from "react";
import { TrendDownIcon, TrendUpIcon } from "./icons";

export type StatVariationDirection = "up" | "down" | "neutral";

/** Design System Checkpoint C — mission §29 "MetricCard" : `direction` pilote la flèche, `tone`
 *  pilote la couleur — délibérément SÉPARÉS (une hausse n'est pas toujours positive, ex. "risques
 *  détectés" ×2 doit pouvoir rester rouge malgré une flèche montante). `tone` par défaut déduit de
 *  `direction` (up→success, down→danger) pour le cas courant, jamais imposé. */
export type StatVariation = Readonly<{ label: string; direction: StatVariationDirection; tone?: "success" | "danger" | "neutral" }>;

const VARIATION_TONE_CLASSES: Record<"success" | "danger" | "neutral", string> = {
  success: "text-success-fg",
  danger: "text-danger-fg",
  neutral: "text-tenderos-slate",
};

function VariationIndicator({ variation }: { variation: StatVariation }) {
  const tone = variation.tone ?? (variation.direction === "up" ? "success" : variation.direction === "down" ? "danger" : "neutral");
  const Icon = variation.direction === "up" ? TrendUpIcon : variation.direction === "down" ? TrendDownIcon : null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${VARIATION_TONE_CLASSES[tone]}`}>
      {Icon ? <Icon size={13} /> : null}
      {variation.label}
    </span>
  );
}

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — généralisé depuis `KpiCard` (Dashboard Premium,
 * `dashboard-kpi-row.tsx`) pour toute la surface `/app` (statistiques Tenders, etc.).
 *
 * Design System Checkpoint C — ajout `variation` (mission §29), additif : défaut absent, aucun
 * appelant existant n'est affecté.
 */
export function StatCard({
  label,
  value,
  subtitle,
  variation,
  icon,
  iconBg = "bg-tenderos-blue/10",
  href,
}: {
  label: string;
  value: ReactNode;
  subtitle?: string;
  variation?: StatVariation;
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
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tabular-nums text-tenderos-navy">{value}</span>
        {variation ? <VariationIndicator variation={variation} /> : null}
      </div>
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
