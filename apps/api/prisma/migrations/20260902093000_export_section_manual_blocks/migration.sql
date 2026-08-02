-- Mission Sprint 8A.1 §7/§9/§12 — colonne additive, nullable : préserve la mise en forme
-- structurée (RenderableBlock[]) d'un contenu MANUAL/ANNEX à travers le pipeline de rendu DOCX/PDF
-- du Sprint 8A. Absente = comportement Sprint 8A inchangé (repli sur `manual_content` en texte
-- brut). Aucune migration précédente n'est modifiée.
ALTER TABLE "export_section_selections" ADD COLUMN "manual_blocks" JSONB;
