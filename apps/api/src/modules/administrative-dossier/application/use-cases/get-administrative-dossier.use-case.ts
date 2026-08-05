import { Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { AdministrativeDossierSummary, toAdministrativeDossierSummary } from "../dtos";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

export type GetAdministrativeDossierQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

@Injectable()
export class GetAdministrativeDossierUseCase {
  constructor(private readonly accessService: AdministrativeDossierAccessService) {}

  async execute(query: GetAdministrativeDossierQuery): Promise<AdministrativeDossierSummary> {
    const { dossier } = await this.accessService.loadDossierByTenderId({
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      tenderId: query.tenderId,
      permission: ClientPermission.ReadAdministrativeDossier,
    });
    return toAdministrativeDossierSummary(dossier);
  }
}
