import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  KnowledgeSearchCriteria,
  KnowledgeSearchMatch,
  KnowledgeSearchProvider,
  KnowledgeSearchResultPage,
} from "../application/ports/knowledge-search-provider";

/** Borne le nombre de candidats par sous-recherche — même garde-fou que
 *  `PrismaIlikeTenderSearchProvider` (module Tenders), à revoir si un vrai moteur de recherche
 *  (sémantique) remplace cette implémentation ILIKE. */
const MAX_CANDIDATES_PER_LOCATION = 200;
const SNIPPET_CONTEXT_CHARS = 150;

/** Extrait un passage autour de la première occurrence de `query` dans `content` (mission §9
 *  "extrait pertinent") — jamais la totalité du contenu, jamais un extrait qui ne contient pas
 *  réellement le terme recherché. */
function extractSnippet(content: string, query: string): string {
  const lowerContent = content.toLocaleLowerCase("fr-FR");
  const lowerQuery = query.toLocaleLowerCase("fr-FR");
  const matchIndex = lowerContent.indexOf(lowerQuery);
  if (matchIndex === -1) return content.slice(0, SNIPPET_CONTEXT_CHARS * 2);

  const start = Math.max(0, matchIndex - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(content.length, matchIndex + lowerQuery.length + SNIPPET_CONTEXT_CHARS);
  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}

/**
 * Filtres fonctionnels communs à TOUTES les branches de recherche (mission Sprint 5, correction
 * "Anomalie 1" — `metadataMatches` ne respectait ni category/status/tagId/dates, laissant une
 * entrée hors périmètre remonter via ses métadonnées). Cette fonction et `buildEntrySqlConditions`
 * ci-dessous DOIVENT rester en parité champ par champ : toute divergence entre les deux est un
 * contournement de filtre. Une vraie réutilisation de code n'est pas possible ici (un objet
 * `where` Prisma et un fragment SQL brut sont deux représentations différentes — la branche
 * metadata a besoin de SQL brut pour `metadata::text ILIKE`, que l'API `where` typée de Prisma ne
 * permet pas), la parité est donc garantie par ce miroir explicite + les tests d'intégration ci-
 * dessous qui verrouillent le comportement des deux côtés.
 */
function buildEntryWhere(criteria: KnowledgeSearchCriteria): Prisma.KnowledgeEntryWhereInput {
  const andConditions: Prisma.KnowledgeEntryWhereInput[] = [];
  if (criteria.category) andConditions.push({ category: criteria.category });
  if (criteria.status) andConditions.push({ status: criteria.status });
  if (criteria.tagId) andConditions.push({ entryTags: { some: { tagId: criteria.tagId, organizationId: criteria.organizationId } } });
  if (criteria.createdAfter) andConditions.push({ createdAt: { gte: criteria.createdAfter } });
  if (criteria.createdBefore) andConditions.push({ createdAt: { lte: criteria.createdBefore } });
  if (!criteria.includeArchived) andConditions.push({ archivedAt: null });

  return { organizationId: criteria.organizationId, ...(andConditions.length > 0 ? { AND: andConditions } : {}) };
}

/** Équivalent SQL brut de `buildEntryWhere` — voir le commentaire ci-dessus. Utilisé UNIQUEMENT
 *  par la branche `metadataMatches`, qui a besoin de SQL brut pour filtrer sur `metadata::text`. */
function buildEntrySqlConditions(criteria: KnowledgeSearchCriteria): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`"organization_id" = ${criteria.organizationId}::uuid`];
  if (criteria.category) conditions.push(Prisma.sql`"category" = ${criteria.category}`);
  if (criteria.status) conditions.push(Prisma.sql`"status" = ${criteria.status}`);
  if (criteria.tagId) {
    conditions.push(
      Prisma.sql`EXISTS (
        SELECT 1 FROM "knowledge_entry_tags"
        WHERE "knowledge_entry_tags"."knowledge_entry_id" = "knowledge_entries"."id"
          AND "knowledge_entry_tags"."tag_id" = ${criteria.tagId}::uuid
          AND "knowledge_entry_tags"."organization_id" = ${criteria.organizationId}::uuid
      )`,
    );
  }
  if (criteria.createdAfter) conditions.push(Prisma.sql`"created_at" >= ${criteria.createdAfter}`);
  if (criteria.createdBefore) conditions.push(Prisma.sql`"created_at" <= ${criteria.createdBefore}`);
  if (!criteria.includeArchived) conditions.push(Prisma.sql`"archived_at" IS NULL`);
  return Prisma.join(conditions, " AND ");
}

/**
 * Recherche textuelle (mission Sprint 5 §8) via PostgreSQL ILIKE — même motif que
 * `PrismaIlikeTenderSearchProvider` (module Tenders) : volontairement simple, jamais un moteur
 * vectoriel externe pour cette tranche. Cherche dans le titre/la description/les métadonnées de
 * l'entrée ET dans le contenu des chunks, avec un classement déterministe simple (titre >
 * description > métadonnées > contenu, puis récence) — jamais un score numérique fabriqué.
 */
@Injectable()
export class PrismaIlikeKnowledgeSearchProvider implements KnowledgeSearchProvider {
  constructor(private readonly prisma: PrismaService) {}

  async search(criteria: KnowledgeSearchCriteria): Promise<KnowledgeSearchResultPage> {
    const entryWhere = buildEntryWhere(criteria);

    const [titleMatches, descriptionMatches, metadataMatches, contentMatches] = await Promise.all([
      this.prisma.knowledgeEntry.findMany({
        where: { ...entryWhere, title: { contains: criteria.query, mode: "insensitive" } },
        select: { id: true, title: true },
        take: MAX_CANDIDATES_PER_LOCATION,
      }),
      this.prisma.knowledgeEntry.findMany({
        where: { ...entryWhere, description: { contains: criteria.query, mode: "insensitive" } },
        select: { id: true, description: true },
        take: MAX_CANDIDATES_PER_LOCATION,
      }),
      this.prisma.$queryRaw<{ id: string; metadata: string }[]>`
        SELECT id, metadata::text AS metadata FROM "knowledge_entries"
        WHERE ${buildEntrySqlConditions(criteria)}
          AND metadata::text ILIKE ${`%${criteria.query}%`}
        LIMIT ${MAX_CANDIDATES_PER_LOCATION}
      `,
      this.prisma.knowledgeChunk.findMany({
        where: {
          organizationId: criteria.organizationId,
          content: { contains: criteria.query, mode: "insensitive" },
          knowledgeDocument: { knowledgeEntry: entryWhere },
        },
        select: { knowledgeEntryId: true, knowledgeDocumentId: true, sequence: true, content: true, pageStart: true, pageEnd: true, sheetName: true, sectionTitle: true },
        take: MAX_CANDIDATES_PER_LOCATION,
      }),
    ]);

    const matches: KnowledgeSearchMatch[] = [
      ...titleMatches.map((entry): KnowledgeSearchMatch => ({ knowledgeEntryId: entry.id, matchLocation: "TITLE", snippet: entry.title })),
      ...descriptionMatches.map((entry): KnowledgeSearchMatch => ({ knowledgeEntryId: entry.id, matchLocation: "DESCRIPTION", snippet: entry.description ?? "" })),
      ...metadataMatches.map((entry): KnowledgeSearchMatch => ({ knowledgeEntryId: entry.id, matchLocation: "METADATA", snippet: extractSnippet(entry.metadata, criteria.query) })),
      ...contentMatches.map(
        (chunk): KnowledgeSearchMatch => ({
          knowledgeEntryId: chunk.knowledgeEntryId,
          matchLocation: "CONTENT",
          snippet: extractSnippet(chunk.content, criteria.query),
          knowledgeDocumentId: chunk.knowledgeDocumentId,
          chunkSequence: chunk.sequence,
          pageStart: chunk.pageStart ?? undefined,
          pageEnd: chunk.pageEnd ?? undefined,
          sheetName: chunk.sheetName ?? undefined,
          sectionTitle: chunk.sectionTitle ?? undefined,
        }),
      ),
    ];

    const total = matches.length;
    const page = matches.slice(criteria.offset, criteria.offset + criteria.limit);

    return { matches: page, total };
  }
}
