-- Sprint 21 (hardening) — mission §27 : deux nouvelles requêtes plateforme-admin cross-tenant
-- (GET admin/audit-logs, GET admin/outbox/dead-letters) trient par date SANS filtre
-- organizationId — l'index composite existant (organizationId, ...) ne couvre pas ce cas
-- (organizationId n'est pas un préfixe utilisable). Additif uniquement, aucune donnée touchée.

CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" ("created_at");

CREATE INDEX "dead_letter_events_moved_at_idx" ON "dead_letter_events" ("moved_at");
