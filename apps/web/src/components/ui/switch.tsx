import type { InputHTMLAttributes, ReactNode } from "react";

/** Design System Checkpoint B (Core Primitives) — même motif que `Checkbox` (input natif masqué +
 *  case dessinée pilotée en CSS pur, aucun JS/état contrôlé nécessaire). Server Component. */
export function Switch({ label, className = "", ...rest }: { label?: ReactNode; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-sm text-tenderos-navy has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${className}`}>
      <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
        <input type="checkbox" role="switch" className="peer absolute inset-0 z-10 h-5 w-9 cursor-pointer opacity-0" {...rest} />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full bg-tenderos-navy/15 transition-colors peer-checked:bg-tenderos-navy peer-focus-visible:ring-2 peer-focus-visible:ring-tenderos-blue/40"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4"
        />
      </span>
      {label}
    </label>
  );
}
