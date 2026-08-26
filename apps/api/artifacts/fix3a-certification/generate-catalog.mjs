/** FIX-3A — génère le fichier catalogue TypeScript à partir de la matrice recoupée. */
import { readFileSync, writeFileSync } from "node:fs";

const m = JSON.parse(readFileSync("artifacts/fix3a-certification/matrix.json", "utf8"));

/** Événements dont l'absence d'effet interne résulte d'une énumération PRODUIT explicite
 *  (mission Sprint 18 §15/§21/§50/§51 pour workspace, Sprint 22 §53/§54 pour billing) : classés
 *  AUDIT_ONLY aujourd'hui, mais signalés pour revue produit — les promouvoir en INTERNAL serait une
 *  décision métier, jamais une correction technique. */
const PRODUCT_REVIEW = new Set([
  "PassReservedForTender",
  "PassReservationReleased",
  "CommentAdded",
  "TenderParticipantAdded",
  "TenderParticipantRemoved",
]);

const DESCRIPTIONS = {
  DceAnalysisRequested: "Trace de la demande d'analyse. La commande réelle passe par InProcessAnalysisDispatcher, jamais par cet événement.",
  DceAnalysisStarted: "Trace de début de traitement, émise par le job lui-même.",
  DceAnalysisCompleted: "Résultat d'une analyse déjà terminée.",
  DceAnalysisFailed: "Résultat d'une analyse déjà en échec.",
  AdministrativeFormGenerated: "Résultat : la révision porte déjà le statut COMPLETED au moment de l'émission.",
  AdministrativeFormGenerationFailed: "Résultat : la révision porte déjà un statut d'échec au moment de l'émission.",
  DocumentGenerationCompleted: "Résultat : la révision est déjà COMPLETED au moment de l'émission.",
  DocumentGenerationFailed: "Résultat : la révision est déjà en échec au moment de l'émission.",
  KnowledgeEntryCreated: "Trace de domaine. Aucun index/RAG à rafraîchir n'existe dans le produit.",
  CandidateCompanyProfileUpdated: "Trace de domaine. Aucun index/projection à rafraîchir n'existe.",
  PassReservedForTender: "Allocation interne (E1.2/E1.3) déjà appliquée. La notification commerciale porte sur la consommation.",
  PassReservationReleased: "Compensation d'une opération échouée (E1.3), déjà appliquée.",
  CommentAdded: "Trace de domaine. La notification utilisateur passe par UserMentioned.",
  TenderParticipantAdded: "Trace de domaine.",
  TenderParticipantRemoved: "Trace de domaine.",
};

function destinationsFor(row) {
  if (row.internalHandler?.includes("/integrations/")) return ["EXTERNAL_WEBHOOK"];
  if (row.internalHandler) return ["INTERNAL"];
  return ["AUDIT_ONLY"];
}

const entries = m.rows.map((r) => {
  const dest = destinationsFor(r);
  const parts = [
    `    eventType: ${JSON.stringify(r.eventType)},`,
    `    module: ${JSON.stringify(r.module)},`,
    `    destinations: [${dest.map((d) => JSON.stringify(d)).join(", ")}],`,
  ];
  // `GoNoGoDecisionRecorded` alimente DEUX types publics selon la decision portee par le payload
  // (`resolvePublicEventType` : un `case` a bloc, que le pont regex ne capte pas — d'ou ce cas
  // explicite). Le champ est donc un TABLEAU, jamais un singleton.
  const publics = r.eventType === "GoNoGoDecisionRecorded" ? ["opportunity.go_decided", "opportunity.no_go_decided"] : r.webhookPublicType ? [r.webhookPublicType] : [];
  if (publics.length > 0) parts.push(`    publicWebhookTypes: [${publics.map((p) => JSON.stringify(p)).join(", ")}],`);
  if (PRODUCT_REVIEW.has(r.eventType)) parts.push("    productReviewSuggested: true,");
  const desc = DESCRIPTIONS[r.eventType];
  if (desc) parts.push(`    description: ${JSON.stringify(desc)},`);
  return `  {\n${parts.join("\n")}\n  },`;
});

const header = `/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-3A : SOURCE OF TRUTH unique des événements Outbox.
 *
 * POURQUOI CE FICHIER EXISTE — l'audit FIX-3 a établi que ${m.totals.withoutInternalHandler} des ${m.totals.produced} types produits n'ont
 * aucun handler interne, et que l'architecture n'offrait AUCUN moyen d'exprimer « cet événement
 * n'exige aucun handler interne ». Faute de pouvoir le dire, \`CompositeOutboxEventDispatcher\` les
 * traite tous comme des échecs : 5 tentatives puis DEAD_LETTER, soit environ 520 réclamations
 * parasites mesurées en base. Ce catalogue nomme l'intention de chaque événement ; FIX-3B s'en
 * servira pour que le publisher cesse de traiter une trace de domaine comme une erreur.
 *
 * FIX-3A EST PUREMENT DÉCLARATIF. Aucun comportement runtime ne change : un événement AUDIT_ONLY
 * sans handler continue, à ce stade, d'échouer avec \`NoOutboxHandlerRegisteredError\`. C'est
 * volontaire — la sémantique ne bougera qu'en FIX-3B.
 *
 * \`destinations\` est un TABLEAU, jamais un enum exclusif : un même événement peut légitimement
 * devoir déclencher un effet interne ET une livraison webhook. Le dispatcher actuel ne l'autorise
 * pas (\`Map<eventType, handler>\`, un seul handler par type), mais cette limite d'implémentation ne
 * doit pas dicter la modélisation métier du catalogue.
 *
 * Sémantique des destinations :
 *  - \`INTERNAL\`         : un effet interne TenderOS est attendu, un handler interne DOIT exister.
 *  - \`EXTERNAL_WEBHOOK\` : l'événement alimente le catalogue gouverné de l'Integration Hub.
 *  - \`AUDIT_ONLY\`       : trace de domaine. L'effet métier est DÉJÀ réalisé au moment de
 *                          l'émission ; aucun traitement interne ou externe n'est attendu.
 *  - \`LEGACY\`           : conservé pour compatibilité, en attente de l'Audit Legacy final.
 *
 * \`productReviewSuggested\` distingue « aucun effet attendu » de « aucun effet décidé à ce jour » :
 * ces événements sont AUDIT_ONLY parce qu'une énumération produit explicite les a exclus du
 * périmètre des notifications (mission Sprint 18 §15/§21/§50/§51 pour workspace, Sprint 22 §53/§54
 * pour billing), et non parce qu'ils seraient dépourvus de sens utilisateur. Les promouvoir en
 * INTERNAL relèverait d'une décision métier, jamais d'une correction technique.
 */

export const OUTBOX_EVENT_DESTINATIONS = ["INTERNAL", "EXTERNAL_WEBHOOK", "AUDIT_ONLY", "LEGACY"] as const;
export type OutboxEventDestination = (typeof OUTBOX_EVENT_DESTINATIONS)[number];

export type OutboxEventCatalogEntry = Readonly<{
  eventType: string;
  /** Module propriétaire du producteur — jamais du consommateur. */
  module: string;
  destinations: readonly OutboxEventDestination[];
  /** Types publics \`resource.action\` exposes par l'Integration Hub. TABLEAU : un meme evenement
   *  interne peut resoudre vers plusieurs types publics selon son payload (voir
   *  \`resolvePublicEventType\`, cas \`GoNoGoDecisionRecorded\`). */
  publicWebhookTypes?: readonly string[];
  /** Voir la note sur \`productReviewSuggested\` en tête de fichier. */
  productReviewSuggested?: true;
  description?: string;
}>;

export const OUTBOX_EVENT_CATALOG: readonly OutboxEventCatalogEntry[] = [
`;

const footer = `];

/** Union littérale des types catalogués — permet à FIX-3C d'exiger une couverture exhaustive
 *  sans recourir à un \`Record<string, …>\` qui accepterait n'importe quelle chaîne. */
export type CatalogedOutboxEventType = (typeof OUTBOX_EVENT_CATALOG)[number]["eventType"];

const BY_EVENT_TYPE: ReadonlyMap<string, OutboxEventCatalogEntry> = new Map(OUTBOX_EVENT_CATALOG.map((e) => [e.eventType, e]));

/** Retourne \`undefined\` pour un type NON catalogué — jamais une valeur par défaut. Un type inconnu
 *  est un défaut de gouvernance, jamais un AUDIT_ONLY implicite (FIX-3B décidera de son runtime). */
export function findOutboxEventCatalogEntry(eventType: string): OutboxEventCatalogEntry | undefined {
  return BY_EVENT_TYPE.get(eventType);
}

export function hasDestination(eventType: string, destination: OutboxEventDestination): boolean {
  return findOutboxEventCatalogEntry(eventType)?.destinations.includes(destination) ?? false;
}

/** Destinations impliquant qu'un consommateur du process TenderOS doit reellement traiter
 *  l'evenement. \`EXTERNAL_WEBHOOK\` en fait partie : la livraison webhook est declenchee par un
 *  handler Outbox interne (bridge Integration Hub), jamais par un mecanisme separe. */
const DELIVERED_DESTINATIONS: readonly OutboxEventDestination[] = ["INTERNAL", "EXTERNAL_WEBHOOK"];

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-3B. Regle de livraison DERIVEE du catalogue, jamais une
 * seconde liste manuelle : c'est ce que le runtime consulte pour savoir si l'absence de handler est
 * une erreur (\`INTERNAL\`/\`EXTERNAL_WEBHOOK\`) ou l'etat normal (\`AUDIT_ONLY\`/\`LEGACY\`).
 *
 * \`undefined\` pour un type NON catalogue — l'appelant doit alors lever une erreur de gouvernance,
 * jamais supposer qu'aucune livraison n'est requise.
 */
export function requiresInternalDelivery(eventType: string): boolean | undefined {
  const entry = findOutboxEventCatalogEntry(eventType);
  if (!entry) return undefined;
  return entry.destinations.some((d) => DELIVERED_DESTINATIONS.includes(d));
}
`;

writeFileSync("src/modules/outbox/domain/outbox-event-catalog.ts", header + entries.join("\n") + "\n" + footer);
console.log("catalogue écrit :", m.rows.length, "entrées");
const byDest = {};
for (const r of m.rows) {
  const d = destinationsFor(r).join("+");
  byDest[d] = (byDest[d] ?? 0) + 1;
}
console.log("par destination :", byDest);
