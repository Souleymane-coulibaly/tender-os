export type PlatformDeadLetterEventRecord = Readonly<{
  id: string;
  organizationId: string;
  outboxEventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  failureReason: string;
  attemptCount: number;
  movedAt: string;
}>;

export type PlatformDeadLetterEventPage = Readonly<{
  items: PlatformDeadLetterEventRecord[];
  nextCursor: string | null;
}>;

/**
 * Sprint 21 (hardening) — mission PARTIE F/PARTIE G (visibilité dead-letter Outbox).
 * Lecture cross-tenant de `dead_letter_events` — réservée à Platform Administration, même motif
 * que `PlatformAuditLogReader` (lecture cross-org déjà interdite à tout autre module). `payload`
 * (le corps brut de l'événement, potentiellement volumineux et porteur de données métier) est
 * volontairement EXCLU de cette vue liste — suffisant pour trier/diagnostiquer un incident
 * (organisation, type d'événement, agrégat, raison d'échec, nombre de tentatives, date) sans
 * exposer un dump JSON dans une liste ; une vue détail dédiée reste une extension future si
 * réellement nécessaire (mission "ne pas complexifier au-delà du besoin réel").
 */
export interface PlatformDeadLetterEventReader {
  list(input: { cursor?: string | undefined; limit: number; organizationId?: string | undefined }): Promise<PlatformDeadLetterEventPage>;
}

export const PLATFORM_DEAD_LETTER_EVENT_READER = Symbol("PLATFORM_DEAD_LETTER_EVENT_READER");
