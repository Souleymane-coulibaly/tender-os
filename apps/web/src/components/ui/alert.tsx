import type { ReactNode } from "react";
import { CheckIcon, DangerIcon, InfoIcon, WarningIcon } from "./icons";

export type AlertTone = "info" | "success" | "warning" | "danger";

/** Réexporté pour `Toast` (mission "ne pas dupliquer" — même palette sémantique, même icônes,
 *  jamais un second mapping tone→couleur écrit à la main). */
export const ALERT_TONE_CONFIG: Record<AlertTone, { classes: string; icon: (props: { className?: string }) => ReactNode }> = {
  info: { classes: "border-tenderos-blue/20 bg-info-bg text-info-fg", icon: InfoIcon },
  success: { classes: "border-green-200 bg-success-bg text-success-fg", icon: CheckIcon },
  warning: { classes: "border-amber-200 bg-warning-bg text-warning-fg", icon: WarningIcon },
  danger: { classes: "border-red-200 bg-danger-bg text-danger-fg", icon: DangerIcon },
};

/**
 * Design System Checkpoint B (Core Primitives) — bandeau de retour inline (mission §18/§21,
 * distinct du Toast : reste affiché tant que la condition persiste, jamais auto-masqué). Consomme
 * les jetons sémantiques ajoutés au Checkpoint A (`success/warning/danger/info-bg/-fg`) — le
 * premier composant qui les consomme réellement, avec `Badge` (voir consolidation ci-dessous).
 */
export function Alert({ tone = "info", title, children, className = "" }: { tone?: AlertTone; title?: ReactNode; children: ReactNode; className?: string }) {
  const config = ALERT_TONE_CONFIG[tone];
  const Icon = config.icon;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex gap-3 rounded-lg border p-4 text-sm ${config.classes} ${className}`}>
      <Icon className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}
