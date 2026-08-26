-- Checkpoint TENDEROS-2.1-P2.3-E11 (Notifications V2) — préférence email personnelle par
-- catégorie, additive uniquement (nouvelle table), jamais de modification du modèle
-- `notifications` existant.
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_user_id_category_key" ON "notification_preferences"("user_id", "category");
