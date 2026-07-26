import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { DuplicateTenderLotNumberError } from "../../domain/errors";
import { TenderLot } from "../../domain/tender-lot.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderLotSummary, type TenderLotSummary } from "../dtos";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type CreateTenderLotCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorRole: string;
  lotNumber: string;
  title: string;
  description?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
}>;

@Injectable()
export class CreateTenderLotUseCase {
  constructor(
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateTenderLotCommand): Promise<TenderLotSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const existing = await this.lotRepository.listByTender({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
    });

    if (existing.some((lot) => lot.lotNumber === command.lotNumber)) {
      throw new DuplicateTenderLotNumberError();
    }

    const lot = TenderLot.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotNumber: command.lotNumber,
      title: command.title,
      description: command.description,
      estimatedAmount: command.estimatedAmount,
      currency: command.currency,
      occurredAt: this.clock.now(),
    });

    await this.lotRepository.save(lot);

    return toTenderLotSummary(lot);
  }
}
