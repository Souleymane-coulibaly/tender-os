/**
 * Design System Checkpoint B (Core Primitives) — mission §23 "UNE bibliothèque principale si
 * possible, ne pas mélanger inutilement plusieurs styles d'icônes". Périmètre volontairement
 * ÉTROIT : uniquement les icônes dont les NOUVELLES primitives elles-mêmes ont besoin en interne
 * (Select/Dropdown = chevron, Checkbox = coche, Dialog/Toast = fermeture, Alert = statut) — jamais
 * un remplacement des ~20 SVG existants dispersés dans l'app (Landing, App Shell, widgets), qui
 * restent hors périmètre de ce Checkpoint (migration progressive, mission §42). Taille standard
 * 16px (`small`) sauf indication contraire — `currentColor` partout, jamais une couleur figée en
 * dur (contrairement aux SVG marketing relevés à l'audit Checkpoint A).
 */
import type { ReactNode } from "react";

// `| undefined` explicite (exactOptionalPropertyTypes) : un parent peut relayer une classe facultative.
export type IconProps = { className?: string | undefined; size?: number | undefined };

export function ChevronDownIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Checkpoint C — variation `MetricCard` (mission §29). */
export function TrendUpIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M2 11L6.5 6.5L9.5 9.5L14 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 5H14V8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrendDownIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M2 5L6.5 9.5L9.5 6.5L14 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 11H14V7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function InfoIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.25V11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function WarningIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.5V9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function DangerIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.5V8.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.9" fill="currentColor" />
    </svg>
  );
}

// --- Pictogrammes du menu latéral -------------------------------------------------------------
// Même grammaire que les icônes ci-dessus (grille 16px, trait `currentColor`, extrémités
// arrondies) ; le trait est porté une seule fois par `LineGlyph`, chaque icône ne décrit que ses
// tracés. Un point plein déclare lui-même `fill="currentColor" stroke="none"`.

function LineGlyph({ className, size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <rect x="2" y="2" width="5" height="5" rx="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" />
    </LineGlyph>
  );
}

export function TenderIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <path d="M9.5 1.75H4.25a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V4.75L9.5 1.75Z" />
      <path d="M9.5 1.75v3h3.25" />
      <path d="M5.5 8.25h5M5.5 11h3.5" />
    </LineGlyph>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="3.25" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </LineGlyph>
  );
}

/** Veille : un signal qui émet — volontairement sans cercle fermé, pour ne jamais se confondre
 *  avec la cible (`TargetIcon`) à 16px. */
export function SignalIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <circle cx="8" cy="8" r="1.25" fill="currentColor" stroke="none" />
      <path d="M5.35 5.35a3.75 3.75 0 0 0 0 5.3M10.65 5.35a3.75 3.75 0 0 1 0 5.3" />
      <path d="M3.4 3.4a6.5 6.5 0 0 0 0 9.2M12.6 3.4a6.5 6.5 0 0 1 0 9.2" />
    </LineGlyph>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 8.25 7.25 10l3.5-3.75" />
    </LineGlyph>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <path d="M2 4.25C2 3.56 2.56 3 3.25 3H6.2l1.5 1.5h5.05c.69 0 1.25.56 1.25 1.25V12c0 .69-.56 1.25-1.25 1.25h-9.5C2.56 13.25 2 12.69 2 12V4.25Z" />
    </LineGlyph>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <path d="M8 4.25C6.9 3.3 5.2 2.75 2.5 2.75v9.75c2.7 0 4.4.55 5.5 1.5 1.1-.95 2.8-1.5 5.5-1.5V2.75c-2.7 0-4.4.55-5.5 1.5Z" />
      <path d="M8 4.25V14" />
    </LineGlyph>
  );
}

export function BriefcaseIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <rect x="2" y="4.75" width="12" height="8.5" rx="1.25" />
      <path d="M5.75 4.75V3.5c0-.41.34-.75.75-.75h3c.41 0 .75.34.75.75v1.25" />
      <path d="M2 8.5h12" />
    </LineGlyph>
  );
}

export function BuildingIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <path d="M3 14V3c0-.55.45-1 1-1h5c.55 0 1 .45 1 1v11" />
      <path d="M10 6.5h2c.55 0 1 .45 1 1V14" />
      <path d="M1.75 14h12.5" />
      <path d="M5.25 5h2.5M5.25 7.75h2.5M5.25 10.5h2.5" />
    </LineGlyph>
  );
}

export function NetworkIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <circle cx="8" cy="3.5" r="1.75" />
      <circle cx="3.5" cy="12" r="1.75" />
      <circle cx="12.5" cy="12" r="1.75" />
      <path d="M7.1 5 4.4 10.5M8.9 5l2.7 5.5M5.25 12h5.5" />
    </LineGlyph>
  );
}

export function CreditCardIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <rect x="1.75" y="3.5" width="12.5" height="9" rx="1.25" />
      <path d="M1.75 6.5h12.5" />
      <path d="M4.25 10h2.5" />
    </LineGlyph>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M2 13.25c0-2.21 1.79-3.75 4-3.75s4 1.54 4 3.75" />
      <path d="M10.5 3.5a2.25 2.25 0 0 1 0 4.5" />
      <path d="M11.75 9.75c1.45.45 2.25 1.75 2.25 3.5" />
    </LineGlyph>
  );
}

export function PlugIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <path d="M6 2v3M10 2v3" />
      <path d="M4.25 5h7.5v2.5a3.75 3.75 0 0 1-7.5 0V5Z" />
      <path d="M8 11.25V14" />
    </LineGlyph>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <path d="M7 2.5 8.1 5.9 11.5 7 8.1 8.1 7 11.5 5.9 8.1 2.5 7l3.4-1.1L7 2.5Z" />
      <path d="m12.25 10.25.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" />
    </LineGlyph>
  );
}

export function CoinsIcon(props: IconProps) {
  return (
    <LineGlyph {...props}>
      <ellipse cx="8" cy="4.25" rx="5" ry="2" />
      <path d="M3 4.25V8c0 1.1 2.24 2 5 2s5-.9 5-2V4.25" />
      <path d="M3 8v3.75c0 1.1 2.24 2 5 2s5-.9 5-2V8" />
    </LineGlyph>
  );
}
