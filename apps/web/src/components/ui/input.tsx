import type { InputHTMLAttributes } from "react";
import { FieldWrapper, fieldControlClasses } from "./field-wrapper";

/**
 * Design System Checkpoint B (Core Primitives) — champ texte unique pour toute la surface
 * TenderOS, mission §12 (Form System) : états default/focus/filled/disabled/error déjà couverts
 * par `fieldControlClasses` (`field-wrapper.tsx`). Server Component (aucune interactivité propre,
 * le formulaire parent — souvent déjà un Client Component pour son action — gère l'état).
 */
export function Input({
  label,
  hint,
  error,
  required,
  wrapperClassName,
  className = "",
  ...rest
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  wrapperClassName?: string;
  className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  // `aria-label` explicite (mission §32 accessibilité) — sans lui, un `<label>` enveloppant
  // calculerait le nom accessible à partir de TOUT son contenu texte, y compris le hint/l'erreur
  // rendus après le champ (ex. "SIRET Ce champ est obligatoire." au lieu de "SIRET" seul).
  const control = <input required={required} aria-label={label} aria-invalid={error ? true : undefined} className={fieldControlClasses({ error, className })} {...rest} />;

  if (!label && !hint && !error) return control;

  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {control}
    </FieldWrapper>
  );
}
