/** Catégorie d'une clause contractuelle (mission Sprint 4.2 §5 "Clauses contractuelles"). */
export const ClauseCategory = {
  Penalty: "PENALTY",
  Warranty: "WARRANTY",
  Insurance: "INSURANCE",
  Deadline: "DEADLINE",
  Confidentiality: "CONFIDENTIALITY",
  Ip: "IP",
  Security: "SECURITY",
  Cybersecurity: "CYBERSECURITY",
  Reversibility: "REVERSIBILITY",
  Subcontracting: "SUBCONTRACTING",
  Consortium: "CONSORTIUM",
  AdvancePayment: "ADVANCE_PAYMENT",
  RetentionGuarantee: "RETENTION_GUARANTEE",
  Payment: "PAYMENT",
  Invoicing: "INVOICING",
  Termination: "TERMINATION",
  Renewal: "RENEWAL",
  Liability: "LIABILITY",
  Gdpr: "GDPR",
  Hosting: "HOSTING",
  EnvironmentalSocial: "ENVIRONMENTAL_SOCIAL",
  Other: "OTHER",
} as const;

export type ClauseCategory = (typeof ClauseCategory)[keyof typeof ClauseCategory];

export function isClauseCategory(value: string): value is ClauseCategory {
  return Object.values(ClauseCategory).includes(value as ClauseCategory);
}
