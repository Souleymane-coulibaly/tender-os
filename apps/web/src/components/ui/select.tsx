import type { SelectHTMLAttributes } from "react";
import { ChevronDownIcon } from "./icons";
import { FieldWrapper, fieldControlClasses } from "./field-wrapper";

/**
 * Design System Checkpoint B (Core Primitives) — `<select>` natif stylé (mission §45/§46 "jamais
 * de bibliothèque UI supplémentaire" — un menu déroulant custom exigerait une dépendance ou une
 * quantité de JS/ARIA non justifiée face au natif, déjà pleinement accessible et navigable au
 * clavier). Server Component.
 */
export function Select({
  label,
  hint,
  error,
  required,
  wrapperClassName,
  className = "",
  children,
  ...rest
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  wrapperClassName?: string;
  className?: string;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  // `aria-label` explicite — voir `input.tsx` pour la justification.
  const control = (
    <span className="relative block">
      <select required={required} aria-label={label} aria-invalid={error ? true : undefined} className={`${fieldControlClasses({ error, className })} appearance-none pr-9`} {...rest}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-tenderos-slate" />
    </span>
  );

  if (!label && !hint && !error) return control;

  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {control}
    </FieldWrapper>
  );
}
