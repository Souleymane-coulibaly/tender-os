"use client";

import { useActionState } from "react";
import { createDocumentAction, type FormActionState } from "../../../documents-actions";
import {
  DOCUMENT_CATEGORY_SUGGESTIONS,
  DOCUMENT_DOMAIN_LABELS,
  DOCUMENT_ORIGIN_LABELS,
} from "../../../../../lib/documents-types";
import { Button, Card, FieldWrapper, FileInput, Input, Select, Textarea } from "../../../../../components/ui";

const INITIAL_STATE: FormActionState = {};

export function CreateDocumentForm() {
  const [state, formAction, isPending] = useActionState(createDocumentAction, INITIAL_STATE);

  return (
    <Card>
      <form action={formAction} className="flex max-w-xl flex-col gap-4">
        {/* `FieldWrapper` + contrôle nu plutôt que `label required` : le libellé visible et le nom
            accessible restent exactement « Titre * » (le composant ajouterait son propre astérisque). */}
        <FieldWrapper label="Titre *">
          <Input id="title" name="title" type="text" required />
        </FieldWrapper>

        <Textarea label="Description" id="description" name="description" rows={2} />

        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label="Origine *">
            <Select id="origin" name="origin" required defaultValue="USER_UPLOAD">
              {Object.entries(DOCUMENT_ORIGIN_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FieldWrapper>
          <FieldWrapper label="Domaine *">
            <Select id="domain" name="domain" required defaultValue="ORGANIZATION">
              {Object.entries(DOCUMENT_DOMAIN_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FieldWrapper>
        </div>

        <div className="flex flex-col gap-1.5">
          <Input
            label="Catégorie"
            id="category"
            name="category"
            type="text"
            list="category-suggestions"
            placeholder="RC, CCTP, KBIS..."
            hint="Liste indicative — vous pouvez saisir une valeur libre."
          />
          <datalist id="category-suggestions">
            {DOCUMENT_CATEGORY_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>

        {/* `FileInput` rend déjà son propre `<label>` : le libellé reste un `<label htmlFor>` séparé
            (jamais un label imbriqué dans un autre). */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="file" className="text-sm font-medium text-tenderos-navy">
            Fichier *
          </label>
          <FileInput id="file" name="file" required />
          <p className="text-xs text-tenderos-slate">Formats acceptes : PDF, Word, Excel, CSV, texte, PNG, JPEG.</p>
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-danger-fg">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={isPending} className="self-start">
          {isPending ? "Dépôt en cours..." : "Déposer le document"}
        </Button>
      </form>
    </Card>
  );
}
