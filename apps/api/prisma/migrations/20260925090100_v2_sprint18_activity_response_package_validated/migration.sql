-- Correctif additif — `RESPONSE_PACKAGE_VALIDATED` ajouté au catalogue TenderActivity (mission
-- §22 "package validé doit alimenter TenderActivity"), écrit par `response-package` via son propre
-- `TenderActivityWriter` local (jamais un import du module `workspace`).
ALTER TABLE "tender_activities" DROP CONSTRAINT "tender_activities_type_check";
ALTER TABLE "tender_activities" ADD CONSTRAINT "tender_activities_type_check"
  CHECK ("type" IN ('TENDER_PARTICIPANT_ADDED', 'TENDER_PARTICIPANT_ROLE_CHANGED', 'TENDER_PARTICIPANT_REMOVED', 'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_STATUS_CHANGED', 'TASK_COMPLETED', 'TASK_REOPENED', 'COMMENT_ADDED', 'USER_MENTIONED', 'APPROVAL_REQUESTED', 'APPROVAL_APPROVED', 'APPROVAL_CHANGES_REQUESTED', 'APPROVAL_REJECTED', 'RESPONSE_PACKAGE_VALIDATED'));
