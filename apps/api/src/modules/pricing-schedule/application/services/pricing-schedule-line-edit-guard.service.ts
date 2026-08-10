import { Inject, Injectable } from "@nestjs/common";
import { PricingScheduleLineNotFoundError, PricingScheduleVersionValidatedError } from "../../domain/errors";
import type { PricingScheduleLine } from "../../domain/pricing-schedule-line.entity";
import type { PricingScheduleVersion } from "../../domain/pricing-schedule-version.entity";
import { PRICING_SCHEDULE_LINE_REPOSITORY, type PricingScheduleLineRepository } from "../ports/pricing-schedule-line.repository";
import { PRICING_SCHEDULE_VERSION_REPOSITORY, type PricingScheduleVersionRepository } from "../ports/pricing-schedule-version.repository";

/**
 * Garde partagée avant toute mutation de ligne (prix simple, détail de coût, commentaire) —
 * factorisée pour ne jamais dupliquer 3 fois la même vérification (mission "ne jamais dupliquer du
 * code") : anti-IDOR (la ligne doit réellement appartenir AU chiffrage demandé, jamais acceptée
 * telle quelle depuis l'URL) + immutabilité post-validation (mission §45 — une version VALIDATED
 * refuse toute mutation de ses lignes, une nouvelle version doit être créée à la place).
 */
@Injectable()
export class PricingScheduleLineEditGuard {
  constructor(
    @Inject(PRICING_SCHEDULE_LINE_REPOSITORY) private readonly lineRepository: PricingScheduleLineRepository,
    @Inject(PRICING_SCHEDULE_VERSION_REPOSITORY) private readonly versionRepository: PricingScheduleVersionRepository,
  ) {}

  async loadEditableLine(input: {
    organizationId: string;
    pricingScheduleId: string;
    pricingScheduleLineId: string;
  }): Promise<{ line: PricingScheduleLine; version: PricingScheduleVersion }> {
    const line = await this.lineRepository.findById({ organizationId: input.organizationId, pricingScheduleLineId: input.pricingScheduleLineId });
    if (!line) {
      throw new PricingScheduleLineNotFoundError();
    }

    const version = await this.versionRepository.findById({ organizationId: input.organizationId, pricingScheduleVersionId: line.pricingScheduleVersionId });
    // Anti-IDOR — une ligne dont la version ne pointe pas vers CE chiffrage n'appartient pas au
    // périmètre demandé, jamais acceptée silencieusement (ex : `pricingScheduleId` dans l'URL vs.
    // `pricingScheduleLineId` d'un AUTRE chiffrage, potentiellement d'un autre candidat).
    if (!version || version.pricingScheduleId !== input.pricingScheduleId) {
      throw new PricingScheduleLineNotFoundError();
    }
    if (version.isValidated) {
      throw new PricingScheduleVersionValidatedError();
    }

    return { line, version };
  }
}
