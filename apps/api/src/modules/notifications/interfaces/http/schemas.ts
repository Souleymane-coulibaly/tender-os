import { z } from "zod";

export const IdParamSchema = z.string().uuid();

export const ListNotificationsQuerySchema = z
  .object({
    unreadOnly: z.coerce.boolean().optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;
