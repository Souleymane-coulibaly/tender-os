"use client";

import { useActionState } from "react";
import { Button, Input, Select } from "../../../../../../components/ui";
import { createPromptTemplateAction, type FormActionState } from "../../../../generation-actions";
import { GENERATION_TASK_TYPE_LABELS } from "../../../../../../lib/generation-types";

const INITIAL_STATE: FormActionState = {};

export function CreatePromptTemplateForm() {
  const [state, formAction, isPending] = useActionState(createPromptTemplateAction, INITIAL_STATE);
  const taskTypes = Object.entries(GENERATION_TASK_TYPE_LABELS);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <Select label="Type de tâche" id="taskType" name="taskType" required>
        {taskTypes.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>

      <Input label="Nom" id="name" name="name" type="text" required maxLength={200} />

      <Select label="Mode de sortie" id="outputMode" name="outputMode" required>
        <option value="FREE_TEXT">Texte libre</option>
        <option value="STRUCTURED">Structuré (JSON validé)</option>
      </Select>

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
