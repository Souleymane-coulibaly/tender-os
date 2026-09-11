"use client";

import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";

/**
 * Design System — sélection de fichier. Remplace le contrôle natif du navigateur, dont
 * l'apparence (bouton gris, texte « Aucun fichier choisi » tronqué) ne peut pas être stylée.
 *
 * Le champ natif reste PRÉSENT et fonctionnel, seulement masqué visuellement (`sr-only`, jamais
 * `display:none`) — même principe que `Checkbox` : il garde son `name`, donc un formulaire envoie
 * exactement le même `FormData` qu'avant ; il reste atteignable au clavier et nommé pour les
 * lecteurs d'écran ; la validation native `required` continue de s'appliquer.
 *
 * Client Component : afficher le nom du fichier choisi exige un état, que le CSS seul ne peut pas
 * lire. Un `reset` du formulaire parent (après un envoi réussi) remet l'affichage à zéro, pour
 * ne jamais montrer un nom de fichier qui n'est plus sélectionné.
 */
export function FileInput({
  buttonLabel,
  emptyLabel = "Aucun fichier choisi",
  className = "",
  onChange,
  multiple,
  disabled,
  ...rest
}: {
  /** Libellé du bouton — par défaut « Choisir un fichier », ou « Choisir des fichiers » si `multiple`. */
  buttonLabel?: string;
  emptyLabel?: string;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<string | undefined>(undefined);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const clear = () => setSelection(undefined);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) setSelection(undefined);
    else if (files.length === 1) setSelection(files[0]!.name);
    else setSelection(`${files.length} fichiers`);
    onChange?.(event);
  }

  const label = buttonLabel ?? (multiple ? "Choisir des fichiers" : "Choisir un fichier");

  return (
    <label
      className={`inline-flex min-w-0 max-w-full cursor-pointer items-center gap-3 rounded-lg border border-tenderos-navy/15 bg-white py-1.5 pl-1.5 pr-3 text-sm transition focus-within:ring-2 focus-within:ring-tenderos-blue/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${className}`}
    >
      <input ref={inputRef} type="file" className="sr-only" multiple={multiple} disabled={disabled} onChange={handleChange} {...rest} />
      <span
        aria-hidden="true"
        className="shrink-0 rounded-md border border-tenderos-navy/15 px-3 py-1 text-xs font-semibold text-tenderos-navy transition hover:bg-tenderos-light"
      >
        {label}
      </span>
      <span className={`min-w-0 truncate ${selection ? "text-tenderos-navy" : "text-tenderos-slate"}`}>{selection ?? emptyLabel}</span>
    </label>
  );
}
