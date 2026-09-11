"use client";

import { useActionState, useState } from "react";
import { importKnowledgeDocumentAction, type FormActionState } from "../../../knowledge-actions";
import {
  KNOWLEDGE_CATEGORY_LABELS,
  type KnowledgeCategory,
} from "../../../../../lib/knowledge-types";
import { KnowledgeMetadataFields } from "../knowledge-metadata-fields";
import { Button, Card, FieldWrapper, FileInput, Input, Select, Textarea } from "../../../../../components/ui";

const INITIAL_STATE: FormActionState = {};

export function ImportKnowledgeDocumentForm() {
  const [state, formAction, isPending] = useActionState(
    importKnowledgeDocumentAction,
    INITIAL_STATE,
  );
  const [category, setCategory] = useState<KnowledgeCategory>("CONSULTANT_PROFILE");

  return (
    <Card>
      <form action={formAction} className="flex max-w-2xl flex-col gap-4">
        {/* `FieldWrapper` + contrôle nu : le libellé reste exactement « Titre * » / « Catégorie * »
            (le composant ajouterait son propre astérisque). */}
        <FieldWrapper label="Titre *">
          <Input id="title" name="title" type="text" required />
        </FieldWrapper>

        <Textarea label="Description" id="description" name="description" rows={2} />

        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label="Catégorie *">
            <Select
              id="category"
              name="category"
              required
              value={category}
              onChange={(event) => setCategory(event.target.value as KnowledgeCategory)}
            >
              {Object.entries(KNOWLEDGE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FieldWrapper>
          <Input label="Langue" id="language" name="language" type="text" placeholder="fr" />
        </div>

        <Input label="Tags (séparés par une virgule)" id="tags" name="tags" type="text" placeholder="cloud, ISO-27001" />

        <KnowledgeMetadataFields category={category} />

        {/* `FileInput` rend déjà son propre `<label>` : le libellé du champ reste un `<label htmlFor>`
            séparé (jamais deux `<label>` imbriqués). */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="file" className="text-sm font-medium text-tenderos-navy">
            Fichier *
          </label>
          <FileInput id="file" name="file" required />
          <p className="text-xs text-tenderos-slate">
            Formats acceptés : PDF, Word, Excel, CSV, texte, PNG, JPEG.
          </p>
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-danger-fg">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={isPending} className="self-start">
          {isPending ? "Import en cours..." : "Importer le document"}
        </Button>
      </form>
    </Card>
  );
}
