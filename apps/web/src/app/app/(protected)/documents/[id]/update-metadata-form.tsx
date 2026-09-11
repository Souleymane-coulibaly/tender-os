"use client";

import { useActionState } from "react";
import { updateDocumentMetadataAction, type FormActionState } from "../../../documents-actions";
import { DOCUMENT_CATEGORY_SUGGESTIONS, DOCUMENT_DOMAIN_LABELS, type DocumentSummary } from "../../../../../lib/documents-types";

const INITIAL_STATE: FormActionState = {};

export function UpdateMetadataForm({ document }: { document: DocumentSummary }) {
  const boundAction = updateDocumentMetadataAction.bind(null, document.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm font-semibold text-neutral-700">Modifier les métadonnées</h2>
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-xs text-neutral-600">
          Titre
        </label>
        <input
          id="title"
          name="title"
          type="text"
          defaultValue={document.title}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-xs text-neutral-600">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={document.description}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="domain" className="text-xs text-neutral-600">
            Domaine
          </label>
          <select
            id="domain"
            name="domain"
            defaultValue={document.domain}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            {Object.entries(DOCUMENT_DOMAIN_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-xs text-neutral-600">
            Catégorie
          </label>
          <input
            id="category"
            name="category"
            type="text"
            list="category-suggestions"
            defaultValue={document.category}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <datalist id="category-suggestions">
            {DOCUMENT_CATEGORY_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
      >
        {isPending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
