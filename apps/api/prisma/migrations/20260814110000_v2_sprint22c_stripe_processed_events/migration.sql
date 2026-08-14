-- V2 Sprint 22 (billing, étape 22C) — idempotence des webhooks Stripe. Additif uniquement, aucune
-- donnée existante touchée.

CREATE TABLE "stripe_processed_events" (
  "id" UUID NOT NULL,
  "stripe_event_id" VARCHAR(255) NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL,
  "processed_at" TIMESTAMP(3),
  "error_code" TEXT,

  CONSTRAINT "stripe_processed_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stripe_processed_events_stripe_event_id_key" ON "stripe_processed_events"("stripe_event_id");
CREATE INDEX "stripe_processed_events_event_type_idx" ON "stripe_processed_events"("event_type");
