import { Inject, Injectable } from "@nestjs/common";
import { PlatformCapability } from "../../domain/platform-capability";
import type { PlatformRole } from "../../domain/platform-role";
import {
  PLATFORM_DEAD_LETTER_EVENT_READER,
  type PlatformDeadLetterEventPage,
  type PlatformDeadLetterEventReader,
} from "../ports/platform-dead-letter-event.port";
import { assertHasCapability } from "../policies/platform-authorization.policy";

export type ListPlatformDeadLetterEventsQuery = Readonly<{
  actorRole: PlatformRole;
  cursor?: string | undefined;
  limit: number;
  organizationId?: string | undefined;
}>;

export type ListPlatformDeadLetterEventsResult = PlatformDeadLetterEventPage;

/** Mission §Sprint 21 PARTIE F/PARTIE Q (runbook "Outbox backlog") — même capacité que
 *  `GetPlatformMetricsUseCase` (`MetricsRead`) : une vue technique/opérationnelle, jamais une
 *  nouvelle capacité pour un seul endpoint de diagnostic supplémentaire. */
@Injectable()
export class ListPlatformDeadLetterEventsUseCase {
  constructor(
    @Inject(PLATFORM_DEAD_LETTER_EVENT_READER) private readonly deadLetterEventReader: PlatformDeadLetterEventReader,
  ) {}

  async execute(query: ListPlatformDeadLetterEventsQuery): Promise<ListPlatformDeadLetterEventsResult> {
    assertHasCapability(query.actorRole, PlatformCapability.MetricsRead);

    return this.deadLetterEventReader.list({ cursor: query.cursor, limit: query.limit, organizationId: query.organizationId });
  }
}
