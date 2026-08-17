import type { ReactNode } from "react";

/**
 * Design System Checkpoint B (Core Primitives) — motif interne partagé par `Input`/`Textarea`/
 * `Select` : label + contrôle + hint/erreur, sans jamais dépendre de `useId()` (incompatible avec
 * les Server Components, mission §46 "préserver les Server Components lorsque possible") — le
 * `<label>` ENVELOPPE le contrôle (association implicite native, aucun `id` généré nécessaire).
 * Reproduit exactement le motif déjà copié-collé à la main dans chaque formulaire Onboarding
 * (`rounded-lg border border-tenderos-navy/15 ... focus:border-tenderos-blue`, voir audit
 * Checkpoint A) — jamais un second système de style pour les champs.
 */
export function FieldWrapper({
  label,
  hint,
  error,
  required,
  className = "",
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {label ? (
        <span className="text-sm font-medium text-tenderos-navy">
          {label}
          {required ? (
            <span className="ml-0.5 text-danger-fg" aria-hidden="true">
              *
            </span>
          ) : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="text-xs font-medium text-danger-fg" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-tenderos-slate">{hint}</span>
      ) : null}
    </label>
  );
}

/** Classes de bordure/fond partagées par TOUS les contrôles de formulaire (Input/Textarea/Select) —
 *  un seul point de vérité pour l'état par défaut/focus/disabled/erreur (mission §12/§43). */
export function fieldControlClasses(input: { error?: string | undefined; className?: string }): string {
  const base =
    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-tenderos-navy transition placeholder:text-tenderos-slate/70 " +
    "focus:outline-none focus:ring-2 focus:ring-tenderos-blue/40 disabled:cursor-not-allowed disabled:bg-tenderos-light disabled:opacity-60";
  const borderState = input.error ? "border-danger-fg focus:border-danger-fg" : "border-tenderos-navy/15 focus:border-tenderos-blue";
  return `${base} ${borderState} ${input.className ?? ""}`;
}
