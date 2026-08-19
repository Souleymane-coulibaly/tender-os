-- Checkpoint 2.1-P2.1-FIX-A — DCE freshness / stale-state foundation
--
-- Additif uniquement : deux colonnes nullable-or-defaulted, aucune suppression, aucun DROP,
-- aucune migration destructive, aucun backfill inventé.
--
-- 1) dces.revision — compteur monotone du contenu sémantique du DCE, incrémenté de façon atomique
--    (UPDATE ... SET revision = revision + 1) à chaque ajout/remplacement/suppression de document ou
--    correction de catégorie. NOT NULL DEFAULT 1 : chaque Dce existant reçoit la valeur baseline "1"
--    au lieu d'une valeur inventée plus précise — aucune tentative de reconstituer rétroactivement
--    combien de mutations un DCE historique a réellement subi (mission §22 "ne jamais inventer une
--    précision historique fausse"). Toute nouvelle mutation sur un DCE existant fera avancer sa
--    révision normalement à partir de cette baseline.
--
-- 2) tender_analysis_summaries.dce_revision — instantané de dces.revision au moment de la
--    persistance de CETTE synthèse (jamais recalculé après coup, même discipline que
--    analysis_version/document_version_id déjà présents sur ce schéma). NULLABLE, sans défaut : les
--    lignes historiques restent NULL ("UNKNOWN" côté application), jamais une fausse valeur "1"
--    qui laisserait croire à une fraîcheur connue qui ne l'est pas.

ALTER TABLE "dces" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "tender_analysis_summaries" ADD COLUMN "dce_revision" INTEGER;
