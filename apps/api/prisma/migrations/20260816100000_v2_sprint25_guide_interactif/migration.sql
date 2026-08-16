-- V2 Sprint 25 (Guide interactif) — mission §25.82 "User-scoped. Pas organization-scoped".
-- Additive uniquement : 3 colonnes nullables sur `users`, même motif que `terms_accepted_at`.
ALTER TABLE "users" ADD COLUMN "tour_started_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "tour_completed_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "tour_dismissed_at" TIMESTAMP(3);
