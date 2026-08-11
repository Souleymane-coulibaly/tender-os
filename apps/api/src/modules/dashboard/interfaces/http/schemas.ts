import { z } from "zod";

export const DashboardQuerySchema = z
  .object({
    clientId: z.string().uuid().optional(),
    periodDays: z.coerce.number().int().refine((value) => [7, 30, 90].includes(value), { message: "periodDays must be 7, 30 or 90" }).optional(),
  })
  .strict();
export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;
