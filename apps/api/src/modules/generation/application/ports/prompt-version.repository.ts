import type { PromptVersion } from "../../domain/prompt-version.entity";

export interface PromptVersionRepository {
  findById(input: { organizationId: string; versionId: string }): Promise<PromptVersion | null>;
  findActive(input: { organizationId: string; promptTemplateId: string }): Promise<PromptVersion | null>;
  listByTemplate(input: { organizationId: string; promptTemplateId: string }): Promise<readonly PromptVersion[]>;
  nextVersionNumber(input: { organizationId: string; promptTemplateId: string }): Promise<number>;
  create(version: PromptVersion): Promise<void>;
  save(version: PromptVersion): Promise<void>;
  /** Archive l'éventuelle version ACTIVE précédente et active `version`, dans la même transaction
   *  courte — même motif que `PrismaRoutingPolicyRepository.activateAtomically` (ai-benchmark,
   *  Sprint 5.2). Lève `PromptVersionActivationConflictError` en cas de violation de l'index unique
   *  partiel `prompt_versions_org_template_active_key` (course de concurrence). */
  activateAtomically(version: PromptVersion): Promise<void>;
}

export const PROMPT_VERSION_REPOSITORY = Symbol("GENERATION_PROMPT_VERSION_REPOSITORY");
