/** V2 Sprint 7 §31/§51 — catalogue gouverné, aligné sur la contrainte CHECK
 *  `tender_activities_type_check`. Chaque valeur doit avoir une phrase de synthèse dédiée côté
 *  application (`tender-activity-recorder.ts`) — jamais un texte générique/du contenu brut exposé
 *  tel quel (mission §33). */
export const TenderActivityType = {
  ParticipantAdded: "TENDER_PARTICIPANT_ADDED",
  ParticipantRoleChanged: "TENDER_PARTICIPANT_ROLE_CHANGED",
  ParticipantRemoved: "TENDER_PARTICIPANT_REMOVED",
  TaskCreated: "TASK_CREATED",
  TaskAssigned: "TASK_ASSIGNED",
  TaskStatusChanged: "TASK_STATUS_CHANGED",
  TaskCompleted: "TASK_COMPLETED",
  TaskReopened: "TASK_REOPENED",
  CommentAdded: "COMMENT_ADDED",
  UserMentioned: "USER_MENTIONED",
  ApprovalRequested: "APPROVAL_REQUESTED",
  ApprovalApproved: "APPROVAL_APPROVED",
  ApprovalChangesRequested: "APPROVAL_CHANGES_REQUESTED",
} as const;
export type TenderActivityType = (typeof TenderActivityType)[keyof typeof TenderActivityType];
