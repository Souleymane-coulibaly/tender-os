import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { GetCurrentUserUseCase } from "../../../identity";
import { AssertClientAccessUseCase, ClientAccountNotFoundError, ClientPermission, ClientPermissionMissingError } from "../../../client-portfolio";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../../../memberships";
import { GetTenderUseCase } from "../../../tenders";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";

export type ListWorkspaceMembersQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
}>;

export type WorkspaceMemberView = { userId: string; email: string; displayName: string };

/**
 * V2 Sprint 7 (correctif audit Codex P1-01) — `GET /organization-memberships` (utilisé initialement
 * par la page Workspace pour peupler les listes déroulantes participant/assignee/mention/reviewer)
 * exige `OrganizationPermission.MemberList`, réservée à OWNER/ORGANIZATION_ADMIN (bible §4) : un
 * CONTRIBUTOR affecté à ce Tender — qui a pourtant `TenderPermission.ManageWorkspace` — se voyait
 * bloqué (403) rien que pour OUVRIR l'onglet Workspace.
 *
 * Ce use case expose un répertoire équivalent, gouverné par `assertWorkspaceAccess` (ReadWorkspace,
 * palier Tender/Client) — MAIS filtre chaque membre par son PROPRE accès réel au client de CE Tender
 * (même vérification que celle appliquée à l'ajout d'un participant, `AddTenderParticipantUseCase` /
 * `resolveWorkspaceClientAccess`, sans le volet bypass administratif : lister n'est jamais une action
 * tracée, jamais un motif pour exposer plus que nécessaire) et son statut de membership actif —
 * jamais l'ensemble brut de l'organisation. Sans ce filtre, un CONTRIBUTOR autorisé sur le Client A
 * verrait apparaître dans le répertoire des membres rattachés UNIQUEMENT au Client B/C de la même
 * organisation (mission §5/§63 : l'isolation same-org cross-client s'applique à CHAQUE ressource
 * enfant du Workspace, pas seulement aux participants/tâches déjà couverts).
 */
@Injectable()
export class ListWorkspaceMembersUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListWorkspaceMembersQuery): Promise<WorkspaceMemberView[]> {
    const tender = await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadWorkspace,
    });

    const occurredAt = this.clock.now();
    const page = await this.membershipRepository.listByOrganization({ organizationId: query.organizationId, limit: 100 });
    const activeMembers = page.items.filter((membership) => membership.isEffectivelyActive(occurredAt));

    const eligibility = await Promise.all(
      activeMembers.map(async (membership) => {
        try {
          await this.assertClientAccessUseCase.execute({
            organizationId: query.organizationId,
            clientAccountId: tender.clientAccountId,
            actorId: membership.userId,
            actorRole: membership.role,
            permission: ClientPermission.ReadWorkspace,
          });
          return membership;
        } catch (error) {
          if (error instanceof ClientAccountNotFoundError || error instanceof ClientPermissionMissingError) {
            return null;
          }
          throw error;
        }
      }),
    );
    const eligibleMembers = eligibility.filter((membership): membership is NonNullable<typeof membership> => membership !== null);

    return Promise.all(
      eligibleMembers.map(async (membership) => {
        const user = await this.getCurrentUserUseCase.execute({ userId: membership.userId });
        return { userId: user.id, email: user.email, displayName: user.displayName };
      }),
    );
  }
}
