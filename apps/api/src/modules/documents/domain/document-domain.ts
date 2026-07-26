import { InvalidDocumentDomainError } from "./errors";

/**
 * Classification large du document (conception validée §V.5) — délibérément limitée à 5
 * valeurs génériques. La classification métier fine (RC, CCAP, CCTP, KBIS, CV...) est
 * portée par `Document.category` (chaîne libre, suggestions côté frontend uniquement),
 * jamais par cette énumération.
 */
export const DocumentDomain = {
  Tender: "TENDER",
  Organization: "ORGANIZATION",
  Knowledge: "KNOWLEDGE",
  Template: "TEMPLATE",
  Generated: "GENERATED",
} as const;

export type DocumentDomain = (typeof DocumentDomain)[keyof typeof DocumentDomain];

export function isDocumentDomain(value: string): value is DocumentDomain {
  return Object.values(DocumentDomain).includes(value as DocumentDomain);
}

export function parseDocumentDomain(value: string): DocumentDomain {
  if (!isDocumentDomain(value)) {
    throw new InvalidDocumentDomainError(value);
  }
  return value;
}
