"use client";

import { useActionState } from "react";
import Link from "next/link";
import { attachClientDocumentAction, type FormActionState } from "../../../../company-profile-actions";
import type { DocumentClientAccountAssociation } from "../../../../../../lib/company-profile-types";

const INITIAL_STATE: FormActionState = {};

const CATEGORIES = ["KBIS", "TAX_CERTIFICATE", "SOCIAL_CERTIFICATE", "ARTICLES_OF_ASSOCIATION", "OTHER"] as const;
const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  KBIS: "Extrait Kbis",
  TAX_CERTIFICATE: "Attestation fiscale",
  SOCIAL_CERTIFICATE: "Attestation sociale (URSSAF)",
  ARTICLES_OF_ASSOCIATION: "Statuts",
  OTHER: "Autre",
};

export function DocumentsSection({ clientId, documents }: { clientId: string; documents: DocumentClientAccountAssociation[] }) {
  const boundAction = attachClientDocumentAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">
        Documents justificatifs génériques (Kbis, attestations, statuts). Un document utilisé par une assurance, une certification ou un compte bancaire garde SA propre référence — ne le rattachez pas deux fois ici.
      </p>

      {documents.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun document rattaché.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Catégorie</th>
                <th className="py-2 pr-4">Document</th>
                <th className="py-2 pr-4">Rattaché le</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((association) => (
                <tr key={association.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4 text-neutral-600">{CATEGORY_LABELS[association.category as (typeof CATEGORIES)[number]] ?? association.category}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/app/documents/${association.documentId}`} className="text-neutral-700 hover:underline">
                      Voir le document →
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{new Date(association.createdAt).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-3 rounded border border-neutral-200 p-3">
        <h3 className="text-sm font-semibold text-neutral-900">Rattacher un document</h3>
        <p className="text-xs text-neutral-500">
          Importez d&apos;abord le document depuis{" "}
          <Link href="/app/documents/new" className="underline">
            Documents
          </Link>
          , puis collez son identifiant ici.
        </p>
        <div className="grid grid-cols-2 gap-3">
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
        </div>
        {state.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        <button type="submit" disabled={isPending} className="self-start rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {isPending ? "Rattachement..." : "Rattacher"}
        </button>
      </form>
    </div>
  );
}
