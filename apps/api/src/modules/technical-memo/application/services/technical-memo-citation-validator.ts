import { TechnicalMemoCitationValidationFailedError } from "../../domain/errors";
import type { TechnicalMemoCitationSourceType, TechnicalMemoRequirementFindingType } from "../../domain/enums";

/** Une source RÉELLEMENT injectée dans le prompt de génération d'UNE section (mission §35 "jamais
 *  une citation forgée par le LLM acceptée telle quelle") — jamais reconstruite a posteriori. Clé du
 *  `Map` = `sourceRef`, le jeton exact affiché au modèle dans le contexte (ex.
 *  `"FIND:REQUIREMENT:{id}"`, `"KB:{knowledgeEntryId}"`, `"REF:{companyReferenceId}"`,
 *  `"CANDIDATE:{fieldPath}"`, `"DOC:{documentId}:{chunkSequence}"`). Même motif que
 *  `KnownChatReference` (Sprint 9), copié plutôt que partagé (module distinct, jamais de dépendance
 *  croisée Chat ↔ technical-memo). */
export type KnownTechnicalMemoReference = Readonly<{
  sourceType: TechnicalMemoCitationSourceType;
  label: string;
  content: string;
  findingType?: TechnicalMemoRequirementFindingType | undefined;
  findingId?: string | undefined;
  knowledgeEntryId?: string | undefined;
  knowledgeEntryVersionId?: string | undefined;
  companyReferenceId?: string | undefined;
  candidateFieldPath?: string | undefined;
  documentId?: string | undefined;
  chunkSequence?: number | undefined;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
}>;

export type KnownTechnicalMemoReferences = ReadonlyMap<string, KnownTechnicalMemoReference>;

export type DeclaredTechnicalMemoCitation = Readonly<{ sourceRef: string; excerpt?: string | undefined }>;

/** Vérification déterministe post-hoc — rejette un `sourceRef` non fourni au contexte réel, ou un
 *  extrait dont le texte ne se retrouve pas mot pour mot dans le contenu connu de cette source.
 *  Retourne la référence CONNUE (jamais la citation brute déclarée par le modèle) : c'est toujours
 *  elle qui sert à construire la `TechnicalMemoSectionCitation` persistée. */
export function validateTechnicalMemoCitation(citation: DeclaredTechnicalMemoCitation, known: KnownTechnicalMemoReferences): KnownTechnicalMemoReference {
  const match = known.get(citation.sourceRef);
  if (!match) {
    throw new TechnicalMemoCitationValidationFailedError({ reason: `cited source "${citation.sourceRef}" was not part of the context actually supplied` });
  }
  if (citation.excerpt && !match.content.includes(citation.excerpt)) {
    throw new TechnicalMemoCitationValidationFailedError({ reason: `citation excerpt for source "${citation.sourceRef}" was not found verbatim in its supplied content` });
  }
  return match;
}

export function validateTechnicalMemoCitations(citations: readonly DeclaredTechnicalMemoCitation[], known: KnownTechnicalMemoReferences): KnownTechnicalMemoReference[] {
  return citations.map((citation) => validateTechnicalMemoCitation(citation, known));
}
