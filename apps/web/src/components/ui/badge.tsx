import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "gold";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-tenderos-light text-tenderos-slate",
  info: "bg-tenderos-blue/10 text-tenderos-blue",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  gold: "bg-tenderos-gold/15 text-tenderos-navy",
};

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — badge de statut unique pour toute la surface `/app`,
 * généralisé depuis les multiples fonctions `xyzBadgeClass()` dupliquées par écran (statuts Tender,
 * Knowledge, Subscription, Pass, etc.). Mission §25F.90 "jamais la couleur seule" — le libellé texte
 * est un enfant obligatoire (`children`), jamais une pastille de couleur nue ; `icon` est un
 * complément optionnel, jamais un remplacement du texte.
 */
export function Badge({ tone = "neutral", icon, children }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[tone]}`}>
      {icon ? (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
