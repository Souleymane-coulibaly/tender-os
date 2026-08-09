import { Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import type { GeneratedDocumentSummary } from "../../../document-generation";
import type { AdministrativeFormReadiness } from "../../domain/administrative-form-readiness";
import { assertAdministrativeFormAccess } from "../policies/administrative-form-access.policy";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { OfficialFormGenerationRunner } from "../services/official-form-generation-runner.service";
import { Dc2OfficialFormResolver, type Dc2OperatorScope } from "../services/official-form-mappers/dc2-official-form-resolver.service";

const DC2_TEMPLATE_NAME = "DC2";

export type GetDc2FormFillReadinessQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string; scope: Dc2OperatorScope }>;

/**
 * V2 Sprint 11B — mission §13 "calcul PAR opérateur, jamais agrégé en un score opaque" : la
 * readiness d'UN DC2 concerne toujours un seul `Dc2OperatorScope` explicite (candidat OU un membre
 * précis), jamais une vue combinée. Aucun `GeneratedDocument` créé ici (même discipline que DC1/
 * DC4).
 */
@Injectable()
export class GetDc2FormFillReadinessUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    private readonly resolver: Dc2OfficialFormResolver,
  ) {}

  async execute(query: GetDc2FormFillReadinessQuery): Promise<AdministrativeFormReadiness> {
    await assertAdministrativeFormAccess(this.accessService, { organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole, clientPermission: ClientPermission.ReadAdministrativeDossier });
    const { readiness } = await this.resolver.resolve(query);
    return readiness;
  }
}

export type GenerateDc2FormFillCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string; scope: Dc2OperatorScope; requestId?: string | undefined }>;

/**
 * V2 Sprint 11B — mission §14 "chaque opérateur peut générer son propre DOCX, révisions
 * indépendantes" : `subjectId` (résolu par le résolveur : `"candidate"` ou `"member:<memberId>"`)
 * garantit une lignée `GeneratedDocument` strictement séparée par opérateur — jamais partagée,
 * jamais contaminée entre deux membres du même groupement (mission §54 "aucune contamination").
 */
@Injectable()
export class GenerateDc2FormFillUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    private readonly resolver: Dc2OfficialFormResolver,
    private readonly runner: OfficialFormGenerationRunner,
  ) {}

  async execute(command: GenerateDc2FormFillCommand): Promise<GeneratedDocumentSummary> {
    const clientAccountId = await assertAdministrativeFormAccess(this.accessService, { organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole, clientPermission: ClientPermission.GenerateAdministrativeForm, requireGenerateOrgPermission: true });

    const { data, subjectId, operatorLabel } = await this.resolver.resolve({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, scope: command.scope });

    return this.runner.run({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: command.tenderId,
      clientAccountId,
      templateName: DC2_TEMPLATE_NAME,
      subjectId,
      documentTitle: `DC2 - Declaration du candidat (${operatorLabel})`,
      data,
      auditAction: "AdministrativeFormGenerated",
      outboxEventTypeCompleted: "AdministrativeFormGenerated",
      outboxEventTypeFailed: "AdministrativeFormGenerationFailed",
      auditMetadata: { documentType: "DC2", scope: command.scope },
      requestId: command.requestId,
    });
  }
}
