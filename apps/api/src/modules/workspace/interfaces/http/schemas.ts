import { z } from "zod";

export const IdParamSchema = z.string().uuid();

export const TENDER_COLLABORATIVE_ROLES = [
  "TENDER_MANAGER",
  "ADMINISTRATIVE_RESPONSIBLE",
  "TECHNICAL_WRITER",
  "FINANCIAL_RESPONSIBLE",
  "REVIEWER",
  "SIGNATORY",
  "VIEWER",
] as const;

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE", "CANCELLED"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const COMMENT_ENTITY_TYPES = ["TENDER", "TASK", "CHECKLIST_ITEM"] as const;
export const APPROVAL_ENTITY_TYPES = ["TASK", "CHECKLIST_ITEM"] as const;

export const AddTenderParticipantBodySchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(TENDER_COLLABORATIVE_ROLES),
  justification: z.string().max(1000).optional(),
});
export type AddTenderParticipantBody = z.infer<typeof AddTenderParticipantBodySchema>;

export const ChangeTenderParticipantRoleBodySchema = z.object({
  role: z.enum(TENDER_COLLABORATIVE_ROLES),
});
export type ChangeTenderParticipantRoleBody = z.infer<typeof ChangeTenderParticipantRoleBodySchema>;

export const CreateTaskBodySchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: z.string().datetime().optional(),
  lotId: z.string().uuid().optional(),
  checklistItemId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
});
export type CreateTaskBody = z.infer<typeof CreateTaskBodySchema>;

export const UpdateTaskBodySchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: z.string().datetime().optional(),
  lotId: z.string().uuid().nullable().optional(),
});
export type UpdateTaskBody = z.infer<typeof UpdateTaskBodySchema>;

export const AssignTaskBodySchema = z.object({
  assigneeId: z.string().uuid().optional(),
});
export type AssignTaskBody = z.infer<typeof AssignTaskBodySchema>;

export const ChangeTaskStatusBodySchema = z.object({
  status: z.enum(TASK_STATUSES),
});
export type ChangeTaskStatusBody = z.infer<typeof ChangeTaskStatusBodySchema>;

export const ListTasksQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.string().uuid().optional(),
  lotId: z.string().uuid().optional(),
  checklistItemId: z.string().uuid().optional(),
  overdueOnly: z.coerce.boolean().optional(),
});
export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;

export const MyTasksQuerySchema = ListTasksQuerySchema;
export type MyTasksQuery = z.infer<typeof MyTasksQuerySchema>;

export const CreateCommentBodySchema = z.object({
  entityType: z.enum(COMMENT_ENTITY_TYPES),
  entityId: z.string().uuid(),
  body: z.string().min(1).max(10000),
  mentionedUserIds: z.array(z.string().uuid()).max(50).optional(),
});
export type CreateCommentBody = z.infer<typeof CreateCommentBodySchema>;

export const EditCommentBodySchema = z.object({
  body: z.string().min(1).max(10000),
});
export type EditCommentBody = z.infer<typeof EditCommentBodySchema>;

export const ListCommentsQuerySchema = z.object({
  entityType: z.enum(COMMENT_ENTITY_TYPES).optional(),
  entityId: z.string().uuid().optional(),
});
export type ListCommentsQuery = z.infer<typeof ListCommentsQuerySchema>;

export const RequestApprovalBodySchema = z.object({
  entityType: z.enum(APPROVAL_ENTITY_TYPES),
  entityId: z.string().uuid(),
  reviewerId: z.string().uuid(),
  comment: z.string().max(2000).optional(),
});
export type RequestApprovalBody = z.infer<typeof RequestApprovalBodySchema>;

export const ReviewApprovalBodySchema = z.object({
  comment: z.string().max(2000).optional(),
});
export type ReviewApprovalBody = z.infer<typeof ReviewApprovalBodySchema>;

export const ActivityQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ActivityQuery = z.infer<typeof ActivityQuerySchema>;
