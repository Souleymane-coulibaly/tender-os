import type { InputHTMLAttributes, ReactNode } from "react";
import { CheckIcon } from "./icons";

/**
 * Design System Checkpoint B (Core Primitives) — case à cocher accessible sans JS (l'état
 * coché/focus/disabled est piloté par CSS via le sélecteur natif `:checked`/`:focus-visible`,
 * jamais un composant contrôlé côté client). L'input natif reste présent et cliquable (opacité 0,
 * jamais `display:none`), garantissant clavier/lecteur d'écran/comportement de formulaire natif
 * intacts — seule son apparence est masquée au profit d'une case dessinée. Server Component.
 */
export function Checkbox({ label, className = "", ...rest }: { label?: ReactNode; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-sm text-tenderos-navy has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${className}`}>
      <span className="relative inline-flex h-4 w-4 shrink-0">
        <input type="checkbox" className="peer absolute inset-0 z-10 h-4 w-4 cursor-pointer opacity-0" {...rest} />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded border border-tenderos-navy/25 bg-white transition peer-checked:border-tenderos-navy peer-checked:bg-tenderos-navy peer-focus-visible:ring-2 peer-focus-visible:ring-tenderos-blue/40"
        />
        <CheckIcon size={14} className="pointer-events-none absolute inset-0 m-auto hidden text-white peer-checked:block" />
      </span>
      {label}
    </label>
  );
}
