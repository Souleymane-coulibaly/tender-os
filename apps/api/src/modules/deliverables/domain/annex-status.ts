export const AnnexStatus = {
  Pending: "PENDING",
  Provided: "PROVIDED",
  Validated: "VALIDATED",
} as const;

export type AnnexStatus = (typeof AnnexStatus)[keyof typeof AnnexStatus];

export function isAnnexStatus(value: string): value is AnnexStatus {
  return Object.values(AnnexStatus).includes(value as AnnexStatus);
}
