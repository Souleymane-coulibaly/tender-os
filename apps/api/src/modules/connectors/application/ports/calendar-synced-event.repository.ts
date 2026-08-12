import type { CalendarSyncedEvent } from "../../domain/calendar-synced-event.entity";

export interface CalendarSyncedEventRepository {
  /** Mission §34 — garde anti-duplication : une ligne non supprimée pour ce triplet exact bloque
   *  toute nouvelle création. */
  findActive(input: { organizationId: string; connectionId: string; tenderId: string; milestoneId?: string | undefined }): Promise<CalendarSyncedEvent | null>;
  save(event: CalendarSyncedEvent): Promise<void>;
}

export const CALENDAR_SYNCED_EVENT_REPOSITORY = Symbol("CALENDAR_SYNCED_EVENT_REPOSITORY");
