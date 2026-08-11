-- Correctif — `saved_search_matches` doit porter `@@unique([id, organizationId])` comme tout le
-- reste du schéma (convention utilisée par `update(where: {id_organizationId: {...}})`), oubliée
-- dans la migration initiale du Sprint 17.
CREATE UNIQUE INDEX "saved_search_matches_id_organization_id_key" ON "saved_search_matches"("id", "organization_id");
