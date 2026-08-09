-- Correctif audit Codex P2 (Sprint 9) — la garde "au plus un message ASSISTANT PENDING par
-- conversation" (mission décision §4) était purement applicative (SELECT puis INSERT dans la même
-- transaction) : sous PostgreSQL READ COMMITTED, deux transactions concurrentes peuvent chacune
-- constater l'absence de message PENDING avant que l'autre n'ait committé, laissant passer deux
-- appels IA simultanés pour la même conversation. Un index unique PARTIEL (non exprimable dans le
-- DSL Prisma, voir le commentaire du modèle `Message` dans schema.prisma — même motif que
-- `tender_participants_active_unique`, Sprint 7) élimine la course au niveau base : la seconde
-- transaction concurrente échoue avec une violation de contrainte unique (P2002), traduite en
-- `ConversationGenerationInProgressError` par `PrismaMessageRepository.save`.
CREATE UNIQUE INDEX "messages_one_pending_assistant_per_conversation"
  ON "messages"("conversation_id")
  WHERE "status" = 'PENDING' AND "role" = 'ASSISTANT';
