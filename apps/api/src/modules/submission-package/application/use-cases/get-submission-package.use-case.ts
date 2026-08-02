import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { SubmissionPackageNotFoundError } from "../../domain/errors";
import { toSubmissionPackageSummary, type SubmissionPackageSummary } from "../dtos";
import { SUBMISSION_PACKAGE_REPOSITORY, type SubmissionPackageRepository } from "../ports/submission-package.repository";

export type GetSubmissionPackageQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; packageId: string }>;

@Injectable()
export class GetSubmissionPackageUseCase {
  constructor(
    @Inject(SUBMISSION_PACKAGE_REPOSITORY) private readonly submissionPackageRepository: SubmissionPackageRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetSubmissionPackageQuery): Promise<SubmissionPackageSummary> {
    const found = await this.submissionPackageRepository.findById({ organizationId: query.organizationId, packageId: query.packageId });
    if (!found) {
      throw new SubmissionPackageNotFoundError();
    }
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: found.pkg.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });
    return toSubmissionPackageSummary(found);
  }
}
