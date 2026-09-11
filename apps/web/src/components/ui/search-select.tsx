"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { fieldControlClasses } from "./field-wrapper";

export type SearchSelectOption = Readonly<{ value: string; label: string; description?: string }>;

/**
 * Design System — recherche et sélection d'un élément dans une liste distante (document de la
 * bibliothèque…). Remplace les champs où l'utilisateur devait taper un identifiant technique.
 *
 * Combobox accessible (motif ARIA « combobox + listbox ») : flèches pour parcourir, Entrée pour
 * choisir, Échap pour fermer ; l'option active est annoncée par `aria-activedescendant`. Écrit sans
 * bibliothèque externe, comme le reste du design system.
 *
 * La valeur choisie part dans un champ caché nommé `name` : un formulaire envoie donc exactement la
 * donnée qu'il envoyait avec l'ancien champ texte. Tant que rien n'est choisi, le champ caché reste
 * vide — un texte tapé sans sélection n'est jamais envoyé comme s'il était un identifiant.
 * Pas d'option `required` : un champ caché échappe à la validation native du navigateur, elle
 * ne protégerait rien. Le contrôle d'une valeur vide reste celui du serveur.
 *
 * Les réponses arrivent dans le désordre quand l'utilisateur tape vite : seule la réponse à la
 * DERNIÈRE recherche est affichée.
 */
export function SearchSelect({
  name,
  search,
  placeholder = "Rechercher…",
  ariaLabel,
  minQueryLength = 2,
  debounceMs = 250,
  emptyMessage = "Aucun résultat.",
  disabled,
  className = "",
  onSelect,
}: {
  name?: string;
  search: (query: string) => Promise<readonly SearchSelectOption[]>;
  placeholder?: string;
  ariaLabel: string;
  minQueryLength?: number;
  debounceMs?: number;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  onSelect?: (option: SearchSelectOption | undefined) => void;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<readonly SearchSelectOption[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selected, setSelected] = useState<SearchSelectOption | undefined>(undefined);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const latestRequest = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (selected && trimmed === selected.label) return;
    if (trimmed.length < minQueryLength) {
      setOptions([]);
      setState("idle");
      return;
    }
    const requestId = ++latestRequest.current;
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const result = await search(trimmed);
        if (requestId !== latestRequest.current) return;
        setOptions(result);
        setActiveIndex(result.length > 0 ? 0 : -1);
        setState("idle");
        setOpen(true);
      } catch {
        if (requestId !== latestRequest.current) return;
        setOptions([]);
        setState("error");
        setOpen(true);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, minQueryLength, debounceMs, search, selected]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form) return;
    const clear = () => {
      setSelected(undefined);
      setQuery("");
      setOptions([]);
      setOpen(false);
    };
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  function choose(option: SearchSelectOption) {
    setSelected(option);
    setQuery(option.label);
    setOpen(false);
    onSelect?.(option);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && activeIndex >= 0 && options[activeIndex]) {
      event.preventDefault();
      choose(options[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const activeId = open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (selected) {
            setSelected(undefined);
            onSelect?.(undefined);
          }
        }}
        onFocus={() => options.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        className={fieldControlClasses({ className: "" })}
      />
      <input ref={hiddenRef} type="hidden" name={name} value={selected?.value ?? ""} />
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-tenderos-navy/15 bg-white py-1 text-sm shadow-lg"
        >
          {state === "error" ? (
            <li className="px-3 py-2 text-danger-fg">
              La recherche est momentanément indisponible.
            </li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-tenderos-slate">{emptyMessage}</li>
          ) : (
            options.map((option, index) => (
              <li
                key={option.value}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`cursor-pointer px-3 py-2 ${index === activeIndex ? "bg-tenderos-light" : ""}`}
              >
                <span className="block truncate text-tenderos-navy">{option.label}</span>
                {option.description ? (
                  <span className="block truncate text-xs text-tenderos-slate">
                    {option.description}
                  </span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
      {state === "loading" ? (
        <span className="sr-only" role="status">
          Recherche en cours
        </span>
      ) : null}
    </div>
  );
}
