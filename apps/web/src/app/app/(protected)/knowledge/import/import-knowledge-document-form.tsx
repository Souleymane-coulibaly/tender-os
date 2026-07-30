"use client";

import { useActionState, useState } from "react";
import { importKnowledgeDocumentAction, type FormActionState } from "../../../knowledge-actions";
import { KNOWLEDGE_CATEGORY_LABELS, type KnowledgeCategory } from "../../../../../lib/knowledge-types";
import { KnowledgeMetadataFields } from "../knowledge-metadata-fields";

const INITIAL_STATE: FormActionState = {};

export function ImportKnowledgeDocumentForm() {
  const [state, formAction, isPending] = useActionState(importKnowledgeDocumentAction, INITIAL_STATE);
  const [category, setCategory] = useState<KnowledgeCategory>("CONSULTANT_PROFILE");

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
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
          <label htmlFor="category" className="text-sm font-medium text-neutral-700">
            Catégorie *
          </label>
          <select
            id="category"
            name="category"
            required
            value={category}
            onChange={(event) => setCategory(event.target.value as KnowledgeCategory)}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          >
            {Object.entries(KNOWLEDGE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="language" className="text-sm font-medium text-neutral-700">
            Langue
          </label>
          <input id="language" name="language" type="text" placeholder="fr" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="tags" className="text-sm font-medium text-neutral-700">
          Tags (séparés par une virgule)
        </label>
        <input id="tags" name="tags" type="text" placeholder="cloud, ISO-27001" className="rounded border border-neutral-300 px-3 py-2 text-sm" />
      </div>

      <KnowledgeMetadataFields category={category} />

      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="text-sm font-medium text-neutral-700">
          Fichier *
        </label>
        <input id="file" name="file" type="file" required className="text-sm" />
        <p className="text-xs text-neutral-500">Formats acceptés : PDF, Word, Excel, CSV, texte, PNG, JPEG.</p>
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
        {isPending ? "Import en cours..." : "Importer le document"}
      </button>
    </form>
  );
}
