import { AiProvenanceValidationFailedError } from "../../domain/errors";
import type { DocumentAnalysisOutput } from "../schemas/business/document-analysis-output.schema";
import type { TenderConsolidationOutput } from "../schemas/business/tender-consolidation-output.schema";

/** Provenance déclarée par le modèle sur UN item (deadline/critère/exigence/clause/risque/
 *  question) — même sous-ensemble de champs pour les sorties document et tender. */
/** Chaque champ accepte aussi `null` (mission — correctif crash prod `AI_SCHEMA_VALIDATION_FAILED`) :
 *  le mode Structured Outputs strict d'OpenAI (`strict-output-schemas.ts`) envoie `null` pour tout
 *  champ non renseigné, jamais une clé absente — voir `business-analysis-items.schema.ts`, où ces
 *  mêmes champs sont désormais `.optional().nullable()`. Toutes les comparaisons ci-dessous
 *  traitent `null` et `undefined` de façon identique (opérateurs `==`/`!=` lâches), jamais une
 *  vérification stricte `=== undefined` qui laisserait passer `null` à tort. */
export type DeclaredProvenance = Readonly<{
  chunkSequence?: number | null | undefined;
  pageStart?: number | null | undefined;
  pageEnd?: number | null | undefined;
  sheetName?: string | null | undefined;
  sectionTitle?: string | null | undefined;
  citation?: string | null | undefined;
}>;

/** Provenance déclarée au niveau tender — désigne en plus le document source. */
export type DeclaredTenderProvenance = DeclaredProvenance & { documentId?: string | null | undefined };

/** Fait réellement connu d'UN chunk d'UN document (mission §"vérifier autant que possible") — issu
 *  du contrat public Extraction (`DocumentAnalysisChunk`, jamais reconstruit ni approximé). */
export type KnownChunk = Readonly<{
  content: string;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  sheetName?: string | undefined;
  sectionTitle?: string | undefined;
}>;

export type ChunksBySequence = ReadonlyMap<number, KnownChunk>;

/** Réduit une chaîne à sa forme comparée (accents/casse/espaces indifférents). */
const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function foldForComparison(text: string): string {
  return text
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** `true` si `needle` apparaît dans `haystack` une fois espaces/accents/casse neutralisés. */
function matchesAfterNormalization(needle: string, haystack: string): boolean {
  return haystack.length > 0 && foldForComparison(haystack).includes(foldForComparison(needle));
}

/** Une citation est acceptée si elle apparaît verbatim OU si elle correspond seulement après
 *  normalisation espaces/accents/casse (mission — correctif rejets "aléatoires" confirmés en prod :
 *  un chunk PDF conserve les retours à la ligne internes des lignes justifiées de la source, mais
 *  le modèle restitue le même passage comme une phrase continue — le texte cité reste réel, seule
 *  sa mise en forme diffère d'une génération à l'autre). La garantie anti-fabrication n'est jamais
 *  affaiblie : une citation qui ne correspond MÊME PAS après cette normalisation reste rejetée. */
function citationMatches(citation: string, haystack: string): boolean {
  return haystack.includes(citation) || matchesAfterNormalization(citation, haystack);
}

/** Explique un rejet de citation (désormais confirmé fabriquée/mal attribuée, la reformulation
 *  bénigne étant déjà tolérée par `citationMatches`) SANS jamais reproduire la citation ni le
 *  contenu du chunk — seulement leurs longueurs (mission §"jamais un extrait du corpus dans les
 *  champs d'erreur", voir `AnalysisJob.resultSummary`/`Generation.errorMessage` dans le schéma). */
function describeCitationMismatch(citation: string, haystack: string): string {
  return `citation (${citation.length} chars) does not match even after whitespace/accent normalization — likely a fabricated or misattributed citation (chunk content: ${haystack.length} chars)`;
}

/**
 * Validation déterministe de la provenance d'UN item, contre les chunks RÉELS d'UN document
 * (mission Sprint 4.2, correction "Validation déterministe de provenance") — un score de
 * confiance déclaré par le modèle n'est jamais suffisant seul ; cette fonction est la vérification
 * déterministe qui doit systématiquement s'exécuter avant toute persistance. Lève
 * `AiProvenanceValidationFailedError` (jamais silencieusement ignorée, jamais partiellement
 * persistée) dès qu'une affirmation de provenance ne peut pas être confirmée par le corpus réel :
 * - `chunkSequence` inexistant parmi les chunks connus du document,
 * - `citation` absente du contenu du chunk cité, même en tolérant une différence de mise en forme
 *   bénigne (espaces/sauts de ligne internes/accents/casse — voir `citationMatches`) : une citation
 *   qui ne correspond MÊME PAS après cette normalisation reste rejetée,
 * - `pageStart`/`pageEnd`/`sheetName`/`sectionTitle` qui CONTREDIT une valeur réellement connue du
 *   chunk cité (un champ non renseigné côté chunk n'est jamais une contradiction, seulement une
 *   information absente).
 *
 * Une citation fournie SANS `chunkSequence` est recherchée dans l'ensemble des chunks connus
 * (fallback tolérant : le modèle a parfois raison sans avoir su désigner le bon numéro de chunk),
 * mais reste rejetée si introuvable nulle part. Un item sans aucune ancre de provenance
 * (`chunkSequence`/`citation` tous deux absents — typiquement `isInferred: true`) n'est jamais
 * validé ici : rien à vérifier contre le corpus, mission §"jamais une déduction présentée comme
 * une citation directe" déjà garanti par le schéma Zod (`isInferred`).
 */
export function validateChunkProvenance(item: DeclaredProvenance, chunksBySequence: ChunksBySequence): void {
  if (item.chunkSequence == null) {
    if (item.citation != null) {
      const foundAnywhere = [...chunksBySequence.values()].some((chunk) => citationMatches(item.citation!, chunk.content));
      if (!foundAnywhere) {
        const haystack = [...chunksBySequence.values()].map((chunk) => chunk.content).join("\n");
        throw new AiProvenanceValidationFailedError({
          reason: `citation was not found in any known chunk of this document — ${describeCitationMismatch(item.citation!, haystack)}`,
        });
      }
    }
    return;
  }

  const chunk = chunksBySequence.get(item.chunkSequence);
  if (!chunk) {
    throw new AiProvenanceValidationFailedError({
      reason: `chunkSequence ${item.chunkSequence} does not exist among the real chunks of this document`,
    });
  }

  if (item.citation != null && !citationMatches(item.citation, chunk.content)) {
    throw new AiProvenanceValidationFailedError({
      reason: `citation was not found in the content of chunk ${item.chunkSequence} — ${describeCitationMismatch(item.citation, chunk.content)}`,
    });
  }
  if (item.pageStart != null && chunk.pageStart !== undefined && item.pageStart !== chunk.pageStart) {
    throw new AiProvenanceValidationFailedError({
      reason: `pageStart ${item.pageStart} contradicts the known page (${chunk.pageStart}) of chunk ${item.chunkSequence}`,
    });
  }
  if (item.pageEnd != null && chunk.pageEnd !== undefined && item.pageEnd !== chunk.pageEnd) {
    throw new AiProvenanceValidationFailedError({
      reason: `pageEnd ${item.pageEnd} contradicts the known page (${chunk.pageEnd}) of chunk ${item.chunkSequence}`,
    });
  }
  if (item.sheetName != null && chunk.sheetName !== undefined && item.sheetName !== chunk.sheetName) {
    throw new AiProvenanceValidationFailedError({
      reason: `sheetName "${item.sheetName}" contradicts the known sheet ("${chunk.sheetName}") of chunk ${item.chunkSequence}`,
    });
  }
  if (item.sectionTitle != null && chunk.sectionTitle !== undefined && item.sectionTitle !== chunk.sectionTitle) {
    throw new AiProvenanceValidationFailedError({
      reason: `sectionTitle "${item.sectionTitle}" contradicts the known section ("${chunk.sectionTitle}") of chunk ${item.chunkSequence}`,
    });
  }
}

/** Valide les 4 catégories d'UNE analyse documentaire (étape 1) contre les chunks réels du
 *  document analysé — toutes les provenances y désignent implicitement CE document, jamais un
 *  autre (le schéma document-level ne porte pas de `documentId`). */
export function validateDocumentAnalysisProvenance(output: DocumentAnalysisOutput, chunksBySequence: ChunksBySequence): void {
  for (const item of output.deadlines) validateChunkProvenance(item, chunksBySequence);
  for (const item of output.criteria) validateChunkProvenance(item, chunksBySequence);
  for (const item of output.requirements) validateChunkProvenance(item, chunksBySequence);
  for (const item of output.clauses) validateChunkProvenance(item, chunksBySequence);
}

/**
 * Valide les 6 catégories d'UNE consolidation Tender (étape 2) — chaque item désigne son propre
 * document source via `documentId` (mission §"chaque trouvaille doit indiquer le document
 * source"). `resolveChunks` n'est appelée QUE pour les documents réellement cités (jamais tous les
 * documents du tender), et mémoïsée pour ne jamais refaire le même appel Extraction deux fois au
 * sein d'une même validation.
 */
export async function validateTenderConsolidationProvenance(
  output: TenderConsolidationOutput,
  context: {
    /** Documents effectivement consolidés pour CE tender et CETTE organisation (mission
     *  §"documentId doit appartenir aux documents consolidés du tender et de l'organisation") —
     *  résolu par l'appelant via `BusinessAnalysisRepository.findLatestDocumentAnalyses`, jamais
     *  reconstruit ici. */
    consolidatedDocumentIds: ReadonlySet<string>;
    /** Résout les chunks RÉELS d'un document déjà validé comme appartenant au tender — jamais
     *  appelée pour un `documentId` inconnu (la vérification d'appartenance précède toujours cet
     *  appel). */
    resolveChunks: (documentId: string) => Promise<ChunksBySequence>;
  },
): Promise<void> {
  const chunkCache = new Map<string, ChunksBySequence>();

  async function chunksFor(documentId: string): Promise<ChunksBySequence> {
    const cached = chunkCache.get(documentId);
    if (cached) return cached;
    const resolved = await context.resolveChunks(documentId);
    chunkCache.set(documentId, resolved);
    return resolved;
  }

  async function check(item: DeclaredTenderProvenance): Promise<void> {
    if (item.documentId == null) {
      // Mission §"tender-wide et un-sourceable" (COMMON_RULES) — un fait sans document source est
      // légitime, mais alors JAMAIS accompagné d'un `chunkSequence` qu'aucun document ne peut
      // résoudre : une référence de chunk orpheline est une provenance fabriquée.
      if (item.chunkSequence != null) {
        throw new AiProvenanceValidationFailedError({
          reason: "chunkSequence was provided without a documentId to resolve it against",
        });
      }
      return;
    }

    if (!context.consolidatedDocumentIds.has(item.documentId)) {
      throw new AiProvenanceValidationFailedError({
        reason: `documentId ${item.documentId} does not belong to any document consolidated for this tender`,
      });
    }

    const chunks = await chunksFor(item.documentId);
    validateChunkProvenance(item, chunks);
  }

  for (const item of output.deadlines) await check(item);
  for (const item of output.criteria) await check(item);
  for (const item of output.requirements) await check(item);
  for (const item of output.clauses) await check(item);
  for (const item of output.risks) await check(item);
  for (const item of output.questions) await check(item);
}
