/** Sprint 9 — mission §12, types de preuve de dépôt possibles. */
export const SubmissionProofType = {
  Receipt: "RECEIPT",
  Acknowledgement: "ACKNOWLEDGEMENT",
  Screenshot: "SCREENSHOT",
  PlatformConfirmation: "PLATFORM_CONFIRMATION",
  Other: "OTHER",
} as const;

export type SubmissionProofType = (typeof SubmissionProofType)[keyof typeof SubmissionProofType];

export function isSubmissionProofType(value: string): value is SubmissionProofType {
  return Object.values(SubmissionProofType).includes(value as SubmissionProofType);
}
