-- V2 Sprint 1 — Socle métier et fondations transverses : Outbox transactionnelle
-- (OutboxEvent/ProcessedEvent/DeadLetterEvent) + socle générique de suggestion IA (AiSuggestion).
-- Migration additive : jamais une ancienne migration modifiée.

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,

    "event_type" VARCHAR(100) NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,

    "aggregate_type" VARCHAR(60) NOT NULL,
    "aggregate_id" UUID NOT NULL,

    "payload" JSONB NOT NULL,

    "occurred_at" TIMESTAMP(3) NOT NULL,
    "correlation_id" VARCHAR(100),

    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "last_error" TEXT,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,

    "outbox_event_id" UUID NOT NULL,
    "consumer_name" VARCHAR(100) NOT NULL,
    "result" VARCHAR(20),

    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,

    "outbox_event_id" UUID NOT NULL,

    "event_type" VARCHAR(100) NOT NULL,
    "aggregate_type" VARCHAR(60) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,

    "failure_reason" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL,

    "moved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dead_letter_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_suggestions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,

    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID NOT NULL,
    "field_name" VARCHAR(100) NOT NULL,

    "proposed_value" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,

    "source_document_id" UUID,
    "source_document_version_id" UUID,
    "source_page" INTEGER,
    "source_chunk_reference" VARCHAR(200),
    "source_analysis_attempt_id" UUID,

    "ai_provider" VARCHAR(30),
    "ai_model" VARCHAR(60),

    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',

    "created_by_process" VARCHAR(100) NOT NULL,

    "validated_by_user_id" UUID,
    "validated_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "decision_reason" TEXT,

    "applied_value" JSONB,

    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_id_organization_id_key" ON "outbox_events"("id", "organization_id");

-- CreateIndex
CREATE INDEX "outbox_events_organization_id_status_available_at_idx" ON "outbox_events"("organization_id", "status", "available_at");

-- Index de lecture du publisher (skills/platform-foundation/DATABASE_PATTERNS.md §40 —
-- WHERE status = 'PENDING' AND available_at <= NOW() ORDER BY created_at FOR UPDATE SKIP LOCKED).
CREATE INDEX "outbox_events_status_available_at_created_at_idx" ON "outbox_events"("status", "available_at", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_outbox_event_id_consumer_name_key" ON "processed_events"("outbox_event_id", "consumer_name");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_id_organization_id_key" ON "processed_events"("id", "organization_id");

-- CreateIndex
CREATE INDEX "processed_events_organization_id_consumer_name_idx" ON "processed_events"("organization_id", "consumer_name");

-- CreateIndex
CREATE UNIQUE INDEX "dead_letter_events_id_organization_id_key" ON "dead_letter_events"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "dead_letter_events_outbox_event_id_key" ON "dead_letter_events"("outbox_event_id");

-- CreateIndex
CREATE INDEX "dead_letter_events_organization_id_moved_at_idx" ON "dead_letter_events"("organization_id", "moved_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_suggestions_id_organization_id_key" ON "ai_suggestions"("id", "organization_id");

-- CreateIndex
CREATE INDEX "ai_suggestions_organization_id_entity_type_entity_id_idx" ON "ai_suggestions"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ai_suggestions_organization_id_status_idx" ON "ai_suggestions"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_events" ADD CONSTRAINT "processed_events_outbox_event_id_organization_id_fkey" FOREIGN KEY ("outbox_event_id", "organization_id") REFERENCES "outbox_events"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraints (catalogues fermés — hand-appended, jamais un enum natif Prisma)
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_status_check" CHECK ("status" IN ('PENDING','PROCESSING','PUBLISHED','FAILED','DEAD_LETTER'));
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_attempt_count_check" CHECK ("attempt_count" >= 0);

ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_status_check" CHECK ("status" IN ('PENDING','ACCEPTED','MODIFIED','REJECTED'));
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_entity_type_check" CHECK ("entity_type" IN ('TENDER_LOT','CHECKLIST_ITEM','SUBCONTRACTOR_PROFILE','DC1','DC2','DC4','ATTRI1','TECHNICAL_MEMO_SECTION','PRICING_LINE','COMPANY_LEGAL_IDENTITY'));
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1);

-- Note d'implémentation (jamais imposé par une contrainte DB, appliqué au niveau use case) : une
-- AiSuggestion PENDING ne porte ni validated_at ni rejected_at ; une fois ACCEPTED/MODIFIED/REJECTED,
-- plus aucune mutation n'est acceptée (garde applicative via updateMany WHERE status='PENDING').
