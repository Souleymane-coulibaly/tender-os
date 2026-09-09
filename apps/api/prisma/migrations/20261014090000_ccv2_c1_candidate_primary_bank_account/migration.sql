-- TenderOS 2.1 — Checkpoint CCV2-C.1 (banking candidate : invariant du compte principal)
--
-- POURQUOI CETTE MIGRATION (mission §13/§20 — aucune migration opportuniste) :
-- `company_bank_accounts.is_primary` existe depuis l'origine mais n'a JAMAIS été contraint : ni en
-- base, ni applicativement. Deux comptes principaux simultanés sont donc structurellement possibles
-- aujourd'hui. Sans index, deux promotions concurrentes (« rendre ce compte principal ») peuvent
-- toutes deux réussir et laisser l'entreprise candidate avec deux comptes principaux — un état que
-- le concept même de « compte PRINCIPAL » interdit.
--
-- Portée VOLONTAIREMENT limitée aux lignes candidate-owned : le chemin Legacy
-- (`client_account_id`) garde son comportement historique inchangé (mission §16 — ne pas modifier
-- Legacy). Un index partiel est le seul moyen de l'exprimer ; il n'est pas représentable dans le
-- DSL Prisma, il est donc écrit à la main — même précédent exact que
-- `candidate_establishments_one_principal_per_company`.
--
-- Aucune donnée n'est modifiée. Si une organisation possédait déjà deux comptes principaux pour un
-- même candidat, cette création d'index ÉCHOUERAIT bruyamment plutôt que de réécrire silencieusement
-- des données bancaires de l'utilisateur : c'est le comportement voulu, une donnée bancaire ne se
-- corrige pas sans décision humaine.

CREATE UNIQUE INDEX "company_bank_accounts_one_primary_per_candidate"
  ON "company_bank_accounts" ("candidate_company_id")
  WHERE "is_primary" = true AND "candidate_company_id" IS NOT NULL;
