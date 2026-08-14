import { z } from "zod";

export const SubmitDemoRequestBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    email: z.string().trim().min(3).max(320).email(),
    company: z.string().trim().min(1).max(200),
    phone: z.string().trim().max(40).optional(),
    message: z.string().trim().max(2000).optional(),
    // Champ honeypot — jamais rempli par un humain (masqué CSS), voir le use case.
    website: z.string().trim().max(200).optional(),
  })
  .strict();

export type SubmitDemoRequestBody = z.infer<typeof SubmitDemoRequestBodySchema>;
