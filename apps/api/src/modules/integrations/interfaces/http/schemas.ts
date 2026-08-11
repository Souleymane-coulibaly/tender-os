import { z } from "zod";
import { API_KEY_SCOPES } from "../../domain/enums";
import { GOVERNED_WEBHOOK_EVENT_TYPES } from "../../domain/event-catalog";

export const IdParamSchema = z.string().uuid();

export const CreateApiKeyBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    scopes: z.array(z.enum(API_KEY_SCOPES as unknown as [string, ...string[]])).min(1),
    allowedClientAccountIds: z.array(z.string().uuid()).optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();
export type CreateApiKeyBody = z.infer<typeof CreateApiKeyBodySchema>;

export const CreateWebhookSubscriptionBodySchema = z
  .object({
    endpointUrl: z.string().trim().min(1).max(2048),
    description: z.string().trim().max(300).optional(),
    events: z.array(z.enum(GOVERNED_WEBHOOK_EVENT_TYPES as unknown as [string, ...string[]])).min(1),
    allowedClientAccountIds: z.array(z.string().uuid()).optional(),
  })
  .strict();
export type CreateWebhookSubscriptionBody = z.infer<typeof CreateWebhookSubscriptionBodySchema>;

export const UpdateWebhookSubscriptionBodySchema = z
  .object({
    endpointUrl: z.string().trim().min(1).max(2048).optional(),
    description: z.string().trim().max(300).optional(),
    events: z.array(z.enum(GOVERNED_WEBHOOK_EVENT_TYPES as unknown as [string, ...string[]])).min(1).optional(),
    allowedClientAccountIds: z.array(z.string().uuid()).optional(),
  })
  .strict();
export type UpdateWebhookSubscriptionBody = z.infer<typeof UpdateWebhookSubscriptionBodySchema>;

export const SetWebhookStatusBodySchema = z.object({ enabled: z.boolean() }).strict();
export type SetWebhookStatusBody = z.infer<typeof SetWebhookStatusBodySchema>;

export const ListDeliveriesQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();
export type ListDeliveriesQuery = z.infer<typeof ListDeliveriesQuerySchema>;

export const PublicListTendersQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: z.string().optional(),
    clientId: z.string().uuid().optional(),
    updatedSince: z.string().datetime().optional(),
  })
  .strict();
export type PublicListTendersQuery = z.infer<typeof PublicListTendersQuerySchema>;
