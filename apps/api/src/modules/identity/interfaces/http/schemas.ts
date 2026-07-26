import { z } from "zod";

export const RegisterBodySchema = z
  .object({
    email: z.string().trim().min(3).max(320),
    password: z.string().min(8).max(200),
    displayName: z.string().trim().min(1).max(160),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const LoginBodySchema = z
  .object({
    email: z.string().trim().min(1).max(320),
    password: z.string().min(1).max(200),
  })
  .strict();

export type LoginBody = z.infer<typeof LoginBodySchema>;
