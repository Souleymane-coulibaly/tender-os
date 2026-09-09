import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { CompanyReferenceNotFoundError } from "../../domain/errors";
import type { CompanyReferenceDocumentRecord, CompanyReferenceRecord } from "../dtos";
import {
  COMPANY_REFERENCE_DOCUMENT_REPOSITORY,
  COMPANY_REFERENCE_REPOSITORY,
  type CompanyReferenceDocumentRepository,
  type CompanyReferenceRepository,
  type Patch,
} from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";

export type CreateCompanyReferenceCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  actorId: string;
  actorRole: string;
  projectName: string;
  referenceClientName?: string | undefined;
  sector?: string | undefined;
  description?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  amountValue?: string | undefined;
  amountCurrency?: string | undefined;
  companyRole?: string | undefined;
  lotsOrServices?: string | undefined;
  skillsOrTechnologies?: string | undefined;
  results?: string | undefined;
  contactName?: string | undefined;
  contactEmail?: string | undefined;
  contactPhone?: string | undefined;
  confidentiality?: string | undefined;
}>;

export type UpdateCompanyReferenceCommand = Readonly<{
  organizationId: string;
  clientAccountId: string;
  referenceId: string;
  actorId: string;
  actorRole: string;
  patch: Patch<Omit<CreateCompanyReferenceCommand, "organizationId" | "clientAccountId" | "actorId" | "actorRole">> & { status?: string | undefined };
}>;

@Injectable()
export class ListCompanyReferencesUseCase {
  constructor(
    @Inject(COMPANY_REFERENCE_REPOSITORY) private readonly repository: CompanyReferenceRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyReferenceRecord[]> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });
    return this.repository.list(input);
  }
}




@Injectable()
export class ListCompanyReferenceDocumentsUseCase {
  constructor(
    @Inject(COMPANY_REFERENCE_DOCUMENT_REPOSITORY) private readonly documentRepository: CompanyReferenceDocumentRepository,
    @Inject(COMPANY_REFERENCE_REPOSITORY) private readonly referenceRepository: CompanyReferenceRepository,
    private readonly accessService: CompanyProfileAccessService,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; referenceId: string; actorId: string; actorRole: string }): Promise<CompanyReferenceDocumentRecord[]> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });

    // Checkpoint TENDEROS-2.1-CCV2-I.2 — la reference est RESOLUE DANS LE SCOPE DU CLIENT avant
    // toute lecture. Cette route listait auparavant les pieces par `companyReferenceId` seul, borne
    // a la seule organisation : un acteur autorise sur le client A pouvait donc lire les pieces
    // d'une reference du client B en fournissant simplement son identifiant. La frontiere
    // d'organisation tenait, la frontiere de CLIENT non — alors que c'est exactement ce que
    // `ClientAssignment` promet. Meme famille que la regression P0 corrigee a l'audit Codex sur
    // l'archivage bancaire, cote LECTURE cette fois.
    //
    // `findById` etant desormais borne aux lignes Legacy (`candidateCompanyId IS NULL`), une
    // reference dont `CandidateCompany` est la source de verite repond 404 ici : elle se lit par sa
    // route candidate. Le 404 — jamais 403 — preserve la convention anti-enumeration du module.
    const reference = await this.referenceRepository.findById({
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      id: input.referenceId,
    });
    if (!reference) {
      throw new CompanyReferenceNotFoundError();
    }

    return this.documentRepository.list({ organizationId: input.organizationId, companyReferenceId: input.referenceId });
  }
}
