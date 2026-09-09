"use client";

import { useActionState } from "react";
import Link from "next/link";
import { attachClientDocumentAction, type FormActionState } from "../../../../company-profile-actions";
import type { DocumentClientAccountAssociation } from "../../../../../../lib/company-profile-types";

const INITIAL_STATE: FormActionState = {};


/**
 * Checkpoint TENDEROS-2.1-CCV2-I.3 — catégories COMMERCIALES (CRM).
 *
 * Cette liste proposait jusqu'ici le catalogue de CANDIDATURE (Kbis, attestations fiscale et
 * sociale, statuts). Depuis CCV2-I.1 l'API refuse chacune de ces valeurs en 422 : l'interface
 * n'offrait donc QUE des options vouées à échouer — le pire des états, puisque l'utilisateur ne
 * pouvait rien rattacher à son client sans comprendre pourquoi.
 *
 * Les valeurs ci-dessous sont exactement celles acceptées par le domaine
 * (`CLIENT_COMMERCIAL_DOCUMENT_CATEGORIES`), jamais un catalogue parallèle.
 */
const CATEGORIES = [
  "COMMERCIAL_CONTRACT",
  "CLIENT_BRIEF",
  "MEETING_NOTE",
  "CLIENT_PROVIDED_DOCUMENT",
  "INTERNAL_COMMERCIAL_DOCUMENT",
  "OTHER_COMMERCIAL",
] as const;
const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  COMMERCIAL_CONTRACT: "Contrat commercial",
  CLIENT_BRIEF: "Brief client",
  MEETING_NOTE: "Compte rendu de réunion",
  CLIENT_PROVIDED_DOCUMENT: "Document transmis par le client",
  INTERNAL_COMMERCIAL_DOCUMENT: "Document commercial interne",
  OTHER_COMMERCIAL: "Autre document commercial",
};

/** Catégories HISTORIQUES : plus proposables, mais toujours affichées lisiblement pour les lignes
 *  déjà rattachées — une donnée existante ne doit jamais apparaître sous un code brut. */
const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  KBIS: "Extrait Kbis (historique)",
  TAX_CERTIFICATE: "Attestation fiscale (historique)",
  SOCIAL_CERTIFICATE: "Attestation sociale (historique)",
  ARTICLES_OF_ASSOCIATION: "Statuts (historique)",
  OTHER: "Autre (historique)",
};

export function DocumentsSection({ clientId, documents }: { clientId: string; documents: DocumentClientAccountAssociation[] }) {
  const boundAction = attachClientDocumentAction.bind(null, clientId);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">
        Documents <strong>commerciaux</strong> de la relation client : contrats, briefs, comptes rendus. Les pièces de
        candidature (Kbis, attestations, assurances, RIB) relèvent de l&apos;
        <Link href="/app/candidate-companies" className="underline">
          entreprise candidate
        </Link>
        , qui est l&apos;entité juridique répondant aux appels d&apos;offres.
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
                  <td className="py-2 pr-4 text-neutral-600">{CATEGORY_LABELS[association.category as (typeof CATEGORIES)[number]] ?? LEGACY_CATEGORY_LABELS[association.category] ?? association.category}</td>
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
        <h3 className="text-sm font-semibold text-neutral-900">Rattacher un document commercial</h3>
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
