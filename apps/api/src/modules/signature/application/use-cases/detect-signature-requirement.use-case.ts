import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import type { SignatureLevel } from "../../domain/signature-level";
import { SignatureRequirement, type SignatureRequirementConfidence } from "../../domain/signature-requirement";
import { toSignatureRequirementSummary, type SignatureRequirementSummary } from "../dtos";
import { SIGNATURE_REQUIREMENT_REPOSITORY, type SignatureRequirementRepository } from "../ports/signature-requirement.repository";

export type DetectSignatureRequirementCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  documentRef: string;
  sourceDce?: string | undefined;
  pageOrSection?: string | undefined;
  mandatory: boolean;
  momentText?: string | undefined;
  format?: string | undefined;
  levelExpected?: SignatureLevel | undefined;
  certificateRequirement?: string | undefined;
  signatoryExpected?: string | undefined;
  confidence?: SignatureRequirementConfidence | undefined;
}>;

/**
 * Mission Sprint 8A §36/§40 — enregistre une exigence de signature détectée. Reste DETECTED tant
 * qu'un humain ne l'a pas confirmée (mission "une détection automatique ne doit pas devenir
 * obligatoire sans confirmation humaine") — la détection elle-même (assistée ou manuelle) alimente
 * simplement cette liste, jamais une contrainte bloquante avant confirmation.
 */
@Injectable()
export class DetectSignatureRequirementUseCase {
  constructor(
    @Inject(SIGNATURE_REQUIREMENT_REPOSITORY) private readonly signatureRequirementRepository: SignatureRequirementRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: DetectSignatureRequirementCommand): Promise<SignatureRequirementSummary> {
    const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageExport,
    });

    const requirement = SignatureRequirement.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      tenderId: command.tenderId,
      documentRef: command.documentRef,
      sourceDce: command.sourceDce,
      pageOrSection: command.pageOrSection,
      mandatory: command.mandatory,
      momentText: command.momentText,
      format: command.format,
      levelExpected: command.levelExpected,
      certificateRequirement: command.certificateRequirement,
      signatoryExpected: command.signatoryExpected,
      confidence: command.confidence,
      createdBy: command.actorId,
      occurredAt: this.clock.now(),
    });

    await this.signatureRequirementRepository.create(requirement);
    return toSignatureRequirementSummary(requirement);
  }
}
