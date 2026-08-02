import { z } from "zod";

export const IdParamSchema = z.string().uuid();

export const RunFinalValidationBodySchema = z.object({ exportJobId: z.string().uuid() }).strict();
export type RunFinalValidationBody = z.infer<typeof RunFinalValidationBodySchema>;

export const ResolveIssueBodySchema = z.object({ resolutionNote: z.string().min(1).max(2000) }).strict();
export type ResolveIssueBody = z.infer<typeof ResolveIssueBodySchema>;

export const ApproveFinalVersionBodySchema = z.object({ validationRunId: z.string().uuid(), comment: z.string().max(2000).optional() }).strict();
export type ApproveFinalVersionBody = z.infer<typeof ApproveFinalVersionBodySchema>;

export const ReopenFinalVersionBodySchema = z.object({ reason: z.string().min(1).max(2000) }).strict();
export type ReopenFinalVersionBody = z.infer<typeof ReopenFinalVersionBodySchema>;
