import type { ReactNode } from "react";

const MAX_WIDTH_CLASSES = {
  default: "max-w-6xl",
  narrow: "max-w-3xl",
  wide: "max-w-7xl",
  full: "max-w-none",
} as const;

/**
 * Design System Checkpoint C (Application Primitives) — mission §28 : largeur max/marges de page/
 * espacement entre sections cohérents, jamais des marges arbitraires réinventées par écran (déjà
 * observé à l'audit Checkpoint A : `<main>` de l'App Shell fixe `p-4 md:p-6`, mais rien n'unifie la
 * largeur max ni l'espacement VERTICAL entre les sections d'une page). Non branché sur un écran
 * métier existant dans ce Checkpoint (migration progressive, mission §38/§39).
 */
export function ContentContainer({
  children,
  maxWidth = "default",
  className = "",
}: {
  children: ReactNode;
  maxWidth?: keyof typeof MAX_WIDTH_CLASSES;
  className?: string;
}) {
  return <div className={`mx-auto flex w-full flex-col gap-6 ${MAX_WIDTH_CLASSES[maxWidth]} ${className}`}>{children}</div>;
}
