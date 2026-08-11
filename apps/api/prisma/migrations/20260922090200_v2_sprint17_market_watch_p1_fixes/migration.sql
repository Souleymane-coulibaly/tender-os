-- Correctifs audit Codex (round post-livraison Sprint 17) — deux P1 réels de concurrence.

-- P1-001 — `send-pending-email-alerts.use-case.ts` lisait les matches PENDING puis sauvegardait le
-- statut SENT/FAILED seulement APRES l'envoi : deux instances API (ou deux ticks qui se
-- chevauchent) pouvaient lire le même match et envoyer deux emails au même utilisateur. Fermé par
-- un CLAIM atomique (`UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`) qui bascule le
-- match sur un nouvel état transitoire `SENDING` avant l'envoi — la contrainte CHECK doit
-- l'autoriser.
ALTER TABLE "saved_search_matches" DROP CONSTRAINT "saved_search_matches_email_status_check";
ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_email_status_check" CHECK ("email_status" IN ('PENDING','SENDING','SENT','FAILED'));

-- P1-002 — `promote-external-tender-to-opportunity.use-case.ts` faisait un "check-then-act"
-- (`findByExternalTenderAndClient` puis création) sans aucune contrainte d'unicité en base : deux
-- clics simultanés pouvaient créer deux Opportunities pour le même (marché, client). La protection
-- réelle est un verrou consultatif transactionnel (`pg_advisory_xact_lock`, voir
-- `PrismaExternalTenderPromotionRepository.lockForPromotion`) acquis avant la lecture ; cet index
-- unique partiel est une DEUXIÈME ligne de défense en base, au cas où un futur appelant créerait
-- une promotion sans passer par ce use case. Deux index partiels (plutôt qu'un seul `@@unique` sur
-- les trois colonnes) car `client_account_id` est nullable et Postgres ne déduplique jamais les
-- NULL dans un index unique classique — un `WHERE client_account_id IS NULL` dédié est nécessaire
-- pour couvrir aussi ce cas.
CREATE UNIQUE INDEX "external_tender_promotions_org_tender_client_key"
  ON "external_tender_promotions"("organization_id", "external_tender_id", "client_account_id")
  WHERE "client_account_id" IS NOT NULL;
CREATE UNIQUE INDEX "external_tender_promotions_org_tender_no_client_key"
  ON "external_tender_promotions"("organization_id", "external_tender_id")
  WHERE "client_account_id" IS NULL;
