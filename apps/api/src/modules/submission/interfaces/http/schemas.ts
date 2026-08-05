import { z } from "zod";
import { SubmissionPlatform } from "../../domain/submission-platform";
import { SubmissionProofType } from "../../domain/submission-proof-type";
import { SubmissionRejectionCategory } from "../../domain/submission-rejection-category";

export const IdParamSchema = z.string().uuid();

const PLATFORM_VALUES = Object.values(SubmissionPlatform) as [SubmissionPlatform, ...SubmissionPlatform[]];
const PROOF_TYPE_VALUES = Object.values(SubmissionProofType) as [SubmissionProofType, ...SubmissionProofType[]];
const REJECTION_CATEGORY_VALUES = Object.values(SubmissionRejectionCategory) as [SubmissionRejectionCategory, ...SubmissionRejectionCategory[]];

export const StartTenderSubmissionBodySchema = z
  .object({
    packageId: z.string().uuid(),
    platform: z.enum(PLATFORM_VALUES),
    customPlatformName: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type StartTenderSubmissionBody = z.infer<typeof StartTenderSubmissionBodySchema>;

export const RecordTenderSubmissionBodySchema = z
  .object({
    packageId: z.string().uuid(),
    platform: z.enum(PLATFORM_VALUES),
    customPlatformName: z.string().trim().min(1).max(200).optional(),
    submittedAt: z.coerce.date(),
    platformReference: z.string().trim().min(1).max(300).optional(),
    receiptReference: z.string().trim().min(1).max(300).optional(),
    notes: z.string().trim().min(1).max(5000).optional(),
  })
  .strict();
export type RecordTenderSubmissionBody = z.infer<typeof RecordTenderSubmissionBodySchema>;

export const ReplaceTenderSubmissionBodySchema = RecordTenderSubmissionBodySchema;
export type ReplaceTenderSubmissionBody = z.infer<typeof ReplaceTenderSubmissionBodySchema>;

export const AddSubmissionProofBodySchema = z
  .object({
    documentId: z.string().uuid(),
    proofType: z.enum(PROOF_TYPE_VALUES),
  })
  .strict();
export type AddSubmissionProofBody = z.infer<typeof AddSubmissionProofBodySchema>;

export const ConfirmSubmissionReceiptBodySchema = z
  .object({
    receiptReference: z.string().trim().min(1).max(300).optional(),
    confirmedWithoutEvidence: z.boolean().optional(),
  })
  .strict();
export type ConfirmSubmissionReceiptBody = z.infer<typeof ConfirmSubmissionReceiptBodySchema>;

export const WithdrawTenderSubmissionBodySchema = z
  .object({
    withdrawalReason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type WithdrawTenderSubmissionBody = z.infer<typeof WithdrawTenderSubmissionBodySchema>;

export const CancelTenderSubmissionBodySchema = z
  .object({
    cancellationReason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type CancelTenderSubmissionBody = z.infer<typeof CancelTenderSubmissionBodySchema>;

export const RecordSubmissionRejectionBodySchema = z
  .object({
    rejectionCategory: z.enum(REJECTION_CATEGORY_VALUES),
    rejectionDescription: z.string().trim().min(1).max(2000),
  })
  .strict();
export type RecordSubmissionRejectionBody = z.infer<typeof RecordSubmissionRejectionBodySchema>;
