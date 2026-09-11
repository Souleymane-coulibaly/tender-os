"use client";

import { useActionState } from "react";
import { Button, Input, Select, Textarea } from "../../../../../../components/ui";
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
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <Input id="name" name="name" label="Nom" required />

      <Select id="documentType" name="documentType" label="Type de document" required defaultValue="">
        <option value="" disabled>
          Sélectionner...
        </option>
        {EXPORT_DOCUMENT_TYPES.map((type) => (
          <option key={type} value={type}>
            {EXPORT_DOCUMENT_TYPE_LABELS[type] ?? type}
          </option>
        ))}
      </Select>

      <Select id="format" name="format" label="Format" required defaultValue="DOCX">
        <option value="DOCX">DOCX</option>
        <option value="PDF">PDF</option>
      </Select>

      <Textarea id="description" name="description" label="Description" rows={2} />

      <Textarea
        id="config"
        name="config"
        label="Configuration (JSON)"
        required
        hint="Liste des sections (identifiant en majuscules, libellé, obligatoire, ordre), mise en page de la page de garde, pied de page et sommaire. Structure contrôlée côté serveur — jamais un template exécutable."
        rows={12}
        defaultValue={DEFAULT_CONFIG}
        className="font-mono"
      />

      {state.error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={isPending} className="self-start">
        {isPending ? "Création..." : "Créer le template"}
      </Button>
    </form>
  );
}
