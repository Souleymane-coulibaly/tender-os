-- V2 Sprint 7 — Workspace collaboratif. Cinq nouvelles tables additives : participants Tender,
-- tâches, commentaires génériques gouvernés, mentions, demandes de validation, plus une projection
-- de lecture (activité). Aucune ancienne migration modifiée, aucune colonne/table supprimée.

-- CreateTable: tender_participants — source unique de vérité pour "qui peut être
-- assigné/mentionné/reviewer sur ce Tender" (mission §7, §17, §22-23, §29).
CREATE TABLE "tender_participants" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(30) NOT NULL,
    "added_by" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_by" UUID,
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_participants_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tender_participants" ADD CONSTRAINT "tender_participants_role_check"
  CHECK ("role" IN ('TENDER_MANAGER', 'ADMINISTRATIVE_RESPONSIBLE', 'TECHNICAL_WRITER', 'FINANCIAL_RESPONSIBLE', 'REVIEWER', 'SIGNATORY', 'VIEWER'));

CREATE INDEX "tender_participants_organization_id_tender_id_idx" ON "tender_participants"("organization_id", "tender_id");
CREATE INDEX "tender_participants_organization_id_user_id_idx" ON "tender_participants"("organization_id", "user_id");

-- Unicité RÉELLE du participant ACTIF uniquement (index partiel, non exprimable dans le DSL
-- Prisma) : permet un retrait (removed_at renseigné) PUIS un ré-ajout sans violer une contrainte
-- unique classique (mission §49 — l'historique du participant retiré reste intact).
CREATE UNIQUE INDEX "tender_participants_active_unique" ON "tender_participants"("organization_id", "tender_id", "user_id") WHERE "removed_at" IS NULL;

ALTER TABLE "tender_participants" ADD CONSTRAINT "tender_participants_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tender_participants" ADD CONSTRAINT "tender_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: tasks — travail interne collaboratif, distinct de tender_checklist_items (constat de
-- conformité DCE) et de tender_milestones (échéance métier datée), mission §13/§15.
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "lot_id" UUID,
    "checklist_item_id" UUID,
    "document_id" UUID,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'TODO',
    "priority" VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
    "due_date" TIMESTAMP(3),
    "assignee_id" UUID,
    "created_by" UUID NOT NULL,
    "completed_by" UUID,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check"
  CHECK ("status" IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED'));

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priority_check"
  CHECK ("priority" IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT'));

CREATE INDEX "tasks_organization_id_tender_id_idx" ON "tasks"("organization_id", "tender_id");
CREATE INDEX "tasks_organization_id_assignee_id_idx" ON "tasks"("organization_id", "assignee_id");
CREATE INDEX "tasks_organization_id_status_idx" ON "tasks"("organization_id", "status");
CREATE INDEX "tasks_organization_id_due_date_idx" ON "tasks"("organization_id", "due_date");
CREATE INDEX "tasks_organization_id_lot_id_idx" ON "tasks"("organization_id", "lot_id");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AUDIT-007 : FK composée (lotId, organizationId) → TenderLot(id, organizationId) — même motif que
-- tender_checklist_items/tender_requested_documents/tender_award_criteria/tender_milestones.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lot_id_organization_id_fkey" FOREIGN KEY ("lot_id", "organization_id") REFERENCES "tender_lots"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "tender_checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: comments — modèle générique GOUVERNÉ (mission §19), même motif que
-- ai_suggestions.entity_type/entity_id : entity_id reste un pointeur dénormalisé SANS FK stricte
-- (le type de la cible varie), résolu et vérifié applicativement par entity_type avant écriture.
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "entity_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "comments" ADD CONSTRAINT "comments_entity_type_check"
  CHECK ("entity_type" IN ('TENDER', 'TASK', 'CHECKLIST_ITEM'));

CREATE INDEX "comments_organization_id_entity_type_entity_id_idx" ON "comments"("organization_id", "entity_type", "entity_id");
CREATE INDEX "comments_organization_id_tender_id_created_at_idx" ON "comments"("organization_id", "tender_id", "created_at");

ALTER TABLE "comments" ADD CONSTRAINT "comments_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: mentions — référence toujours un utilisateur réel (mission §22), jamais un texte
-- libre "@Jean".
CREATE TABLE "mentions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "comment_id" UUID NOT NULL,
    "mentioned_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mentions_organization_id_mentioned_user_id_idx" ON "mentions"("organization_id", "mentioned_user_id");
CREATE INDEX "mentions_comment_id_idx" ON "mentions"("comment_id");

ALTER TABLE "mentions" ADD CONSTRAINT "mentions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: approval_requests — validation collaborative INTERNE (mission §28, jamais une
-- signature juridique), scopée TASK|CHECKLIST_ITEM uniquement (document/livrable/export gardent
-- final_approvals/deliverable_reviews, jamais dupliqués ici).
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "entity_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_entity_type_check"
  CHECK ("entity_type" IN ('TASK', 'CHECKLIST_ITEM'));

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_status_check"
  CHECK ("status" IN ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'CANCELLED'));

CREATE INDEX "approval_requests_organization_id_tender_id_status_idx" ON "approval_requests"("organization_id", "tender_id", "status");
CREATE INDEX "approval_requests_organization_id_reviewer_id_idx" ON "approval_requests"("organization_id", "reviewer_id");

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: tender_activities — projection de LECTURE utilisateur (mission §32), jamais
-- l'AuditLog technique exposé directement. Peuplée dans la même transaction applicative que
-- l'écriture principale + AuditLog + Outbox de chaque use case collaboratif.
CREATE TABLE "tender_activities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_activities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tender_activities" ADD CONSTRAINT "tender_activities_type_check"
  CHECK ("type" IN ('TENDER_PARTICIPANT_ADDED', 'TENDER_PARTICIPANT_ROLE_CHANGED', 'TENDER_PARTICIPANT_REMOVED', 'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_STATUS_CHANGED', 'TASK_COMPLETED', 'TASK_REOPENED', 'COMMENT_ADDED', 'USER_MENTIONED', 'APPROVAL_REQUESTED', 'APPROVAL_APPROVED', 'APPROVAL_CHANGES_REQUESTED'));

CREATE INDEX "tender_activities_organization_id_tender_id_created_at_idx" ON "tender_activities"("organization_id", "tender_id", "created_at");

ALTER TABLE "tender_activities" ADD CONSTRAINT "tender_activities_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
