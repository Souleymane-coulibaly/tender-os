import { Inject, Injectable } from "@nestjs/common";
import { GetCurrentUserUseCase } from "../../../identity";
import { ClientPermission } from "../../domain/client-permission";
import { ClientAccountNotFoundError } from "../../domain/errors";
import { toClientAssignmentSummary, type ClientAssignmentSummary } from "../dtos";
import { CLIENT_ACCOUNT_REPOSITORY, type ClientAccountRepository } from "../ports/client-account.repository";
import { CLIENT_ASSIGNMENT_REPOSITORY, type ClientAssignmentRepository } from "../ports/client-assignment.repository";
import { AssertClientAccessUseCase } from "./assert-client-access.use-case";

export type ListClientAssignmentsQuery = Readonly<{ organizationId: string; clientAccountId: string; actorId: string; actorRole: string }>;

export type ClientAssignmentView = ClientAssignmentSummary & { user: { id: string; email: string; displayName: string } };

/** Mission §"afficher... l'email, le rôle d'organisation, le rôle client, la date d'affectation" —
 *  enrichit chaque affectation avec les informations utilisateur (même motif que
 *  `ListOrganizationMembersUseCase`, jamais une seconde logique divergente pour résoudre un
 *  utilisateur). */
@Injectable()
export class ListClientAssignmentsUseCase {
  constructor(
    @Inject(CLIENT_ACCOUNT_REPOSITORY) private readonly clientAccountRepository: ClientAccountRepository,
    @Inject(CLIENT_ASSIGNMENT_REPOSITORY) private readonly clientAssignmentRepository: ClientAssignmentRepository,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListClientAssignmentsQuery): Promise<ClientAssignmentView[]> {
    const client = await this.clientAccountRepository.findById(query);
    if (!client) {
      throw new ClientAccountNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({ ...query, permission: ClientPermission.Read });

    const assignments = await this.clientAssignmentRepository.listByClient(query);

    return Promise.all(
      assignments.map(async (assignment) => {
        const user = await this.getCurrentUserUseCase.execute({ userId: assignment.userId });
        return { ...toClientAssignmentSummary(assignment), user: { id: user.id, email: user.email, displayName: user.displayName } };
      }),
    );
  }
}
