"use client";

import { useActionState } from "react";
import Link from "next/link";
import { attachSubcontractorDocumentAction, type FormActionState } from "../../../subcontractor-actions";
import type { SubcontractorProfileDocument } from "../../../../../lib/subcontractor-types";

const INITIAL_STATE: FormActionState = {};

const CATEGORIES = ["KBIS", "TAX_CERTIFICATE", "SOCIAL_CERTIFICATE", "INSURANCE", "CERTIFICATION", "BANK_DETAILS", "REFERENCE", "OTHER"] as const;
const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  KBIS: "Extrait Kbis",
  TAX_CERTIFICATE: "Attestation fiscale",
  SOCIAL_CERTIFICATE: "Attestation sociale (URSSAF)",
  INSURANCE: "Attestation d'assurance",
  CERTIFICATION: "Certificat",
  BANK_DETAILS: "RIB",
  REFERENCE: "Référence",
  OTHER: "Autre",
};

export function SubcontractorDocumentsSection({ subcontractorId, documents }: { subcontractorId: string; documents: SubcontractorProfileDocument[] }) {
  const boundAction = attachSubcontractorDocumentAction.bind(null, subcontractorId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-neutral-900">Documents</h2>
      {documents.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun document rattaché.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {documents.map((document) => (
            <li key={document.id} className="flex items-center justify-between rounded border border-neutral-100 px-3 py-2">
              <span className="text-neutral-700">{CATEGORY_LABELS[document.category as (typeof CATEGORIES)[number]] ?? document.category}</span>
              <Link href={`/app/documents/${document.documentId}`} className="text-neutral-700 hover:underline">
                Voir le document →
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <p className="w-full text-xs text-neutral-500">
          Importez d&apos;abord le document depuis{" "}
          <Link href="/app/documents/new" className="underline">
            Documents
          </Link>
          , puis collez son identifiant ici.
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor="documentId" className="text-xs text-neutral-600">
            Identifiant du document *
          </label>
          <input id="documentId" name="documentId" required className="rounded border border-neutral-300 px-2 py-1.5 text-sm font-mono" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-xs text-neutral-600">
            Catégorie *
          </label>
          <select id="category" name="category" required className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={isPending} className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {isPending ? "Rattachement..." : "Rattacher"}
        </button>
        {state.error ? (
          <p role="alert" className="w-full text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
