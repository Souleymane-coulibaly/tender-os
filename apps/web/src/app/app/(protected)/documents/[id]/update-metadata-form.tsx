"use client";

import { useActionState } from "react";
import { updateDocumentMetadataAction, type FormActionState } from "../../../documents-actions";
import { DOCUMENT_CATEGORY_SUGGESTIONS, DOCUMENT_DOMAIN_LABELS, type DocumentSummary } from "../../../../../lib/documents-types";
import { Button, Card, Input, Select, Textarea } from "../../../../../components/ui";

const INITIAL_STATE: FormActionState = {};

export function UpdateMetadataForm({ document }: { document: DocumentSummary }) {
  const boundAction = updateDocumentMetadataAction.bind(null, document.id);
  const [state, formAction, isPending] = useActionState(boundAction, INITIAL_STATE);

  return (
    <Card title="Modifier les métadonnées">
      <form action={formAction} className="flex flex-col gap-3">
        <Input label="Titre" id="title" name="title" type="text" defaultValue={document.title} />
        <Textarea label="Description" id="description" name="description" rows={2} defaultValue={document.description} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Domaine" id="domain" name="domain" defaultValue={document.domain}>
            {Object.entries(DOCUMENT_DOMAIN_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <div className="flex flex-col">
            <Input label="Catégorie" id="category" name="category" type="text" list="category-suggestions" defaultValue={document.category} />
            <datalist id="category-suggestions">
              {DOCUMENT_CATEGORY_SUGGESTIONS.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>
        </div>
        {state.error ? (
          <p role="alert" className="text-xs text-danger-fg">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </form>
    </Card>
  );
}
