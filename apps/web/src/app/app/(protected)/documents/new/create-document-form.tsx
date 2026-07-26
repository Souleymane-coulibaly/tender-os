"use client";

import { useActionState } from "react";
import { createDocumentAction, type FormActionState } from "../../../documents-actions";
import { DOCUMENT_CATEGORY_SUGGESTIONS, DOCUMENT_DOMAIN_LABELS, DOCUMENT_ORIGIN_LABELS } from "../../../../../lib/documents-types";

const INITIAL_STATE: FormActionState = {};

export function CreateDocumentForm() {
  const [state, formAction, isPending] = useActionState(createDocumentAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm font-medium text-neutral-700">
          Titre *
        </label>
        <input id="title" name="title" type="text" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium text-neutral-700">
          Description
        </label>
        <textarea id="description" name="description" rows={2} className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="origin" className="text-sm font-medium text-neutral-700">
            Origine *
          </label>
          <select id="origin" name="origin" required defaultValue="USER_UPLOAD" className="rounded border border-neutral-300 px-3 py-2 text-sm">
            {Object.entries(DOCUMENT_ORIGIN_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="domain" className="text-sm font-medium text-neutral-700">
            Domaine *
          </label>
          <select id="domain" name="domain" required defaultValue="ORGANIZATION" className="rounded border border-neutral-300 px-3 py-2 text-sm">
            {Object.entries(DOCUMENT_DOMAIN_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="category" className="text-sm font-medium text-neutral-700">
          Categorie
        </label>
        <input
          id="category"
          name="category"
          type="text"
          list="category-suggestions"
          placeholder="RC, CCTP, KBIS..."
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <datalist id="category-suggestions">
          {DOCUMENT_CATEGORY_SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        <p className="text-xs text-neutral-500">Liste indicative — vous pouvez saisir une valeur libre.</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="text-sm font-medium text-neutral-700">
          Fichier *
        </label>
        <input id="file" name="file" type="file" required className="text-sm" />
        <p className="text-xs text-neutral-500">Formats acceptes : PDF, Word, Excel, CSV, texte, PNG, JPEG.</p>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Depot en cours..." : "Deposer le document"}
      </button>
    </form>
  );
}
