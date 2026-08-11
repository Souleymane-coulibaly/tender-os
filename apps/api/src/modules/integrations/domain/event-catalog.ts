/**
 * Mission §21/§22/§23 — catalogue gouverné d'événements webhook publics, convention
 * `resource.action` (mission §23). Ce catalogue est INDÉPENDANT du nommage interne
 * `OutboxEvent.eventType` (historiquement PascalCase — "TenderCreated", "TaskCreated" — établi
 * depuis Sprint 1/7/5, jamais renommé ici : le risque de régression sur des dizaines de use-cases
 * déjà livrés serait disproportionné pour ce Sprint). `resolvePublicEventType` fait le pont entre
 * les deux, une SEULE fois, dans ce module.
 *
 * Événements réellement démontrables retenus pour ce Sprint (mission §22 "adapter uniquement aux
 * événements réellement démontrables") : tender.created (déjà émis), task.created/task.completed
 * (déjà émis, Workspace Sprint 7), opportunity.go_decided/no_go_decided (déjà émis, Sprint 5),
 * response_package.validated / response_package.generated (mission §135 scénario A — NOUVEAUX
 * producteurs ajoutés ce Sprint, voir validate-response-package-version.use-case.ts et
 * generate-response-package-zip.use-case.ts). document.uploaded / checklist.updated /
 * technical_memo.validated / pricing.validated / deadline.approaching : différés — voir rapport
 * Sprint 16 §"éléments différés" (deadline.approaching exige un scheduler fiable qui n'existe pas,
 * mission §89).
 */
export const GOVERNED_WEBHOOK_EVENT_TYPES = [
  "tender.created",
  "task.created",
  "task.completed",
  "opportunity.go_decided",
  "opportunity.no_go_decided",
  "response_package.validated",
  "response_package.generated",
  // V2 Sprint 17 (Veille & détection des marchés, mission §65) — nouveaux producteurs, convention
  // dot-notation directement (comme response_package.* ci-dessus), aucune traduction PascalCase.
  "external_tender.created",
  "external_tender.updated",
  "saved_search.match_found",
  "notification.created",
] as const;
export type GovernedWebhookEventType = (typeof GOVERNED_WEBHOOK_EVENT_TYPES)[number];

export function isGovernedWebhookEventType(value: string): value is GovernedWebhookEventType {
  return (GOVERNED_WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

function readStringField(payload: unknown, field: string): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

/** Résout le type public à partir du type interne — `undefined` si cet événement interne n'a
 *  volontairement AUCUN équivalent public (mission §26 "ne pas envoyer plus que nécessaire" —
 *  la majorité des OutboxEvent internes, ex. évènements AiSuggestion ou DocumentGeneration, ne
 *  sont jamais destinés à un tiers). Pure, sans I/O. */
export function resolvePublicEventType(internalEventType: string, payload: unknown): GovernedWebhookEventType | undefined {
  switch (internalEventType) {
    case "TenderCreated":
      return "tender.created";
    case "TaskCreated":
      return "task.created";
    case "TaskCompleted":
      return "task.completed";
    case "GoNoGoDecisionRecorded": {
      const decision = readStringField(payload, "decision");
      return decision === "NO_GO" ? "opportunity.no_go_decided" : "opportunity.go_decided";
    }
    case "response_package.validated":
      return "response_package.validated";
    case "response_package.generated":
      return "response_package.generated";
    case "external_tender.created":
      return "external_tender.created";
    case "external_tender.updated":
      return "external_tender.updated";
    case "saved_search.match_found":
      return "saved_search.match_found";
    case "notification.created":
      return "notification.created";
    default:
      return undefined;
  }
}

/** `clientAccountId` porté directement par le payload producteur, s'il existe (mission §79
 *  "Webhook Filter Client" — appliqué avant émission). */
export function extractClientAccountIdHint(payload: unknown): string | undefined {
  return readStringField(payload, "clientAccountId");
}

/** Fallback quand le payload ne porte que `tenderId` (TaskCreated/TaskCompleted/
 *  GoNoGoDecisionRecorded) — l'application layer résout ensuite `tenderId -> clientAccountId` via
 *  `TENDER_REPOSITORY` (jamais fait ici, ce module reste sans I/O). */
export function extractTenderIdHint(payload: unknown): string | undefined {
  return readStringField(payload, "tenderId");
}
