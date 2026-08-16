import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-tenderos-navy text-white hover:bg-tenderos-navy/90",
  secondary: "border border-tenderos-navy/15 text-tenderos-navy hover:bg-tenderos-light",
  ghost: "text-tenderos-navy hover:bg-tenderos-light",
  danger: "border border-red-200 text-red-700 hover:bg-red-50",
};

const BASE_CLASSES = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — bouton unique pour toute la surface `/app`. Mission
 * §25F.9 "une seule action primaire visuellement dominante par page" : `primary` (navy plein) doit
 * rester rare sur un même écran, `secondary`/`ghost` pour tout le reste. `href` rend un `<Link>`
 * (navigation), son absence rend un `<button>` (action locale/formulaire) — jamais les deux props
 * de navigation et de soumission mélangées dans le même composant.
 */
export function Button({
  variant = "secondary",
  href,
  className = "",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  href?: string;
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
