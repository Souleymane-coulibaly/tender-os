import { Injectable } from "@nestjs/common";
import { SubcontractorPermissionMissingError } from "../../domain/errors";
import { roleHasSubcontractorPermission, type SubcontractorPermission } from "../../domain/subcontractor-permission";

/**
 * Point d'entrée UNIQUE pour vérifier une permission sur le répertoire des sous-traitants — pas de
 * `ClientAccount` à charger ici (répertoire organisationnel, mission §6), `OrganizationMembershipGuard`
 * a déjà vérifié l'appartenance à l'organisation en amont (HTTP) ; ce service vérifie uniquement le
 * rôle.
 */
@Injectable()
export class SubcontractorAccessService {
  assertPermission(input: { actorRole: string; permission: SubcontractorPermission }): void {
    if (!roleHasSubcontractorPermission(input.actorRole, input.permission)) {
      throw new SubcontractorPermissionMissingError();
    }
  }
}
