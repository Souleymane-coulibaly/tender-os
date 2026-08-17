import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "gold";

// Design System Checkpoint B — converge sur les jetons sémantiques ajoutés au Checkpoint A
// (`globals.css`/`tailwind.config.ts`) plutôt que les classes Tailwind brutes précédentes : MÊMES
// valeurs exactes (green/amber/red-100/-800), donc AUCUN changement visuel, mais devient la source
// que les 6+ fonctions `*BadgeClass()` dupliquées ailleurs (audit Checkpoint A) pourront converger
// vers `bg-success-bg text-success-fg` etc. lors de leur migration progressive (mission §42/§43).
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-tenderos-light text-tenderos-slate",
  info: "bg-info-bg text-info-fg",
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  danger: "bg-danger-bg text-danger-fg",
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
