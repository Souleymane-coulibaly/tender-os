-- CreateExtension (mission §81 — recherche native Postgres, jamais Elasticsearch ce sprint)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable
CREATE TABLE "external_tenders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "market_type" VARCHAR(10) NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "buyer_name" VARCHAR(300),
    "buyer_type" VARCHAR(80),
    "country" VARCHAR(10),
    "region" VARCHAR(120),
    "department" VARCHAR(10),
    "city" VARCHAR(160),
    "cpv_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "estimated_amount" DECIMAL(19,4),
    "currency" CHAR(3),
    "procedure_type" VARCHAR(120),
    "publication_date" TIMESTAMP(3),
    "submission_deadline" TIMESTAMP(3),
    "source_url" VARCHAR(2048),
    "lots" JSONB,
    "raw_metadata" JSONB,
    "checksum" VARCHAR(64),
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "client_account_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "include_keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "exclude_keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cpv_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "countries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "departments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "market_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "min_amount" DECIMAL(19,4),
    "max_amount" DECIMAL(19,4),
    "include_unknown_amount" BOOLEAN NOT NULL DEFAULT true,
    "published_after" TIMESTAMP(3),
    "deadline_after_days" INTEGER,
    "deadline_before_date" TIMESTAMP(3),
    "procedure_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "alert_in_app" BOOLEAN NOT NULL DEFAULT true,
    "alert_email" BOOLEAN NOT NULL DEFAULT false,
    "email_frequency" VARCHAR(20) NOT NULL DEFAULT 'DAILY_DIGEST',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_digest_sent_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_search_matches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "saved_search_id" UUID NOT NULL,
    "external_tender_id" UUID NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "match_reasons" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'NEW',
    "first_matched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_matched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_in_app_at" TIMESTAMP(3),
    "email_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "email_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "email_last_error" VARCHAR(500),
    "notified_email_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_search_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_tender_promotions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "external_tender_id" UUID NOT NULL,
    "client_account_id" UUID,
    "opportunity_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_tender_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "body" TEXT,
    "target_url" VARCHAR(500),
    "metadata" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_tenders_id_organization_id_key" ON "external_tenders"("id", "organization_id");
CREATE UNIQUE INDEX "external_tenders_organization_id_source_external_id_key" ON "external_tenders"("organization_id", "source", "external_id");
CREATE INDEX "external_tenders_organization_id_publication_date_idx" ON "external_tenders"("organization_id", "publication_date");
CREATE INDEX "external_tenders_organization_id_submission_deadline_idx" ON "external_tenders"("organization_id", "submission_deadline");
CREATE INDEX "external_tenders_organization_id_country_idx" ON "external_tenders"("organization_id", "country");
CREATE INDEX "external_tenders_organization_id_source_idx" ON "external_tenders"("organization_id", "source");
-- Mission §81/§84 — recherche mots-clés (title/description) sans Elasticsearch : trigram GIN.
CREATE INDEX "external_tenders_title_trgm_idx" ON "external_tenders" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "external_tenders_description_trgm_idx" ON "external_tenders" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "saved_searches_id_organization_id_key" ON "saved_searches"("id", "organization_id");
CREATE INDEX "saved_searches_organization_id_owner_user_id_idx" ON "saved_searches"("organization_id", "owner_user_id");
CREATE INDEX "saved_searches_organization_id_is_active_idx" ON "saved_searches"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "saved_search_matches_saved_search_id_external_tender_id_key" ON "saved_search_matches"("saved_search_id", "external_tender_id");
CREATE INDEX "saved_search_matches_organization_id_saved_search_id_stat_idx" ON "saved_search_matches"("organization_id", "saved_search_id", "status");
CREATE INDEX "saved_search_matches_organization_id_external_tender_id_idx" ON "saved_search_matches"("organization_id", "external_tender_id");
CREATE INDEX "saved_search_matches_organization_id_email_status_idx" ON "saved_search_matches"("organization_id", "email_status");

-- CreateIndex
CREATE UNIQUE INDEX "external_tender_promotions_id_organization_id_key" ON "external_tender_promotions"("id", "organization_id");
CREATE INDEX "external_tender_promotions_organization_id_external_tende_idx" ON "external_tender_promotions"("organization_id", "external_tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_id_organization_id_key" ON "notifications"("id", "organization_id");
CREATE INDEX "notifications_organization_id_user_id_read_at_idx" ON "notifications"("organization_id", "user_id", "read_at");
CREATE INDEX "notifications_organization_id_user_id_created_at_idx" ON "notifications"("organization_id", "user_id", "created_at");

-- AddForeignKey
ALTER TABLE "external_tenders" ADD CONSTRAINT "external_tenders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_saved_search_id_organization_id_fkey" FOREIGN KEY ("saved_search_id", "organization_id") REFERENCES "saved_searches"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_external_tender_id_organization_id_fkey" FOREIGN KEY ("external_tender_id", "organization_id") REFERENCES "external_tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_tender_promotions" ADD CONSTRAINT "external_tender_promotions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "external_tenders" ADD CONSTRAINT "external_tenders_source_check" CHECK ("source" IN ('MANUAL','BOAMP','TED','PRIVATE','OTHER'));
ALTER TABLE "external_tenders" ADD CONSTRAINT "external_tenders_market_type_check" CHECK ("market_type" IN ('PUBLIC','PRIVATE'));
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_email_frequency_check" CHECK ("email_frequency" IN ('IMMEDIATE','DAILY_DIGEST'));
ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_status_check" CHECK ("status" IN ('NEW','INTERESTED','IGNORED'));
ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_email_status_check" CHECK ("email_status" IN ('PENDING','SENT','FAILED'));
