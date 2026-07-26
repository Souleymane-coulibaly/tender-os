-- CreateTable
CREATE TABLE "tenders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "reference" VARCHAR(255),
    "buyer_name" VARCHAR(300),
    "description" TEXT,
    "publication_date" TIMESTAMP(3),
    "submission_deadline" TIMESTAMP(3),
    "procedure_type" VARCHAR(80),
    "market_type" VARCHAR(80),
    "estimated_amount" DECIMAL(19,4),
    "currency" CHAR(3),
    "internal_owner_id" UUID,
    "status" VARCHAR(40) NOT NULL,
    "tags" TEXT[],
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_lots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "lot_number" VARCHAR(80) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "estimated_amount" DECIMAL(19,4),
    "currency" CHAR(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_checklist_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(30) NOT NULL,
    "assigned_to" UUID,
    "due_date" TIMESTAMP(3),
    "comment" TEXT,
    "completed_at" TIMESTAMP(3),
    "completed_by" UUID,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_award_criteria" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "weight" DECIMAL(5,2) NOT NULL,
    "parent_criterion_id" UUID,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_award_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_requested_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "category" VARCHAR(100),
    "document_type" VARCHAR(100),
    "required" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "expiration_date" TIMESTAMP(3),
    "status" VARCHAR(30) NOT NULL,
    "document_id" UUID,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_requested_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_milestones" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "responsible_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_risks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "severity" VARCHAR(20) NOT NULL,
    "source" VARCHAR(120),
    "status" VARCHAR(20) NOT NULL,
    "mitigation" TEXT,
    "assigned_to" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_alerts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "source" VARCHAR(120),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_status_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "previous_status" VARCHAR(40),
    "new_status" VARCHAR(40) NOT NULL,
    "reason" TEXT,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenders_organization_id_status_idx" ON "tenders"("organization_id", "status");

-- CreateIndex
CREATE INDEX "tenders_organization_id_submission_deadline_idx" ON "tenders"("organization_id", "submission_deadline");

-- CreateIndex
CREATE INDEX "tenders_organization_id_created_at_idx" ON "tenders"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "tender_lots_organization_id_tender_id_idx" ON "tender_lots"("organization_id", "tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "tender_lots_tender_id_lot_number_key" ON "tender_lots"("tender_id", "lot_number");

-- CreateIndex
CREATE INDEX "tender_checklist_items_organization_id_tender_id_display_or_idx" ON "tender_checklist_items"("organization_id", "tender_id", "display_order");

-- CreateIndex
CREATE INDEX "tender_award_criteria_organization_id_tender_id_display_ord_idx" ON "tender_award_criteria"("organization_id", "tender_id", "display_order");

-- CreateIndex
CREATE INDEX "tender_requested_documents_organization_id_tender_id_displa_idx" ON "tender_requested_documents"("organization_id", "tender_id", "display_order");

-- CreateIndex
CREATE INDEX "tender_milestones_organization_id_tender_id_date_idx" ON "tender_milestones"("organization_id", "tender_id", "date");

-- CreateIndex
CREATE INDEX "tender_risks_organization_id_tender_id_status_idx" ON "tender_risks"("organization_id", "tender_id", "status");

-- CreateIndex
CREATE INDEX "tender_alerts_organization_id_tender_id_resolved_idx" ON "tender_alerts"("organization_id", "tender_id", "resolved");

-- CreateIndex
CREATE INDEX "tender_status_history_organization_id_tender_id_changed_at_idx" ON "tender_status_history"("organization_id", "tender_id", "changed_at");

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_lots" ADD CONSTRAINT "tender_lots_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_checklist_items" ADD CONSTRAINT "tender_checklist_items_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_award_criteria" ADD CONSTRAINT "tender_award_criteria_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_requested_documents" ADD CONSTRAINT "tender_requested_documents_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_milestones" ADD CONSTRAINT "tender_milestones_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_risks" ADD CONSTRAINT "tender_risks_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_alerts" ADD CONSTRAINT "tender_alerts_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_status_history" ADD CONSTRAINT "tender_status_history_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
