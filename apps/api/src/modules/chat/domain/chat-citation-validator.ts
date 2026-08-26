import { ChatCitationValidationFailedError } from "./errors";
import type { CitationFindingType, CitationSourceType } from "./message-citation.entity";

/** Une source RÉELLEMENT injectée dans le prompt (mission §"jamais une citation forgée par le LLM
 *  acceptée telle quelle") — jamais une reconstruction a posteriori. Clé du `Map` = `sourceRef`, le
 *  jeton exact affiché au modèle dans le contexte (ex. `"DOC:{documentId}:{chunkSequence}"`,
 *  `"KB:{knowledgeEntryId}"`, `"TENDER:submissionDeadline"`...). */
export type KnownChatReference = Readonly<{
  sourceType: CitationSourceType;
  label: string;
  content: string;
  documentId?: string | undefined;
  documentVersionId?: string | undefined;
  chunkSequence?: number | undefined;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  sheetName?: string | undefined;
  sectionTitle?: string | undefined;
  knowledgeEntryId?: string | undefined;
  knowledgeEntryVersionId?: string | undefined;
  checklistItemId?: string | undefined;
  findingType?: CitationFindingType | undefined;
  findingId?: string | undefined;
}>;

export type KnownChatReferences = ReadonlyMap<string, KnownChatReference>;

export type DeclaredChatCitation = Readonly<{ sourceRef: string; excerpt?: string | undefined }>;

/**
 * Vérification déterministe post-hoc, même discipline que `generation-citation-validator.ts` —
 * rejette un `sourceRef` non fourni au contexte réel, ou un extrait dont le texte ne se retrouve
 * pas mot pour mot dans le contenu connu de cette source. Retourne la référence connue (jamais la
 * citation brute déclarée par le modèle) : c'est TOUJOURS elle qui sert à construire la
 * `MessageCitation` persistée.
 */
/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-2 (F-08) — resolution DETERMINISTE du jeton de source.
 *
 * L'assembleur de contexte AFFICHE chaque source entre crochets (`- [CANDIDATE:legalIdentity] ...`)
 * pour la lisibilite du prompt, mais ENREGISTRE la cle sans crochets. Le modele recopiait donc tres
 * naturellement la forme qu'il voyait — `[CANDIDATE:legalIdentity]` — et la recherche exacte
 * echouait : la generation etait rejetee alors que la source citee etait REELLE et bien fournie.
 *
 * La normalisation appliquee ici est l'inverse EXACT de la transformation d'affichage : une seule
 * paire de crochets encadrants est retiree, puis la correspondance reste STRICTEMENT exacte. Ce
 * n'est pas du rapprochement approximatif — aucune tolerance de casse, d'espace ou de similarite
 * n'est introduite, et un jeton reellement inconnu reste rejete exactement comme avant.
 */
function resolveKnownReference<T>(sourceRef: string, known: ReadonlyMap<string, T>): T | undefined {
  const direct = known.get(sourceRef);
  if (direct !== undefined) return direct;
  const trimmed = sourceRef.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return known.get(trimmed.slice(1, -1));
  }
  return undefined;
}

export function validateChatCitation(citation: DeclaredChatCitation, known: KnownChatReferences): KnownChatReference {
  const match = resolveKnownReference(citation.sourceRef, known);
  if (!match) {
    throw new ChatCitationValidationFailedError({ reason: `cited source "${citation.sourceRef}" was not part of the context actually supplied` });
  }
  if (citation.excerpt && !match.content.includes(citation.excerpt)) {
    throw new ChatCitationValidationFailedError({ reason: `citation excerpt for source "${citation.sourceRef}" was not found verbatim in its supplied content` });
  }
  return match;
}

export function validateChatCitations(citations: readonly DeclaredChatCitation[], known: KnownChatReferences): KnownChatReference[] {
  return citations.map((citation) => validateChatCitation(citation, known));
}
