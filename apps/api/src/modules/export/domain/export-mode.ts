/** Mission Sprint 8A §21/§22 — un APERÇU n'approuve jamais, ne verrouille jamais, ne démarre
 *  jamais de signature ; seul un export FINAL peut alimenter Validation/Signature/Package. */
export const ExportMode = {
  Preview: "PREVIEW",
  Final: "FINAL",
} as const;

export type ExportMode = (typeof ExportMode)[keyof typeof ExportMode];
