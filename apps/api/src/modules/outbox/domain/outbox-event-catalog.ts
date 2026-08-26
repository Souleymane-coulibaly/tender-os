/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-3A : SOURCE OF TRUTH unique des événements Outbox.
 *
 * POURQUOI CE FICHIER EXISTE — l'audit FIX-3 a établi que 48 des 78 types produits n'ont
 * aucun handler interne, et que l'architecture n'offrait AUCUN moyen d'exprimer « cet événement
 * n'exige aucun handler interne ». Faute de pouvoir le dire, `CompositeOutboxEventDispatcher` les
 * traite tous comme des échecs : 5 tentatives puis DEAD_LETTER, soit environ 520 réclamations
 * parasites mesurées en base. Ce catalogue nomme l'intention de chaque événement ; FIX-3B s'en
 * servira pour que le publisher cesse de traiter une trace de domaine comme une erreur.
 *
 * FIX-3A EST PUREMENT DÉCLARATIF. Aucun comportement runtime ne change : un événement AUDIT_ONLY
 * sans handler continue, à ce stade, d'échouer avec `NoOutboxHandlerRegisteredError`. C'est
 * volontaire — la sémantique ne bougera qu'en FIX-3B.
 *
 * `destinations` est un TABLEAU, jamais un enum exclusif : un même événement peut légitimement
 * devoir déclencher un effet interne ET une livraison webhook. Le dispatcher actuel ne l'autorise
 * pas (`Map<eventType, handler>`, un seul handler par type), mais cette limite d'implémentation ne
 * doit pas dicter la modélisation métier du catalogue.
 *
 * Sémantique des destinations :
 *  - `INTERNAL`         : un effet interne TenderOS est attendu, un handler interne DOIT exister.
 *  - `EXTERNAL_WEBHOOK` : l'événement alimente le catalogue gouverné de l'Integration Hub.
 *  - `AUDIT_ONLY`       : trace de domaine. L'effet métier est DÉJÀ réalisé au moment de
 *                          l'émission ; aucun traitement interne ou externe n'est attendu.
 *  - `LEGACY`           : conservé pour compatibilité, en attente de l'Audit Legacy final.
 *
 * `productReviewSuggested` distingue « aucun effet attendu » de « aucun effet décidé à ce jour » :
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
  /** Types publics `resource.action` exposes par l'Integration Hub. TABLEAU : un meme evenement
   *  interne peut resoudre vers plusieurs types publics selon son payload (voir
   *  `resolvePublicEventType`, cas `GoNoGoDecisionRecorded`). */
  publicWebhookTypes?: readonly string[];
  /** Voir la note sur `productReviewSuggested` en tête de fichier. */
  productReviewSuggested?: true;
  description?: string;
}>;

export const OUTBOX_EVENT_CATALOG: readonly OutboxEventCatalogEntry[] = [
  {
    eventType: "AdministrativeFormGenerated",
    module: "administrative-dossier",
    destinations: ["AUDIT_ONLY"],
    description: "Résultat : la révision porte déjà le statut COMPLETED au moment de l'émission.",
  },
  {
    eventType: "AdministrativeFormGenerationFailed",
    module: "administrative-dossier",
    destinations: ["AUDIT_ONLY"],
    description: "Résultat : la révision porte déjà un statut d'échec au moment de l'émission.",
  },
  {
    eventType: "AiResponseCompleted",
    module: "chat",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "AiResponseFailed",
    module: "chat",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "AiSuggestionAccepted",
    module: "ai-suggestion",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "AiSuggestionCreated",
    module: "ai-suggestion",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "AiSuggestionModified",
    module: "ai-suggestion",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "AiSuggestionRejected",
    module: "ai-suggestion",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "AoCreditBalanceLow",
    module: "billing",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "ApprovalApproved",
    module: "workspace",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "ApprovalChangesRequested",
    module: "workspace",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "ApprovalRejected",
    module: "workspace",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "ApprovalRequested",
    module: "workspace",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "CandidateCompanyProfileUpdated",
    module: "company-profile",
    destinations: ["AUDIT_ONLY"],
    description: "Trace de domaine. Aucun index/projection à rafraîchir n'existe.",
  },
  {
    eventType: "CandidateDocumentExpiringSoon",
    module: "company-profile",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "ChatMessageSent",
    module: "chat",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "ChecklistDocumentAttached",
    module: "checklist-intelligence",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "ChecklistItemCreated",
    module: "tenders",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "ChecklistItemMarkedNotApplicable",
    module: "tenders",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "ChecklistItemValidated",
    module: "tenders",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "CommentAdded",
    module: "workspace",
    destinations: ["AUDIT_ONLY"],
    productReviewSuggested: true,
    description: "Trace de domaine. La notification utilisateur passe par UserMentioned.",
  },
  {
    eventType: "ConversationCreated",
    module: "chat",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "DceAnalysisCompleted",
    module: "analysis",
    destinations: ["AUDIT_ONLY"],
    description: "Résultat d'une analyse déjà terminée.",
  },
  {
    eventType: "DceAnalysisFailed",
    module: "analysis",
    destinations: ["AUDIT_ONLY"],
    description: "Résultat d'une analyse déjà en échec.",
  },
  {
    eventType: "DceAnalysisRequested",
    module: "analysis",
    destinations: ["AUDIT_ONLY"],
    description: "Trace de la demande d'analyse. La commande réelle passe par InProcessAnalysisDispatcher, jamais par cet événement.",
  },
  {
    eventType: "DceAnalysisStarted",
    module: "analysis",
    destinations: ["AUDIT_ONLY"],
    description: "Trace de début de traitement, émise par le job lui-même.",
  },
  {
    eventType: "DocumentGenerationCompleted",
    module: "document-generation",
    destinations: ["AUDIT_ONLY"],
    description: "Résultat : la révision est déjà COMPLETED au moment de l'émission.",
  },
  {
    eventType: "DocumentGenerationFailed",
    module: "document-generation",
    destinations: ["AUDIT_ONLY"],
    description: "Résultat : la révision est déjà en échec au moment de l'émission.",
  },
  {
    eventType: "DocumentVersionAdded",
    module: "documents",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "GoNoGoDecisionRecorded",
    module: "opportunity",
    destinations: ["EXTERNAL_WEBHOOK"],
    publicWebhookTypes: ["opportunity.go_decided", "opportunity.no_go_decided"],
  },
  {
    eventType: "GoNoGoReportGenerated",
    module: "opportunity",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "KnowledgeEntryArchived",
    module: "knowledge-base",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "KnowledgeEntryCreated",
    module: "knowledge-base",
    destinations: ["AUDIT_ONLY"],
    description: "Trace de domaine. Aucun index/RAG à rafraîchir n'existe dans le produit.",
  },
  {
    eventType: "KnowledgeEntryPromotedFromTender",
    module: "knowledge-base",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "KnowledgeEntryValidated",
    module: "knowledge-base",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "KnowledgeVersionCreated",
    module: "knowledge-base",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "MembershipCreated",
    module: "memberships",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "OpportunityArchived",
    module: "opportunity",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "OpportunityCreated",
    module: "opportunity",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "OpportunityPromotedToTender",
    module: "opportunity",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "OpportunityQuickScoreComputed",
    module: "opportunity",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "OpportunityRestored",
    module: "opportunity",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "OpportunityStatusChanged",
    module: "opportunity",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "PassConsumedForTender",
    module: "billing",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "PassPurchaseConfirmed",
    module: "billing",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "PassReservationReleased",
    module: "billing",
    destinations: ["AUDIT_ONLY"],
    productReviewSuggested: true,
    description: "Compensation d'une opération échouée (E1.3), déjà appliquée.",
  },
  {
    eventType: "PassReservedForTender",
    module: "billing",
    destinations: ["AUDIT_ONLY"],
    productReviewSuggested: true,
    description: "Allocation interne (E1.2/E1.3) déjà appliquée. La notification commerciale porte sur la consommation.",
  },
  {
    eventType: "QuotaThresholdReached",
    module: "billing",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "SubcontractorProfileArchived",
    module: "subcontractors",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "SubcontractorProfileCreated",
    module: "subcontractors",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "SubscriptionCanceled",
    module: "billing",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "SubscriptionPaymentFailed",
    module: "billing",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "SubscriptionPlanChanged",
    module: "billing",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "SubscriptionPlanChangedQuotaRecheck",
    module: "billing",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "TaskAssigned",
    module: "workspace",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "TaskCompleted",
    module: "workspace",
    destinations: ["EXTERNAL_WEBHOOK"],
    publicWebhookTypes: ["task.completed"],
  },
  {
    eventType: "TaskCreated",
    module: "workspace",
    destinations: ["EXTERNAL_WEBHOOK"],
    publicWebhookTypes: ["task.created"],
  },
  {
    eventType: "TaskUpdated",
    module: "workspace",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "TenderAbandoned",
    module: "tenders",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "TenderArchived",
    module: "tenders",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "TenderCandidateChanged",
    module: "tenders",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "TenderCandidateCompanyChanged",
    module: "tenders",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "TenderCreated",
    module: "tenders",
    destinations: ["EXTERNAL_WEBHOOK"],
    publicWebhookTypes: ["tender.created"],
  },
  {
    eventType: "TenderDeadlineChanged",
    module: "tenders",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "TenderLotCreated",
    module: "tenders",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "TenderParticipantAdded",
    module: "workspace",
    destinations: ["AUDIT_ONLY"],
    productReviewSuggested: true,
    description: "Trace de domaine.",
  },
  {
    eventType: "TenderParticipantRemoved",
    module: "workspace",
    destinations: ["AUDIT_ONLY"],
    productReviewSuggested: true,
    description: "Trace de domaine.",
  },
  {
    eventType: "TenderStatusChanged",
    module: "tenders",
    destinations: ["AUDIT_ONLY"],
  },
  {
    eventType: "TrialConverted",
    module: "billing",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "TrialEndingSoon",
    module: "billing",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "TrialStarted",
    module: "billing",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "UserMentioned",
    module: "workspace",
    destinations: ["INTERNAL"],
  },
  {
    eventType: "external_tender.created",
    module: "market-watch",
    destinations: ["EXTERNAL_WEBHOOK"],
    publicWebhookTypes: ["external_tender.created"],
  },
  {
    eventType: "external_tender.updated",
    module: "market-watch",
    destinations: ["EXTERNAL_WEBHOOK"],
    publicWebhookTypes: ["external_tender.updated"],
  },
  {
    eventType: "notification.created",
    module: "market-watch",
    destinations: ["EXTERNAL_WEBHOOK"],
    publicWebhookTypes: ["notification.created"],
  },
  {
    eventType: "response_package.generated",
    module: "response-package",
    destinations: ["EXTERNAL_WEBHOOK"],
    publicWebhookTypes: ["response_package.generated"],
  },
  {
    eventType: "response_package.validated",
    module: "response-package",
    destinations: ["EXTERNAL_WEBHOOK"],
    publicWebhookTypes: ["response_package.validated"],
  },
  {
    eventType: "saved_search.match_found",
    module: "market-watch",
    destinations: ["EXTERNAL_WEBHOOK"],
    publicWebhookTypes: ["saved_search.match_found"],
  },
];

/** Union littérale des types catalogués — permet à FIX-3C d'exiger une couverture exhaustive
 *  sans recourir à un `Record<string, …>` qui accepterait n'importe quelle chaîne. */
export type CatalogedOutboxEventType = (typeof OUTBOX_EVENT_CATALOG)[number]["eventType"];

const BY_EVENT_TYPE: ReadonlyMap<string, OutboxEventCatalogEntry> = new Map(OUTBOX_EVENT_CATALOG.map((e) => [e.eventType, e]));

/** Retourne `undefined` pour un type NON catalogué — jamais une valeur par défaut. Un type inconnu
 *  est un défaut de gouvernance, jamais un AUDIT_ONLY implicite (FIX-3B décidera de son runtime). */
export function findOutboxEventCatalogEntry(eventType: string): OutboxEventCatalogEntry | undefined {
  return BY_EVENT_TYPE.get(eventType);
}

export function hasDestination(eventType: string, destination: OutboxEventDestination): boolean {
  return findOutboxEventCatalogEntry(eventType)?.destinations.includes(destination) ?? false;
}

/** Destinations impliquant qu'un consommateur du process TenderOS doit reellement traiter
 *  l'evenement. `EXTERNAL_WEBHOOK` en fait partie : la livraison webhook est declenchee par un
 *  handler Outbox interne (bridge Integration Hub), jamais par un mecanisme separe. */
const DELIVERED_DESTINATIONS: readonly OutboxEventDestination[] = ["INTERNAL", "EXTERNAL_WEBHOOK"];

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-3B. Regle de livraison DERIVEE du catalogue, jamais une
 * seconde liste manuelle : c'est ce que le runtime consulte pour savoir si l'absence de handler est
 * une erreur (`INTERNAL`/`EXTERNAL_WEBHOOK`) ou l'etat normal (`AUDIT_ONLY`/`LEGACY`).
 *
 * `undefined` pour un type NON catalogue — l'appelant doit alors lever une erreur de gouvernance,
 * jamais supposer qu'aucune livraison n'est requise.
 */
export function requiresInternalDelivery(eventType: string): boolean | undefined {
  const entry = findOutboxEventCatalogEntry(eventType);
  if (!entry) return undefined;
  return entry.destinations.some((d) => DELIVERED_DESTINATIONS.includes(d));
}
