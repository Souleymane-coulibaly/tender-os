import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { TenderLotNotFoundError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderLotSummary, type TenderLotSummary } from "../dtos";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type UpdateTenderLotCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  lotId: string;
  actorRole: string;
  title?: string | undefined;
  description?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
}>;

@Injectable()
export class UpdateTenderLotUseCase {
  constructor(
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateTenderLotCommand): Promise<TenderLotSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const lot = await this.lotRepository.findById({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotId: command.lotId,
    });

    if (!lot) {
      throw new TenderLotNotFoundError();
    }

    lot.update(
      {
        title: command.title,
        description: command.description,
        estimatedAmount: command.estimatedAmount,
        currency: command.currency,
      },
      this.clock.now(),
    );

    await this.lotRepository.save(lot);

    return toTenderLotSummary(lot);
  }
}

export type DeleteTenderLotCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  lotId: string;
  actorRole: string;
}>;

@Injectable()
export class DeleteTenderLotUseCase {
  constructor(@Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository) {}

  async execute(command: DeleteTenderLotCommand): Promise<void> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const lot = await this.lotRepository.findById({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotId: command.lotId,
    });

    if (!lot) {
      throw new TenderLotNotFoundError();
    }

    await this.lotRepository.delete({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotId: command.lotId,
    });
  }
}
