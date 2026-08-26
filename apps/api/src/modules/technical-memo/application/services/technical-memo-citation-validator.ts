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

export function validateTechnicalMemoCitation(citation: DeclaredTechnicalMemoCitation, known: KnownTechnicalMemoReferences): KnownTechnicalMemoReference {
  const match = resolveKnownReference(citation.sourceRef, known);
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

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-3 (F-10) — marqueur CANONIQUE qui separe, dans le
 * contexte envoye au modele, la METADONNEE (identifiant de source, libelle, qualificatifs) du
 * CONTENU CITABLE.
 *
 * Racine du defaut : chacun des dix sites de rendu composait sa propre ligne
 * `- [REF] <metadonnee> : <contenu>`, sans aucun delimiteur. Le modele ne pouvait pas savoir ou
 * commencait le texte reellement citable et recopiait naturellement le libelle avec — or seul
 * `content` est connu du garde de provenance, qui rejetait alors une citation pourtant issue d'une
 * source REELLE et autorisee.
 *
 * Ce marqueur ne relache AUCUNE verification : `validateTechnicalMemoCitation` continue d'exiger
 * que l'extrait apparaisse mot pour mot dans `content`. Il rend seulement l'instruction
 * satisfaisable. Une citation inexacte reste rejetee exactement comme avant.
 */
export const QUOTABLE_CONTENT_MARKER = "CITATION EXACTE :";

/**
 * Rendu canonique d'UNE source pour le modele — point de passage UNIQUE de tous les sites de
 * contexte du memoire technique. `content` reste la SEULE source de verite de ce qui est citable :
 * il n'est ni duplique, ni reecrit, ni enrichi ici.
 */
export function renderTechnicalMemoSourceLine(
  sourceRef: string,
  reference: Pick<KnownTechnicalMemoReference, "label" | "content">,
  qualifier?: string,
): string {
  const heading = qualifier ? `${reference.label} (${qualifier})` : reference.label;
  return `- [${sourceRef}] ${heading}
  ${QUOTABLE_CONTENT_MARKER} ${reference.content}`;
}
