import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-tenderos-navy text-white hover:bg-tenderos-navy/90",
  secondary: "border border-tenderos-navy/15 text-tenderos-navy hover:bg-tenderos-light",
  // Design System Checkpoint B — mission §11 : `outline` (contour navy plein, sans fond) distinct
  // de `secondary` (contour discret + repli clair), utile quand un bouton doit rester visible sur
  // un fond déjà `tenderos-light`. Reproduit le motif déjà utilisé tel quel dans la Landing
  // (`hero-section.tsx`, audit Checkpoint A) plutôt qu'un 2e système de bouton marketing séparé.
  outline: "border border-tenderos-navy text-tenderos-navy hover:bg-tenderos-navy/5",
  ghost: "text-tenderos-navy hover:bg-tenderos-light",
  danger: "border border-red-200 text-red-700 hover:bg-red-50",
  // Mission §11 — action tertiaire textuelle (ex. "Annuler" à côté d'un bouton primary), jamais un
  // second style de lien texte inventé par écran.
  link: "text-tenderos-blue underline-offset-2 hover:underline p-0 h-auto",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-sm",
};

const BASE_CLASSES = "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — bouton unique pour toute la surface `/app`. Mission
 * §25F.9 "une seule action primaire visuellement dominante par page" : `primary` (navy plein) doit
 * rester rare sur un même écran, `secondary`/`ghost` pour tout le reste. `href` rend un `<Link>`
 * (navigation), son absence rend un `<button>` (action locale/formulaire) — jamais les deux props
 * de navigation et de soumission mélangées dans le même composant.
 *
 * Design System Checkpoint B — `size` (défaut `md`, identique à l'ancien padding fixe `px-4 py-2` :
 * AUCUN appelant existant n'est affecté) et `loading` (mission §11 "états : loading" — désactive le
 * bouton et affiche un spinner CSS pur, jamais un layout-shift : le contenu reste monté, seulement
 * masqué visuellement derrière le spinner superposé).
 */
export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  href,
  className = "",
  children,
  disabled,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  href?: string;
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizeClasses = variant === "link" ? "" : SIZE_CLASSES[size];
  const classes = `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${sizeClasses} ${className}`;

  const content = loading ? (
    <span className="relative inline-flex items-center gap-2">
      <span className="invisible inline-flex items-center gap-2">{children}</span>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      </span>
    </span>
  ) : (
    children
  );

  if (href) {
    return (
      <Link href={href} className={classes} aria-disabled={loading || disabled ? true : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
}
