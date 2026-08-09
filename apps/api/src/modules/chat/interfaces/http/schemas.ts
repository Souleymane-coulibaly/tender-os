import { z } from "zod";

export const IdParamSchema = z.string().uuid();

export const CreateConversationBodySchema = z.object({
  lotId: z.string().uuid().optional(),
  title: z.string().min(1).max(300).optional(),
});
export type CreateConversationBody = z.infer<typeof CreateConversationBodySchema>;

export const ListConversationsQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional(),
});
export type ListConversationsQuery = z.infer<typeof ListConversationsQuerySchema>;

export const SendMessageBodySchema = z.object({
  content: z.string().min(1).max(4000),
});
export type SendMessageBody = z.infer<typeof SendMessageBodySchema>;
