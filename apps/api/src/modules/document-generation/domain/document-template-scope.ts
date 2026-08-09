/** Mission §"Scope Template limité à SYSTEM/ORGANIZATION" — Candidate/Client uniquement si un
 *  besoin réel émerge (hors périmètre Sprint 10). */
export const DocumentTemplateScope = {
  System: "SYSTEM",
  Organization: "ORGANIZATION",
} as const;

export type DocumentTemplateScope = (typeof DocumentTemplateScope)[keyof typeof DocumentTemplateScope];

export function isDocumentTemplateScope(value: string): value is DocumentTemplateScope {
  return value === DocumentTemplateScope.System || value === DocumentTemplateScope.Organization;
}
