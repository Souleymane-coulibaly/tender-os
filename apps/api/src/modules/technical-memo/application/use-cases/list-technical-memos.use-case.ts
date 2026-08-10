import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import type { TechnicalMemo } from "../../domain/technical-memo.aggregate";
import { assertTechnicalMemoTenderAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { TECHNICAL_MEMO_REPOSITORY, type TechnicalMemoRepository } from "../ports/technical-memo.repository";

export type ListTechnicalMemosQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class ListTechnicalMemosUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_REPOSITORY) private readonly technicalMemoRepository: TechnicalMemoRepository,
    private readonly accessService: TechnicalMemoAccessService,
  ) {}

  async execute(query: ListTechnicalMemosQuery): Promise<readonly TechnicalMemo[]> {
    await assertTechnicalMemoTenderAccess(this.accessService, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadTechnicalMemo,
    });
    return this.technicalMemoRepository.list({ organizationId: query.organizationId, tenderId: query.tenderId });
  }
}
