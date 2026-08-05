/** Sprint 9 — mission §16, taxonomie contrôlée d'un rejet/échec technique de dépôt. */
export const SubmissionRejectionCategory = {
  FileRejected: "FILE_REJECTED",
  SizeExceeded: "SIZE_EXCEEDED",
  InvalidFormat: "INVALID_FORMAT",
  Antivirus: "ANTIVIRUS",
  SignatureRejected: "SIGNATURE_REJECTED",
  SessionExpired: "SESSION_EXPIRED",
  Other: "OTHER",
} as const;

export type SubmissionRejectionCategory = (typeof SubmissionRejectionCategory)[keyof typeof SubmissionRejectionCategory];

export function isSubmissionRejectionCategory(value: string): value is SubmissionRejectionCategory {
  return Object.values(SubmissionRejectionCategory).includes(value as SubmissionRejectionCategory);
}
