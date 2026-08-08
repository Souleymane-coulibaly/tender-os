import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { TENDER_ACTIVITY_REPOSITORY, type TenderActivityRecord, type TenderActivityRepository } from "../ports/tender-activity.repository";

export type GetTenderActivityQuery = Readonly<{ organizationId: string; tenderId: string; actorId: string; actorRole: string; cursor?: string | undefined; limit: number }>;
export type GetTenderActivityResult = Readonly<{ items: readonly TenderActivityRecord[]; nextCursor: string | null }>;

/** V2 Sprint 7 §32/§51 — projection de LECTURE utilisateur, jamais l'AuditLog technique exposé
 *  directement. Pagination stable (`createdAt DESC, id DESC`), jamais de doublon entre pages. */
@Injectable()
export class GetTenderActivityUseCase {
  constructor(
    @Inject(TENDER_ACTIVITY_REPOSITORY) private readonly repository: TenderActivityRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetTenderActivityQuery): Promise<GetTenderActivityResult> {
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadWorkspace,
    });

    return this.repository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId, cursor: query.cursor, limit: query.limit });
  }
}
