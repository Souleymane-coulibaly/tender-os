"use client";

import { useActionState } from "react";
import { createRequestedDocumentAction, type FormActionState } from "../../../actions";
import type { RequestedDocument } from "../../../../../lib/tenders-types";

const INITIAL_STATE: FormActionState = {};

function statusBadgeClass(status: RequestedDocument["status"]): string {
  switch (status) {
    case "VALIDATED":
      return "bg-green-100 text-green-800";
    case "REJECTED":
      return "bg-red-100 text-red-800";
    case "PROVIDED":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

export function RequestedDocumentsSection({
  tenderId,
  documents,
}: {
  tenderId: string;
  documents: RequestedDocument[];
}) {
  const boundAction = createRequestedDocumentAction.bind(null, tenderId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-neutral-700">Pieces demandees</h2>
      {documents.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune piece demandee.</p>
      ) : (
        <ul>
          {documents.map((document) => (
            <li key={document.id} className="flex items-center gap-2 border-b border-neutral-100 py-2 text-sm">
              <span className="font-medium text-neutral-900">{document.name}</span>
              {document.required ? <span className="text-xs text-amber-700">obligatoire</span> : null}
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(document.status)}`}>
                {document.status}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="flex items-end gap-2">
        <input
          name="name"
          type="text"
          required
          placeholder="Nom de la piece..."
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <input
          name="category"
          type="text"
          placeholder="Categorie"
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <label className="flex items-center gap-1 text-xs text-neutral-600">
          <input name="required" type="checkbox" /> obligatoire
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50"
        >
          Ajouter
        </button>
        {state.error ? (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
