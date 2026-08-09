import { isFieldType, type FieldType } from "./field-type";

/** Une ligne de Field Mapping — GÉNÉRIQUE (mission "ne doit explicitement pas contenir de logique
 *  métier DC1/DC2/DC4/ATTRI1") : décrit uniquement la transformation d'affichage d'un placeholder
 *  détecté dans le template, jamais sa provenance métier. Aucun `defaultValue` (mission "jamais
 *  inventer une valeur manquante"). */
export type DocumentTemplateFieldMapping = Readonly<{
  fieldKey: string;
  label: string;
  fieldType: FieldType;
  required: boolean;
  formatOptions?: Record<string, unknown> | undefined;
}>;

const MAX_FIELD_KEY_LENGTH = 150;
const MAX_LABEL_LENGTH = 200;

export function validateFieldMapping(input: unknown): DocumentTemplateFieldMapping {
  if (typeof input !== "object" || input === null) {
    throw new Error("Field mapping must be an object.");
  }
  const candidate = input as Record<string, unknown>;

  const fieldKey = typeof candidate.fieldKey === "string" ? candidate.fieldKey.trim() : "";
  if (!fieldKey || fieldKey.length > MAX_FIELD_KEY_LENGTH) {
    throw new Error(`fieldKey must be between 1 and ${MAX_FIELD_KEY_LENGTH} characters.`);
  }

  const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
  if (!label || label.length > MAX_LABEL_LENGTH) {
    throw new Error(`label must be between 1 and ${MAX_LABEL_LENGTH} characters.`);
  }

  if (typeof candidate.fieldType !== "string" || !isFieldType(candidate.fieldType)) {
    throw new Error(`fieldType must be one of the known FieldType values, got: ${String(candidate.fieldType)}`);
  }

  const required = candidate.required === true;

  const formatOptions =
    candidate.formatOptions !== undefined && candidate.formatOptions !== null
      ? (candidate.formatOptions as Record<string, unknown>)
      : undefined;

  return { fieldKey, label, fieldType: candidate.fieldType, required, formatOptions };
}
