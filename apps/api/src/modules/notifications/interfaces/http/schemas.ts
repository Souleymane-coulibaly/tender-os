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

/** Checkpoint TENDEROS-2.1-P2.3-E11 — le use case revalide de toute façon `isNotificationCategory`
 *  (`InvalidNotificationCategoryError`, jamais dupliqué ici) ; ce schéma se limite à la forme HTTP. */
export const CategoryParamSchema = z.string().min(1).max(40);

export const UpdateNotificationPreferenceBodySchema = z.object({ emailEnabled: z.boolean() }).strict();
export type UpdateNotificationPreferenceBody = z.infer<typeof UpdateNotificationPreferenceBodySchema>;
