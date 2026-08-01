import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { GenerationPermission } from "../../domain/generation-permission";
import { assertHasGenerationPermission } from "../policies/generation-authorization.policy";
import { PromptVersionNotFoundError } from "../../domain/errors";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { toPromptVersionSummary, type PromptVersionSummary } from "../dtos";
import { PROMPT_VERSION_REPOSITORY, type PromptVersionRepository } from "../ports/prompt-version.repository";

export type ActivatePromptVersionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  versionId: string;
  requestId?: string | undefined;
}>;

/** Activation atomique (mission Sprint 6 §"activation atomique") — délègue l'archivage de
 *  l'éventuelle version ACTIVE précédente + l'activation de celle-ci à
 *  `PromptVersionRepository.activateAtomically`, une transaction courte protégée par l'index
 *  unique partiel `WHERE status = 'ACTIVE'` — une activation concurrente perdante reçoit
 *  `PromptVersionActivationConflictError`, jamais une fenêtre où deux versions sont ACTIVE en
 *  même temps (même motif que `ActivateRoutingPolicyUseCase`, Sprint 5.2). */
@Injectable()
export class ActivatePromptVersionUseCase {
  constructor(
    @Inject(PROMPT_VERSION_REPOSITORY) private readonly promptVersionRepository: PromptVersionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ActivatePromptVersionCommand): Promise<PromptVersionSummary> {
    assertHasGenerationPermission(command.actorRole, GenerationPermission.ManagePromptTemplates);

    const version = await this.promptVersionRepository.findById({ organizationId: command.organizationId, versionId: command.versionId });
    if (!version) {
      throw new PromptVersionNotFoundError();
    }

    version.activate(this.clock.now());
    await this.promptVersionRepository.activateAtomically(version);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "prompt_version.activated",
      resourceType: "prompt_version",
      resourceId: version.id,
      requestId: command.requestId,
      metadata: { promptTemplateId: version.promptTemplateId, version: version.version },
    });

    return toPromptVersionSummary(version);
  }
}
