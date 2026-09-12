-- TENDEROS-2.1 (guides de page) — mémoire, par utilisateur, des guides contextuels (un par écran)
-- déjà terminés ou écartés. User-scoped, jamais organization-scoped : même motif que
-- `users.tour_completed_at` / `users.tour_dismissed_at` (V2 Sprint 25), une ligne par guide.
-- Additive uniquement : nouvelle table, aucune donnée existante touchée, aucune ancienne migration
-- modifiée.
--
-- `guide_key` n'est PAS une liste fermée côté base : le registre des guides vit dans l'application
-- web, seule la forme de la clé est contrôlée par l'API (value object `PageGuideKey`).
--
-- Noms de contraintes/index : exactement ceux que Prisma génère (tous < 63 caractères).
-- ON DELETE CASCADE : ces lignes n'ont aucun sens sans leur utilisateur.

CREATE TABLE "user_page_guide_states" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "guide_key" VARCHAR(64) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_page_guide_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_page_guide_states_user_id_guide_key_key" ON "user_page_guide_states"("user_id", "guide_key");

ALTER TABLE "user_page_guide_states" ADD CONSTRAINT "user_page_guide_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
