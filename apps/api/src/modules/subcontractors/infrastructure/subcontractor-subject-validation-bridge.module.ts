import { Global, Injectable, Module } from "@nestjs/common";
import {
  ChecklistSubcontractorSubjectNotFoundError,
  SUBCONTRACTOR_SUBJECT_VALIDATOR,
  type SubcontractorSubjectValidator,
} from "../../tenders";
import { SubcontractorsModule } from "../subcontractors.module";
import { GetSubcontractorProfileUseCase } from "../application/use-cases/subcontractor-profile.use-cases";
import { SubcontractorProfileStatus } from "../domain/subcontractor-profile-status";
import { SubcontractorProfileNotFoundError } from "../domain/errors";

/** Adaptateur mince (mission "le port vit dans le consommateur") — délègue ENTIÈREMENT à
 *  `GetSubcontractorProfileUseCase` (existence + organizationId déjà vérifiés par ce use case,
 *  jamais une seconde requête Prisma dupliquant cette règle) et n'ajoute que la vérification de
 *  statut propre à ce port (archivé = retrait définitif, jamais utilisable comme sujet checklist).
 *  `SubcontractorProfileNotFoundError` (cross-tenant OU inexistant, même convention
 *  anti-énumération que le reste du dépôt) est traduite vers l'erreur du port CONSOMMATEUR
 *  (`ChecklistSubcontractorSubjectNotFoundError`, module `tenders`) — jamais l'erreur du module
 *  `subcontractors` qui fuiterait à travers la frontière. */
@Injectable()
class SubcontractorSubjectValidatorAdapter implements SubcontractorSubjectValidator {
  constructor(private readonly getSubcontractorProfileUseCase: GetSubcontractorProfileUseCase) {}

  async assertValid(input: { organizationId: string; subcontractorProfileId: string; actorRole: string }): Promise<void> {
    let profile;
    try {
      profile = await this.getSubcontractorProfileUseCase.execute({
        organizationId: input.organizationId,
        subcontractorProfileId: input.subcontractorProfileId,
        actorRole: input.actorRole,
      });
    } catch (error) {
      if (error instanceof SubcontractorProfileNotFoundError) {
        throw new ChecklistSubcontractorSubjectNotFoundError();
      }
      throw error;
    }
    if (profile.status === SubcontractorProfileStatus.Archived) {
      throw new ChecklistSubcontractorSubjectNotFoundError();
    }
  }
}

/**
 * Pont `@Global()` entre Tenders (qui définit le port `SubcontractorSubjectValidator`, correctif
 * audit Codex P2) et Subcontractors (qui implémente la validation réelle via
 * `GetSubcontractorProfileUseCase`) — même motif exact que `ExtractionTriggerBridgeModule`
 * (Extraction ↔ DCE/Documents) et `RoutingPolicyBridgeModule` (ai-benchmark ↔ generation/analysis) :
 * relie deux modules sans jamais faire dépendre Tenders de Subcontractors (import direct interdit —
 * Subcontractors dépend déjà de Documents, qui dépend déjà de Tenders : un cycle Nest). Si ce pont
 * n'est pas importé par `AppModule`, `CreateChecklistItemUseCase` reçoit `undefined` pour ce token
 * (`@Optional()`) et rejette explicitement toute création portant un `subjectSubcontractorProfileId`
 * (fail-closed — jamais un contournement silencieux d'une vérification de sécurité) ; en production
 * ce pont DOIT être importé.
 */
@Global()
@Module({
  imports: [SubcontractorsModule],
  providers: [{ provide: SUBCONTRACTOR_SUBJECT_VALIDATOR, useClass: SubcontractorSubjectValidatorAdapter }],
  exports: [SUBCONTRACTOR_SUBJECT_VALIDATOR],
})
export class SubcontractorSubjectValidationBridgeModule {}
