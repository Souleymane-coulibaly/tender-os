-- V2 Sprint 22 (billing, étape 22C, correctif audit Codex P1-01) — un événement webhook Stripe
-- échoué doit rester rejouable par le prochain retry Stripe pour le MÊME stripe_event_id, jamais
-- bloqué à jamais derrière la contrainte unique existante (voir
-- PrismaStripeProcessedEventRepository.recordForProcessing). Additif uniquement.

ALTER TABLE "stripe_processed_events" ADD COLUMN "status" VARCHAR(9) NOT NULL DEFAULT 'RECEIVED';
