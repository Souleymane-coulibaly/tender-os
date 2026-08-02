import { z } from "zod";
import { SignatureLevel } from "../../domain/signature-level";

export const IdParamSchema = z.string().uuid();

const LevelSchema = z.enum([SignatureLevel.Level0, SignatureLevel.Level1, SignatureLevel.Level2, SignatureLevel.Level3, SignatureLevel.Level4]);

export const DetectSignatureRequirementBodySchema = z
  .object({
    documentRef: z.string().min(1).max(200),
    sourceDce: z.string().max(300).optional(),
    pageOrSection: z.string().max(100).optional(),
    mandatory: z.boolean(),
    momentText: z.string().max(2000).optional(),
    format: z.string().max(40).optional(),
    levelExpected: LevelSchema.optional(),
    certificateRequirement: z.string().max(2000).optional(),
    signatoryExpected: z.string().max(200).optional(),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  })
  .strict();
export type DetectSignatureRequirementBody = z.infer<typeof DetectSignatureRequirementBodySchema>;

export const ConfirmRejectRequirementBodySchema = z.object({ comment: z.string().max(2000).optional() }).strict();
export type ConfirmRejectRequirementBody = z.infer<typeof ConfirmRejectRequirementBodySchema>;

export const RegisterSignatoryBodySchema = z
  .object({
    userId: z.string().uuid().optional(),
    firstName: z.string().min(1).max(120),
    lastName: z.string().min(1).max(120),
    professionalEmail: z.string().email().max(320),
    jobTitle: z.string().max(150).optional(),
    organizationName: z.string().max(200).optional(),
    authorityText: z.string().max(2000).optional(),
    authorityDocumentId: z.string().uuid().optional(),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
  })
  .strict();
export type RegisterSignatoryBody = z.infer<typeof RegisterSignatoryBodySchema>;

export const VerifySignatoryBodySchema = z.object({ approved: z.boolean() }).strict();
export type VerifySignatoryBody = z.infer<typeof VerifySignatoryBodySchema>;

export const PrepareSignatureRequestBodySchema = z
  .object({
    signatoryIds: z.array(z.string().uuid()).min(1).max(50),
    requestedLevel: LevelSchema.optional(),
  })
  .strict();
export type PrepareSignatureRequestBody = z.infer<typeof PrepareSignatureRequestBodySchema>;

export const StartSignatureTransactionBodySchema = z.object({ returnUrl: z.string().url().max(2048) }).strict();
export type StartSignatureTransactionBody = z.infer<typeof StartSignatureTransactionBodySchema>;

