import type { TextareaHTMLAttributes } from "react";
import { FieldWrapper, fieldControlClasses } from "./field-wrapper";

/** Design System Checkpoint B (Core Primitives) — même motif que `Input`, mission §12. */
export function Textarea({
  label,
  hint,
  error,
  required,
  wrapperClassName,
  className = "",
  rows = 4,
  ...rest
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  wrapperClassName?: string;
  className?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  // `aria-label` explicite — voir `input.tsx` pour la justification (jamais laisser le hint/erreur
  // s'infiltrer dans le nom accessible calculé depuis un `<label>` enveloppant).
  const control = <textarea rows={rows} required={required} aria-label={label} aria-invalid={error ? true : undefined} className={fieldControlClasses({ error, className })} {...rest} />;

  if (!label && !hint && !error) return control;

  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {control}
    </FieldWrapper>
  );
}
