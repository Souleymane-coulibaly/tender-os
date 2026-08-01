import { GenerationCitationValidationFailedError } from "./errors";

/** Une source Knowledge Base RÉELLEMENT fournie au prompt — jamais une reconstruction a posteriori. */
export type KnownKnowledgeReference = Readonly<{
  knowledgeEntryId: string;
  excerpt: string;
}>;

export type KnownKnowledgeReferences = ReadonlyMap<string, KnownKnowledgeReference>;

export type DeclaredCitation = Readonly<{
  knowledgeEntryId: string;
  citation?: string | undefined;
}>;

/**
 * Vérification déterministe post-hoc (jamais une confiance auto-déclarée par le modèle) — mission
 * Sprint 6 §"Ne pas injecter de donnée d'un autre client" / "citer les informations utilisées". Même
 * discipline que `finding-provenance-validator.ts` (Analysis) : rejette un `knowledgeEntryId` non
 * fourni au contexte réel, ou une citation dont le texte ne se retrouve pas mot pour mot dans
 * l'extrait connu — jamais persisté, jamais silencieusement ignoré.
 */
export function validateGenerationCitation(citation: DeclaredCitation, known: KnownKnowledgeReferences): void {
  const match = known.get(citation.knowledgeEntryId);
  if (!match) {
    throw new GenerationCitationValidationFailedError({
      reason: `cited knowledge entry "${citation.knowledgeEntryId}" was not part of the context actually supplied`,
    });
  }
  if (citation.citation && !match.excerpt.includes(citation.citation)) {
    throw new GenerationCitationValidationFailedError({
      reason: `citation text for knowledge entry "${citation.knowledgeEntryId}" was not found verbatim in its supplied excerpt`,
    });
  }
}

export function validateGenerationCitations(citations: readonly DeclaredCitation[], known: KnownKnowledgeReferences): void {
  for (const citation of citations) {
    validateGenerationCitation(citation, known);
  }
}
