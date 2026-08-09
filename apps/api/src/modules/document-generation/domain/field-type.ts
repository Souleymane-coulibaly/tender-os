/** Transformation déclarative appliquée à la valeur d'un placeholder (mission "transformations
 *  déclaratives centralisées") — jamais une provenance métier, voir `DocumentTemplateFieldMapping`. */
export const FieldType = {
  String: "STRING",
  Date: "DATE",
  Currency: "CURRENCY",
  Percentage: "PERCENTAGE",
  Boolean: "BOOLEAN",
  Checkbox: "CHECKBOX",
  Multiline: "MULTILINE",
  List: "LIST",
  Table: "TABLE",
} as const;

export type FieldType = (typeof FieldType)[keyof typeof FieldType];

export function isFieldType(value: string): value is FieldType {
  return (Object.values(FieldType) as string[]).includes(value);
}
