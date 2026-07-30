import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { KnowledgeTag } from "../domain/knowledge-tag.entity";

/**
 * Client Prisma générique (transaction OU client top-level) — `PrismaService`/`PrismaClient` sont
 * structurellement des sur-ensembles de `Prisma.TransactionClient` (ils exposent en plus
 * `$transaction`/`$connect`/…), donc assignables ici sans adaptation.
 */
export type KnowledgeTagTxClient = Prisma.TransactionClient;

export function toKnowledgeTagDomain(record: { id: string; organizationId: string; label: string; displayLabel: string; createdAt: Date }): KnowledgeTag {
  return KnowledgeTag.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    label: record.label,
    displayLabel: record.displayLabel,
    createdAt: record.createdAt,
  });
}

/**
 * Résolution/création d'un tag (mission Sprint 5 §4) — extrait de `PrismaKnowledgeTagRepository`
 * pour être appelable DANS une transaction déjà ouverte (correction "Anomalie 2" : la création
 * d'entrée avec tags doit être atomique — si une écriture ultérieure échoue, un tag fraîchement
 * créé ici ne doit jamais survivre à la transaction). Une seule implémentation, jamais deux
 * logiques divergentes entre le chemin non-transactionnel (`PrismaKnowledgeTagRepository`) et le
 * chemin atomique (`PrismaKnowledgeEntryRepository.createWithVersionAndTags`,
 * `PrismaKnowledgeDocumentRepository.createForEntry`).
 */
export async function resolveOrCreateTagTx(
  tx: KnowledgeTagTxClient,
  input: { organizationId: string; label: string; displayLabel: string; occurredAt: Date },
): Promise<KnowledgeTag> {
  const existing = await tx.knowledgeTag.findFirst({ where: { organizationId: input.organizationId, label: input.label } });
  if (existing) return toKnowledgeTagDomain(existing);

  try {
    const created = await tx.knowledgeTag.create({
      data: { id: randomUUID(), organizationId: input.organizationId, label: input.label, displayLabel: input.displayLabel, createdAt: input.occurredAt },
    });
    return toKnowledgeTagDomain(created);
  } catch {
    // Course concurrente sur la contrainte unique (organizationId, label) — jamais une seconde
    // ligne, toujours une relecture (même garde-fou que le chemin non-transactionnel).
    const raced = await tx.knowledgeTag.findFirst({ where: { organizationId: input.organizationId, label: input.label } });
    if (raced) return toKnowledgeTagDomain(raced);
    throw new Error("Failed to create or resolve the knowledge tag.");
  }
}

export async function attachTagToEntryTx(
  tx: KnowledgeTagTxClient,
  input: { organizationId: string; knowledgeEntryId: string; tagId: string; occurredAt: Date },
): Promise<void> {
  await tx.knowledgeEntryTag.upsert({
    where: { knowledgeEntryId_tagId: { knowledgeEntryId: input.knowledgeEntryId, tagId: input.tagId } },
    create: { organizationId: input.organizationId, knowledgeEntryId: input.knowledgeEntryId, tagId: input.tagId, createdAt: input.occurredAt },
    update: {},
  });
}
