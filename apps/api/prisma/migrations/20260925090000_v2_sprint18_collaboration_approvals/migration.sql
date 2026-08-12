-- V2 Sprint 18 (Collaboration avancée & validations finales) — enrichit le socle Workspace
-- (Sprint 7) existant, jamais un second système de commentaires/approbations.

-- ApprovalRequest.entityType élargi à trois cibles documentaires immuables (mission §24-31,
-- décision AskUserQuestion "étendre ApprovalRequest plutôt que retrofiter FinalApproval"). Colonne
-- élargie à VARCHAR(40) : "TECHNICAL_MEMO_SECTION_REVISION" (32 caractères) dépasse VARCHAR(20).
ALTER TABLE "approval_requests" ALTER COLUMN "entity_type" TYPE VARCHAR(40);

ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_entity_type_check";
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_entity_type_check"
  CHECK ("entity_type" IN ('TASK', 'CHECKLIST_ITEM', 'TECHNICAL_MEMO_SECTION_REVISION', 'PRICING_SCHEDULE_VERSION', 'RESPONSE_PACKAGE_VERSION'));

-- REJECTED ajouté comme second statut terminal (mission §27/§34, décision AskUserQuestion) —
-- refus définitif avec raison obligatoire, distinct de CHANGES_REQUESTED ("à corriger").
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_status_check";
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_status_check"
  CHECK ("status" IN ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'CANCELLED'));

-- Comment.entityType élargi à LOT (mission §7). TechnicalMemo section / Pricing version /
-- ResponsePackage restent hors périmètre ce sprint (résolveur cross-module différé, voir rapport).
ALTER TABLE "comments" DROP CONSTRAINT "comments_entity_type_check";
ALTER TABLE "comments" ADD CONSTRAINT "comments_entity_type_check"
  CHECK ("entity_type" IN ('TENDER', 'TASK', 'CHECKLIST_ITEM', 'LOT'));

-- TenderActivity.type élargi à APPROVAL_REJECTED (miroir du nouveau statut ApprovalRequest).
ALTER TABLE "tender_activities" DROP CONSTRAINT "tender_activities_type_check";
ALTER TABLE "tender_activities" ADD CONSTRAINT "tender_activities_type_check"
  CHECK ("type" IN ('TENDER_PARTICIPANT_ADDED', 'TENDER_PARTICIPANT_ROLE_CHANGED', 'TENDER_PARTICIPANT_REMOVED', 'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_STATUS_CHANGED', 'TASK_COMPLETED', 'TASK_REOPENED', 'COMMENT_ADDED', 'USER_MENTIONED', 'APPROVAL_REQUESTED', 'APPROVAL_APPROVED', 'APPROVAL_CHANGES_REQUESTED', 'APPROVAL_REJECTED'));
