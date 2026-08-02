"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDeliverableTemplateAction } from "../../../deliverable-actions";
import { DELIVERABLE_TYPE_LABELS } from "../../../../../lib/deliverable-types";

const DEFAULT_SECTIONS = JSON.stringify(
  [
    { code: "INTRODUCTION", title: "Introduction", order: 0, headingLevel: 1, requirement: "MANDATORY" },
    { code: "METHODOLOGIE", title: "Méthodologie", order: 1, headingLevel: 1, requirement: "MANDATORY", taskType: "METHODOLOGY" },
  ],
  null,
  2,
);

export function CreateDeliverableTemplateForm() {
  const router = useRouter();
  const [documentType, setDocumentType] = useState("TECHNICAL_MEMO");
  const [name, setName] = useState("");
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleCreate() {
    if (!name.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    setIsPending(true);
    setError(undefined);
    const result = await createDeliverableTemplateAction(documentType, name.trim(), sections);
    setIsPending(false);
    if (result.error) setError(result.error);
    else router.push(`/app/ai-configuration/deliverable-templates/${result.template!.id}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="documentType" className="text-sm font-medium text-neutral-700">
        Type de document
      </label>
      <select id="documentType" value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="max-w-md rounded border border-neutral-300 px-3 py-2 text-sm">
        <option value="TECHNICAL_MEMO">{DELIVERABLE_TYPE_LABELS.TECHNICAL_MEMO}</option>
        <option value="EXECUTIVE_SUMMARY">{DELIVERABLE_TYPE_LABELS.EXECUTIVE_SUMMARY}</option>
      </select>

      <label htmlFor="name" className="text-sm font-medium text-neutral-700">
        Nom
      </label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-md rounded border border-neutral-300 px-3 py-2 text-sm" />

      <label htmlFor="sections" className="text-sm font-medium text-neutral-700">
        Sections (JSON)
      </label>
      <textarea id="sections" value={sections} onChange={(e) => setSections(e.target.value)} rows={12} className="rounded border border-neutral-300 px-3 py-2 font-mono text-xs" />

      <button type="button" disabled={isPending} onClick={handleCreate} className="self-start rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {isPending ? "Création..." : "Créer le template"}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
