-- Mission (audit de correction) — "pricing version dans export" : `pricing_estimate_version_id`
-- était en réalité utilisé comme un `estimateId` (application) mais nommé/documenté comme un
-- identifiant de version, si bien qu'un export ne gelait jamais une version précise et affichait
-- toujours la version COURANTE au moment du rendu. Renommage vers `pricing_estimate_id` (le vrai
-- identifiant de l'estimation) + ajout de `pricing_estimate_version_number` (le numéro de version
-- explicitement figé). Additive uniquement : aucune migration précédemment appliquée modifiée.

ALTER TABLE "export_section_selections" RENAME COLUMN "pricing_estimate_version_id" TO "pricing_estimate_id";

ALTER TABLE "export_section_selections" ADD COLUMN "pricing_estimate_version_number" INTEGER;
