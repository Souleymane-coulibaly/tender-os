import { z } from "zod";

export const OrganizationIdParamSchema = z.string().uuid();

const settingsSchema = z.record(z.string(), z.unknown());

export const CreateOrganizationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().min(1).max(120),
    legalName: z.string().trim().min(1).max(240).optional(),
    registrationNumber: z.string().trim().min(1).max(100).optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .optional(),
    defaultCurrency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .optional(),
    defaultTimezone: z.string().trim().min(1).max(80),
    settings: settingsSchema.optional(),
  })
  .strict();

export type CreateOrganizationBody = z.infer<typeof CreateOrganizationBodySchema>;

export const UpdateOrganizationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    legalName: z.string().trim().min(1).max(240).optional(),
    registrationNumber: z.string().trim().min(1).max(100).optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .optional(),
    defaultCurrency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .optional(),
    defaultTimezone: z.string().trim().min(1).max(80).optional(),
    settings: settingsSchema.optional(),
  })
  .strict();

export type UpdateOrganizationBody = z.infer<typeof UpdateOrganizationBodySchema>;
