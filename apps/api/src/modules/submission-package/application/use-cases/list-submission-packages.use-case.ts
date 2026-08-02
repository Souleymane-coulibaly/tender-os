import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { toSubmissionPackageSummary, type SubmissionPackageSummary } from "../dtos";
import { SUBMISSION_PACKAGE_REPOSITORY, type SubmissionPackageRepository } from "../ports/submission-package.repository";

export type ListSubmissionPackagesQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class ListSubmissionPackagesUseCase {
  constructor(
    @Inject(SUBMISSION_PACKAGE_REPOSITORY) private readonly submissionPackageRepository: SubmissionPackageRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListSubmissionPackagesQuery): Promise<readonly SubmissionPackageSummary[]> {
    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });
    const items = await this.submissionPackageRepository.listForTender({ organizationId: query.organizationId, tenderId: query.tenderId });
    return items.map(toSubmissionPackageSummary);
  }
}
