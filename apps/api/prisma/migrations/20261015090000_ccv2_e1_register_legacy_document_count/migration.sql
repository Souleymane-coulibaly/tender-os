-- TenderOS 2.1 — Checkpoint CCV2-E.1 (registre de migration : documents non migrables)
--
-- POURQUOI CETTE MIGRATION. Le registre posé en CCV2-B compte les SATELLITES restés Legacy
-- (`legacy_satellite_count`) mais pas les DOCUMENTS : un ClientAccount sans CandidateCompany peut
-- porter des justificatifs d'entreprise qui, eux aussi, restent non migrables. Sans ce compteur,
-- l'opérateur ne peut pas prioriser les promotions assistées à venir.
--
-- Une seule colonne, additive, avec défaut : aucune ligne existante n'est invalidée. Le choix de
-- ne PAS créer une seconde table par document est délibéré — le motif d'exception est une propriété
-- du ClientAccount (« il n'a aucune CandidateCompany »), pas de chaque fichier ; une table par
-- document répéterait ce même fait autant de fois qu'il y a de pièces.

ALTER TABLE "candidate_migration_register" ADD COLUMN "legacy_document_count" INTEGER NOT NULL DEFAULT 0;
