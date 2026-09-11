"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Textarea } from "../../../../../components/ui";
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
      <Select id="documentType" label="Type de document" value={documentType} onChange={(e) => setDocumentType(e.target.value)} wrapperClassName="max-w-md">
        <option value="TECHNICAL_MEMO">{DELIVERABLE_TYPE_LABELS.TECHNICAL_MEMO}</option>
        <option value="EXECUTIVE_SUMMARY">{DELIVERABLE_TYPE_LABELS.EXECUTIVE_SUMMARY}</option>
      </Select>

      <Input id="name" label="Nom" value={name} onChange={(e) => setName(e.target.value)} wrapperClassName="max-w-md" />

      <Textarea id="sections" label="Sections (JSON)" value={sections} onChange={(e) => setSections(e.target.value)} rows={12} className="font-mono" />

      <Button type="button" variant="primary" disabled={isPending} onClick={handleCreate} className="self-start">
        {isPending ? "Création..." : "Créer le template"}
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
