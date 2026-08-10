import { Inject, Injectable } from "@nestjs/common";
import { GetCompanyProfileUseCase, type CompanyProfileSummary } from "../../../company-profile";
import { ListTenderClausesUseCase, ListTenderCriteriaUseCase, ListTenderRequirementsUseCase } from "../../../analysis";
import { GetKnowledgeVersionUseCase, SearchKnowledgeBaseUseCase } from "../../../knowledge-base";
import { TechnicalMemoCitationSourceType, TechnicalMemoRequirementFindingType } from "../../domain/enums";
import type { TechnicalMemo } from "../../domain/technical-memo.aggregate";
import type { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";
import { TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY, type TechnicalMemoSectionRequirementRepository } from "../ports/technical-memo-section-requirement.repository";
import type { KnownTechnicalMemoReference, KnownTechnicalMemoReferences } from "./technical-memo-citation-validator";

const FINDINGS_PAGE_LIMIT = 200;
const KNOWLEDGE_RESULT_LIMIT = 8;
const MAX_KNOWLEDGE_EXCERPT_LENGTH = 1_500;

export type TechnicalMemoSectionContext = Readonly<{ sectionBlock: string; contextBlock: string; knownReferences: KnownTechnicalMemoReferences }>;

/**
 * Assemble le `SectionGenerationContext` (mission §32) pour UNE section — jamais tout le DCE/toute
 * la Knowledge Base (mission §33 "limiter le contexte") : seules les exigences DÉJÀ mappées à cette
 * section (`TechnicalMemoSectionRequirement`, mission §21) et une recherche Knowledge Base bornée
 * (`KNOWLEDGE_RESULT_LIMIT`) sur le titre/la consigne de la section sont incluses. Même discipline
 * anti-injection que `ChatContextAssembler` (Sprint 9) : chaque source est enregistrée sous un jeton
 * `[TYPE:...]` stable AVANT d'être écrite dans le bloc texte, jamais reconstruite après coup.
 *
 * Sécurité (mission §77/§78) : la recherche Knowledge Base réutilise `SearchKnowledgeBaseUseCase`
 * avec `validatedOnly: true` FORCÉ et un scope strictement dérivé de `memo.clientAccountId` (client
 * du mémoire + GLOBAL uniquement) — jamais un autre client, jamais une entrée non validée.
 * `GetCompanyProfileUseCase` est appelé avec ce MÊME `clientAccountId`, jamais un autre.
 */
@Injectable()
export class TechnicalMemoSectionContextAssembler {
  constructor(
    @Inject(TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY) private readonly requirementRepository: TechnicalMemoSectionRequirementRepository,
    private readonly listTenderRequirementsUseCase: ListTenderRequirementsUseCase,
    private readonly listTenderCriteriaUseCase: ListTenderCriteriaUseCase,
    private readonly listTenderClausesUseCase: ListTenderClausesUseCase,
    private readonly searchKnowledgeBaseUseCase: SearchKnowledgeBaseUseCase,
    private readonly getKnowledgeVersionUseCase: GetKnowledgeVersionUseCase,
    private readonly getCompanyProfileUseCase: GetCompanyProfileUseCase,
  ) {}

  async assemble(input: { organizationId: string; actorId: string; actorRole: string; memo: TechnicalMemo; section: TechnicalMemoSection }): Promise<TechnicalMemoSectionContext> {
    const known = new Map<string, KnownTechnicalMemoReference>();
    const register = (sourceRef: string, reference: KnownTechnicalMemoReference): string => {
      known.set(sourceRef, reference);
      return sourceRef;
    };

    const sectionBlock = [
      `Titre : ${input.section.title}`,
      `Catégorie : ${input.section.category}`,
      `Consigne extraite du modèle : ${input.section.instructionText ?? "(aucune)"}`,
      `Limite de longueur : ${input.section.wordLimit ? `${input.section.wordLimit} mots maximum` : "(aucune)"}`,
    ].join("\n");

    const findingsBlock = await this.buildFindingsBlock(input, register);
    const candidateBlock = await this.buildCandidateBlock(input, register);
    const knowledgeBlock = await this.buildKnowledgeBlock(input, register);

    const contextBlock = [findingsBlock, candidateBlock, knowledgeBlock].join("\n\n");

    return { sectionBlock, contextBlock, knownReferences: known };
  }

  private async buildFindingsBlock(
    input: { organizationId: string; actorId: string; actorRole: string; memo: TechnicalMemo; section: TechnicalMemoSection },
    register: (sourceRef: string, reference: KnownTechnicalMemoReference) => string,
  ): Promise<string> {
    const links = await this.requirementRepository.listBySectionId({ organizationId: input.organizationId, technicalMemoSectionId: input.section.id });
    if (links.length === 0) return "## EXIGENCES DCE LIÉES\n(aucune)";

    const findingQuery = { organizationId: input.organizationId, tenderId: input.memo.tenderId, actorId: input.actorId, actorRole: input.actorRole, limit: FINDINGS_PAGE_LIMIT, offset: 0 };
    const [requirements, criteria, clauses] = await Promise.all([
      this.listTenderRequirementsUseCase.execute(findingQuery),
      this.listTenderCriteriaUseCase.execute(findingQuery),
      this.listTenderClausesUseCase.execute(findingQuery),
    ]);

    const linkedIds = new Set(links.map((link) => `${link.findingType}:${link.findingId}`));
    const lines: string[] = [];

    for (const requirement of requirements.items) {
      if (!linkedIds.has(`${TechnicalMemoRequirementFindingType.Requirement}:${requirement.id}`)) continue;
      const sourceRef = register(`FIND:REQUIREMENT:${requirement.id}`, {
        sourceType: TechnicalMemoCitationSourceType.Finding,
        findingType: TechnicalMemoRequirementFindingType.Requirement,
        findingId: requirement.id,
        label: requirement.label,
        content: requirement.label,
      });
      lines.push(`- [${sourceRef}] (exigence${requirement.isMandatory ? " obligatoire" : ""}) ${requirement.label}`);
    }
    for (const criterion of criteria.items) {
      if (!linkedIds.has(`${TechnicalMemoRequirementFindingType.Criterion}:${criterion.id}`)) continue;
      const sourceRef = register(`FIND:CRITERION:${criterion.id}`, {
        sourceType: TechnicalMemoCitationSourceType.Finding,
        findingType: TechnicalMemoRequirementFindingType.Criterion,
        findingId: criterion.id,
        label: criterion.name,
        content: criterion.name,
      });
      lines.push(`- [${sourceRef}] (critère de notation) ${criterion.name}`);
    }
    for (const clause of clauses.items) {
      if (!linkedIds.has(`${TechnicalMemoRequirementFindingType.Clause}:${clause.id}`)) continue;
      const sourceRef = register(`FIND:CLAUSE:${clause.id}`, {
        sourceType: TechnicalMemoCitationSourceType.Finding,
        findingType: TechnicalMemoRequirementFindingType.Clause,
        findingId: clause.id,
        label: clause.summary,
        content: clause.summary,
      });
      lines.push(`- [${sourceRef}] (clause) ${clause.summary}`);
    }

    return `## EXIGENCES DCE LIÉES\n${lines.length > 0 ? lines.join("\n") : "(aucune)"}`;
  }

  private async buildCandidateBlock(
    input: { organizationId: string; actorId: string; actorRole: string; memo: TechnicalMemo; section: TechnicalMemoSection },
    register: (sourceRef: string, reference: KnownTechnicalMemoReference) => string,
  ): Promise<string> {
    let profile: CompanyProfileSummary;
    try {
      profile = await this.getCompanyProfileUseCase.execute({
        organizationId: input.organizationId,
        clientAccountId: input.memo.clientAccountId,
        actorId: input.actorId,
        actorRole: input.actorRole,
      });
    } catch {
      return "## DONNÉES CANDIDAT\n(profil indisponible)";
    }

    const lines: string[] = [];

    if (profile.legalIdentity) {
      const sourceRef = register("CANDIDATE:legalIdentity", {
        sourceType: TechnicalMemoCitationSourceType.CandidateField,
        candidateFieldPath: "legalIdentity",
        label: "Identité légale de l'entreprise",
        content: JSON.stringify(profile.legalIdentity),
      });
      lines.push(`- [${sourceRef}] Identité légale : ${JSON.stringify(profile.legalIdentity)}`);
    }
    if (profile.humanResources.length > 0) {
      const content = JSON.stringify(profile.humanResources);
      const sourceRef = register("CANDIDATE:humanResources", { sourceType: TechnicalMemoCitationSourceType.CandidateField, candidateFieldPath: "humanResources", label: "Moyens humains", content });
      lines.push(`- [${sourceRef}] Moyens humains : ${content}`);
    }
    if (profile.materialResources.length > 0) {
      const content = JSON.stringify(profile.materialResources);
      const sourceRef = register("CANDIDATE:materialResources", { sourceType: TechnicalMemoCitationSourceType.CandidateField, candidateFieldPath: "materialResources", label: "Moyens techniques", content });
      lines.push(`- [${sourceRef}] Moyens techniques : ${content}`);
    }
    if (profile.certifications.length > 0) {
      const content = JSON.stringify(profile.certifications);
      const sourceRef = register("CANDIDATE:certifications", { sourceType: TechnicalMemoCitationSourceType.CandidateField, candidateFieldPath: "certifications", label: "Certifications", content });
      lines.push(`- [${sourceRef}] Certifications : ${content}`);
    }
    if (profile.insurances.length > 0) {
      const content = JSON.stringify(profile.insurances);
      const sourceRef = register("CANDIDATE:insurances", { sourceType: TechnicalMemoCitationSourceType.CandidateField, candidateFieldPath: "insurances", label: "Assurances", content });
      lines.push(`- [${sourceRef}] Assurances : ${content}`);
    }

    // Mission §26 — TenderOS peut proposer/sélectionner les références les plus pertinentes, mais
    // doit expliquer pourquoi (secteur/technologie/taille similaires) et JAMAIS en inventer une.
    for (const reference of profile.references) {
      const content = [reference.projectName, reference.sector, reference.description, reference.results].filter(Boolean).join(" — ");
      const sourceRef = register(`REF:${reference.id}`, {
        sourceType: TechnicalMemoCitationSourceType.Reference,
        companyReferenceId: reference.id,
        label: reference.projectName,
        content,
      });
      lines.push(`- [${sourceRef}] Référence "${reference.projectName}" (secteur : ${reference.sector ?? "non renseigné"}) : ${content}`);
    }

    return `## DONNÉES CANDIDAT (entreprise réelle, jamais à inventer)\n${lines.length > 0 ? lines.join("\n") : "(aucune donnée candidat disponible)"}`;
  }

  private async buildKnowledgeBlock(
    input: { organizationId: string; actorId: string; actorRole: string; memo: TechnicalMemo; section: TechnicalMemoSection },
    register: (sourceRef: string, reference: KnownTechnicalMemoReference) => string,
  ): Promise<string> {
    const query = `${input.section.title} ${input.section.instructionText ?? ""}`.trim();
    // `validatedOnly: true` FORCÉ (jamais un paramètre client) — mission §23/§24 "une entrée
    // READY-mais-non-validée ne doit JAMAIS être utilisée automatiquement comme source de confiance"
    // (même règle que Sprint 9 Chat).
    const baseQuery = { organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, query, validatedOnly: true, limit: KNOWLEDGE_RESULT_LIMIT, offset: 0 };

    const [clientScoped, global] = await Promise.all([
      this.searchKnowledgeBaseUseCase.execute({ ...baseQuery, clientAccountId: input.memo.clientAccountId }),
      this.searchKnowledgeBaseUseCase.execute({ ...baseQuery, clientAccountId: "GLOBAL" }),
    ]);

    const byEntryId = new Map([...clientScoped.items, ...global.items].map((item) => [item.knowledgeEntryId, item]));
    const lines: string[] = [];
    for (const item of byEntryId.values()) {
      // Mission §85 — fige la VERSION réelle utilisée au lancement (jamais "latest" recalculé
      // après coup) : résout `activeVersionNumber` en un `knowledgeEntryVersionId` concret via
      // `GetKnowledgeVersionUseCase`, même motif que Chat (`resolveKnowledgeEntryVersionId`).
      let knowledgeEntryVersionId: string | undefined;
      try {
        const version = await this.getKnowledgeVersionUseCase.execute({
          organizationId: input.organizationId,
          knowledgeEntryId: item.knowledgeEntryId,
          versionNumber: item.activeVersionNumber,
          actorId: input.actorId,
          actorRole: input.actorRole,
        });
        knowledgeEntryVersionId = version.id;
      } catch {
        continue; // Course bénigne (version introuvable) — exclue plutôt que citée sans provenance exacte.
      }

      const excerpt = item.snippet.slice(0, MAX_KNOWLEDGE_EXCERPT_LENGTH);
      const sourceRef = register(`KB:${item.knowledgeEntryId}`, {
        sourceType: TechnicalMemoCitationSourceType.KnowledgeEntry,
        knowledgeEntryId: item.knowledgeEntryId,
        knowledgeEntryVersionId,
        label: item.title,
        content: excerpt,
      });
      lines.push(`- [${sourceRef}] ${item.title} : ${excerpt}`);
    }

    return `## CONNAISSANCES VALIDÉES (Knowledge Base)\n${lines.length > 0 ? lines.join("\n") : "(aucune connaissance validée pertinente trouvée)"}`;
  }
}
