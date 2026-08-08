import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { TENDER_PARTICIPANT_REPOSITORY, type TenderParticipantRepository } from "../ports/tender-participant.repository";
import { toTenderParticipantSummary, type TenderParticipantSummary } from "../dtos";

export type ListTenderParticipantsQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
}>;

@Injectable()
export class ListTenderParticipantsUseCase {
  constructor(
    @Inject(TENDER_PARTICIPANT_REPOSITORY) private readonly participantRepository: TenderParticipantRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListTenderParticipantsQuery): Promise<TenderParticipantSummary[]> {
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadWorkspace,
    });

    const participants = await this.participantRepository.listActiveByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });
    return participants.map(toTenderParticipantSummary);
  }
}
