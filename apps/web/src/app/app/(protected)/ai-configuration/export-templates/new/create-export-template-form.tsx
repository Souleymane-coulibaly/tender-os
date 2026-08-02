"use client";

import { useActionState } from "react";
import { createExportTemplateAction, type FormActionState } from "../../../../export-actions";
import { EXPORT_DOCUMENT_TYPES, EXPORT_DOCUMENT_TYPE_LABELS } from "../../../../../../lib/export-types";

const INITIAL_STATE: FormActionState = {};

const DEFAULT_CONFIG = JSON.stringify(
  {
    sections: [{ id: "INTRODUCTION", label: "Introduction", mandatory: true, order: 0 }],
    coverPage: { showBuyerName: true, showClientName: true, showReference: true, showTitle: true, showDate: true, showVersion: true },
    showPageNumbers: true,
    showTableOfContents: true,
  },
  null,
  2,
);

export function CreateExportTemplateForm() {
  const [state, formAction, isPending] = useActionState(createExportTemplateAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-3 rounded border border-neutral-200 p-4">
      <label htmlFor="name" className="text-sm font-medium text-neutral-700">
        Nom *
      </label>
      <input id="name" name="name" required className="rounded border border-neutral-300 px-3 py-2 text-sm" />

      <label htmlFor="documentType" className="text-sm font-medium text-neutral-700">
        Type de document *
      </label>
      <select id="documentType" name="documentType" required defaultValue="" className="rounded border border-neutral-300 px-3 py-2 text-sm">
        <option value="" disabled>
          Sélectionner...
        </option>
        {EXPORT_DOCUMENT_TYPES.map((type) => (
          <option key={type} value={type}>
            {EXPORT_DOCUMENT_TYPE_LABELS[type] ?? type}
          </option>
        ))}
      </select>

      <label htmlFor="format" className="text-sm font-medium text-neutral-700">
        Format *
      </label>
      <select id="format" name="format" required defaultValue="DOCX" className="rounded border border-neutral-300 px-3 py-2 text-sm">
        <option value="DOCX">DOCX</option>
        <option value="PDF">PDF</option>
      </select>

      <label htmlFor="description" className="text-sm font-medium text-neutral-700">
        Description
      </label>
      <textarea id="description" name="description" rows={2} className="rounded border border-neutral-300 px-3 py-2 text-sm" />

      <label htmlFor="config" className="text-sm font-medium text-neutral-700">
        Configuration (JSON) *
      </label>
      <p className="text-xs text-neutral-500">
        Liste des sections (identifiant en majuscules, libellé, obligatoire, ordre), mise en page de la page de garde, pied de page et sommaire. Structure contrôlée côté serveur — jamais un
        template exécutable.
      </p>
      <textarea id="config" name="config" rows={12} defaultValue={DEFAULT_CONFIG} className="rounded border border-neutral-300 px-3 py-2 font-mono text-xs" />

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Création..." : "Créer le template"}
      </button>
    </form>
  );
}
