"use client";

import { useActionState } from "react";
import Link from "next/link";
import { attachSubcontractorDocumentAction, type FormActionState } from "../../../subcontractor-actions";
import type { SubcontractorProfileDocument } from "../../../../../lib/subcontractor-types";
import { Button, Card, FieldWrapper, Input, Select } from "../../../../../components/ui";

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
    <Card title="Documents">
      <div className="flex flex-col gap-4">
        {documents.length === 0 ? (
          <p className="text-sm text-tenderos-slate">Aucun document rattaché.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center justify-between gap-3 rounded-lg border border-tenderos-navy/10 px-3 py-2">
                <span className="text-tenderos-navy">{CATEGORY_LABELS[document.category as (typeof CATEGORIES)[number]] ?? document.category}</span>
                <Link href={`/app/documents/${document.documentId}`} className="shrink-0 text-tenderos-blue hover:underline">
                  Voir le document →
                </Link>
              </li>
            ))}
          </ul>
        )}
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <p className="w-full text-xs text-tenderos-slate">
            Importez d&apos;abord le document depuis{" "}
            <Link href="/app/documents/new" className="text-tenderos-blue underline">
              Documents
            </Link>
            , puis collez son identifiant ici.
          </p>
          <FieldWrapper label="Identifiant du document *" className="basis-64">
            <Input id="documentId" name="documentId" required className="font-mono" />
          </FieldWrapper>
          <FieldWrapper label="Catégorie *" className="basis-56">
            <Select id="category" name="category" required>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          </FieldWrapper>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Rattachement..." : "Rattacher"}
          </Button>
          {state.error ? (
            <p role="alert" className="w-full text-sm text-danger-fg">
              {state.error}
            </p>
          ) : null}
        </form>
      </div>
    </Card>
  );
}
