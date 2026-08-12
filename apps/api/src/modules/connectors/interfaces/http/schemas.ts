import { z } from "zod";
import { ConnectorProvider } from "../../domain/enums";

const PROVIDER_VALUES = Object.values(ConnectorProvider) as [string, ...string[]];

export const IdParamSchema = z.string().uuid();
export const ProviderParamSchema = z.enum(PROVIDER_VALUES);

export const InitiateConnectionBodySchema = z
  .object({
    provider: z.enum(PROVIDER_VALUES),
    name: z.string().trim().min(1).max(160),
    allowedClientAccountIds: z.array(z.string().uuid()).optional(),
  })
  .strict();
export type InitiateConnectionBody = z.infer<typeof InitiateConnectionBodySchema>;

export const OAuthCallbackQuerySchema = z
  .object({
    state: z.string().min(1).max(200),
    code: z.string().min(1).max(2000).optional(),
    error: z.string().max(200).optional(),
  })
  .passthrough();
export type OAuthCallbackQuery = z.infer<typeof OAuthCallbackQuerySchema>;

export const BrowseFolderQuerySchema = z
  .object({
    containerId: z.string().trim().min(1).max(300).optional(),
    folderId: z.string().trim().min(1).max(300).optional(),
    clientAccountId: z.string().uuid().optional(),
  })
  .strict();
export type BrowseFolderQuery = z.infer<typeof BrowseFolderQuerySchema>;

export const ImportFileBodySchema = z
  .object({
    containerId: z.string().trim().min(1).max(300),
    fileId: z.string().trim().min(1).max(300),
    mimeType: z.string().trim().min(1).max(200),
    clientAccountId: z.string().uuid().optional(),
    tenderId: z.string().uuid().optional(),
    targetDocumentId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(300).optional(),
  })
  .strict();
export type ImportFileBody = z.infer<typeof ImportFileBodySchema>;

export const ExportVersionBodySchema = z
  .object({
    containerId: z.string().trim().min(1).max(300),
    folderId: z.string().trim().min(1).max(300),
    documentId: z.string().uuid(),
    versionId: z.string().uuid(),
    clientAccountId: z.string().uuid().optional(),
    filename: z.string().trim().min(1).max(300).optional(),
  })
  .strict();
export type ExportVersionBody = z.infer<typeof ExportVersionBodySchema>;

export const CreateCalendarEventBodySchema = z.object({ tenderId: z.string().uuid() }).strict();
export type CreateCalendarEventBody = z.infer<typeof CreateCalendarEventBodySchema>;
