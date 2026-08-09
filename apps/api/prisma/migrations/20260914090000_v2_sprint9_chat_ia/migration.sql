-- V2 Sprint 9 — Chat IA conversationnel métier. Trois nouvelles tables additives : conversations,
-- messages, citations de message. Aucune table/colonne existante modifiée ou supprimée.

-- CreateTable: conversations — appartient TOUJOURS à EXACTEMENT UN Tender, jamais réaffectable
-- (mission §5). `client_account_id` est dénormalisé depuis `Tender.clientAccountId` au moment de
-- la création (même motif d'immutabilité que `KnowledgeEntry.clientAccountId`, Sprint 8) — jamais
-- modifié ensuite, y compris si le Tender change de candidat. `lot_id` reste un simple scalaire
-- (jamais une FK stricte, même motif que les colonnes de provenance des Finding) : revérifié
-- applicativement (appartenance au même Tender) à chaque usage, jamais fait confiance en base.
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "client_account_id" UUID,
    "lot_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "title" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversations_id_organization_id_key" ON "conversations"("id", "organization_id");
CREATE INDEX "conversations_organization_id_tender_id_archived_at_idx" ON "conversations"("organization_id", "tender_id", "archived_at");
CREATE INDEX "conversations_organization_id_client_account_id_idx" ON "conversations"("organization_id", "client_account_id");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tender_id_organization_id_fkey" FOREIGN KEY ("tender_id", "organization_id") REFERENCES "tenders"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_account_id_organization_id_fkey" FOREIGN KEY ("client_account_id", "organization_id") REFERENCES "client_accounts"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: messages — `role` gouverné (jamais SYSTEM en persistance : le prompt système est
-- versionné en code, mission §31, jamais un message modifiable). `status` gouverné
-- PENDING/COMPLETED/FAILED — garde anti-abus (mission décision §4) : au plus un message PENDING
-- par conversation, appliquée applicativement dans la même transaction que la création.
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    "created_by_user_id" UUID,
    "model" VARCHAR(100),
    "prompt_version" INTEGER,
    "input_token_count" INTEGER,
    "output_token_count" INTEGER,
    "total_token_count" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "messages" ADD CONSTRAINT "messages_role_check"
  CHECK ("role" IN ('USER', 'ASSISTANT'));
ALTER TABLE "messages" ADD CONSTRAINT "messages_status_check"
  CHECK ("status" IN ('PENDING', 'COMPLETED', 'FAILED'));

CREATE UNIQUE INDEX "messages_id_organization_id_key" ON "messages"("id", "organization_id");
CREATE INDEX "messages_organization_id_conversation_id_created_at_idx" ON "messages"("organization_id", "conversation_id", "created_at");
CREATE INDEX "messages_organization_id_conversation_id_status_idx" ON "messages"("organization_id", "conversation_id", "status");

ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_organization_id_fkey" FOREIGN KEY ("conversation_id", "organization_id") REFERENCES "conversations"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: message_citations — table dédiée à colonnes typées nullables (décision §2, jamais un
-- blob JSON, même motif que les Finding structurés). `source_type` gouverné ; toutes les colonnes de
-- provenance sont de simples scalaires (jamais une FK stricte vers document/knowledge_entry/
-- checklist_item, même motif que `TenderRequirementFinding.documentId`) : revérifiées
-- applicativement contre les sources effectivement autorisées, jamais faites confiance en base.
CREATE TABLE "message_citations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "source_type" VARCHAR(20) NOT NULL,
    "document_id" UUID,
    "document_version_id" UUID,
    "chunk_sequence" INTEGER,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "sheet_name" VARCHAR(120),
    "section_title" VARCHAR(300),
    "knowledge_entry_id" UUID,
    "knowledge_entry_version_id" UUID,
    "checklist_item_id" UUID,
    "finding_type" VARCHAR(30),
    "finding_id" UUID,
    "label" VARCHAR(300) NOT NULL,
    "excerpt" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_citations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_source_type_check"
  CHECK ("source_type" IN ('DOCUMENT', 'KNOWLEDGE_ENTRY', 'CHECKLIST_ITEM', 'FINDING', 'TENDER_FIELD'));
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_finding_type_check"
  CHECK ("finding_type" IS NULL OR "finding_type" IN ('DEADLINE', 'CRITERION', 'REQUIREMENT', 'CLAUSE', 'RISK', 'QUESTION'));

-- Cohérence provenance document : une référence de version de document implique la référence du
-- document lui-même — jamais l'une sans l'autre (même motif que Sprint 8 §"knowledge_entries_source_document_version_check").
ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_document_version_check"
  CHECK ("document_version_id" IS NULL OR "document_id" IS NOT NULL);

CREATE UNIQUE INDEX "message_citations_id_organization_id_key" ON "message_citations"("id", "organization_id");
CREATE INDEX "message_citations_organization_id_message_id_idx" ON "message_citations"("organization_id", "message_id");

ALTER TABLE "message_citations" ADD CONSTRAINT "message_citations_message_id_organization_id_fkey" FOREIGN KEY ("message_id", "organization_id") REFERENCES "messages"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
