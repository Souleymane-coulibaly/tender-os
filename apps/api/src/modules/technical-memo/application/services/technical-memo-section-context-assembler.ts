import { Inject, Injectable } from "@nestjs/common";
import { CandidateIdentitySource, GetCandidateCompanyUseCase, ResolveCandidateIdentityUseCase } from "../../../candidate-company";
import { GetCompanyProfileUseCase, type CompanyProfileSummary } from "../../../company-profile";
import {
  GetEffectiveTenderAnalysisSummaryUseCase,
  ListTenderClausesUseCase,
  ListTenderCriteriaUseCase,
  ListTenderRequirementsUseCase,
  type AnalysisFreshness,
} from "../../../analysis";
import { GetKnowledgeVersionUseCase, SearchKnowledgeBaseUseCase } from "../../../knowledge-base";
import { GetTenderUseCase } from "../../../tenders";
import { TechnicalMemoCitationSourceType, TechnicalMemoRequirementFindingType } from "../../domain/enums";
import type { TechnicalMemo } from "../../domain/technical-memo.aggregate";
import type { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";
import { TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY, type TechnicalMemoSectionRequirementRepository } from "../ports/technical-memo-section-requirement.repository";
import type { KnownTechnicalMemoReference, KnownTechnicalMemoReferences } from "./technical-memo-citation-validator";

const FINDINGS_PAGE_LIMIT = 200;
const KNOWLEDGE_RESULT_LIMIT = 8;
const MAX_KNOWLEDGE_EXCERPT_LENGTH = 1_500;

/** Checkpoint 2.1-P2.1-FIX-D — provenance des sources RÉELLEMENT consommées pour CETTE génération,
 *  à figer telle quelle sur la révision produite (mission §18 "jamais les sources courantes relues
 *  à la fin"). `analysisVersion`/`dceRevision`/`analysisFreshness` restent `undefined` si la
 *  section n'avait aucun lien DCE (mission §12/§13 "jamais une dépendance fabriquée"). */
export type TechnicalMemoSectionProvenance = Readonly<{
  candidateCompanyId: string | undefined;
  analysisVersion: number | undefined;
  dceRevision: number | undefined;
  analysisFreshness: AnalysisFreshness | undefined;
}>;

export type TechnicalMemoSectionContext = Readonly<{
  sectionBlock: string;
  contextBlock: string;
  knownReferences: KnownTechnicalMemoReferences;
  provenance: TechnicalMemoSectionProvenance;
}>;

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
 * `GetCompanyProfileUseCase` est appelé avec ce MÊME `clientAccountId` UNIQUEMENT en LEGACY FLOW (voir
 * Checkpoint 2.1-A6.3 ci-dessous pour le NEW FLOW).
 *
 * Checkpoint 2.1-A4 (correctif post-audit, P1-02) — l'IDENTITÉ légale du candidat (nom/SIREN/forme
 * juridique/TVA) préfère désormais la SOT `CandidateCompany` (via `ResolveCandidateIdentityUseCase`)
 * quand `Tender.candidateCompanyId` est renseigné (NEW FLOW), sinon `company-profile.legalIdentity`
 * (LEGACY FLOW) — même discipline que les résolveurs DC1/DC2/DC4.
 *
 * Checkpoint 2.1-A6.3 (correctif — les CAPACITÉS n'existent structurellement que dans
 * `company-profile`, `CandidateCompany`/`CandidateEstablishment` ne portent aucune table satellite
 * équivalente, mission A1 §6 minimalisme — gap structurel réel, non comblé par ce checkpoint, voir
 * `DATA_MODEL_GAP` du rapport A6.3). En NEW FLOW, ces capacités ne sont JAMAIS lues via
 * `memo.clientAccountId` (le CLIENT commercial du Tender, une entité potentiellement distincte du
 * Candidate — mission A6.3 §6/§14) : seul `CandidateCompany.sourceClientAccountId` (le
 * `ClientAccount` dont CETTE CandidateCompany a été migrée, A2) peut servir de fallback legacy
 * EXPLICITE, jamais un autre `clientAccountId`. Absent de fallback ⇒ capacités explicitement
 * absentes (mission A6.3 §53 "jamais une substitution Client"), jamais une donnée inventée. En
 * LEGACY FLOW (aucune CandidateCompany résolue), le comportement est inchangé depuis A4 :
 * `company-profile` via `memo.clientAccountId` sert à la fois l'identité et les capacités.
 */
@Injectable()
export class TechnicalMemoSectionContextAssembler {
  constructor(
    @Inject(TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY) private readonly requirementRepository: TechnicalMemoSectionRequirementRepository,
    private readonly listTenderRequirementsUseCase: ListTenderRequirementsUseCase,
    private readonly listTenderCriteriaUseCase: ListTenderCriteriaUseCase,
    private readonly listTenderClausesUseCase: ListTenderClausesUseCase,
    private readonly getEffectiveTenderAnalysisSummaryUseCase: GetEffectiveTenderAnalysisSummaryUseCase,
    private readonly searchKnowledgeBaseUseCase: SearchKnowledgeBaseUseCase,
    private readonly getKnowledgeVersionUseCase: GetKnowledgeVersionUseCase,
    private readonly getCompanyProfileUseCase: GetCompanyProfileUseCase,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly resolveCandidateIdentityUseCase: ResolveCandidateIdentityUseCase,
    private readonly getCandidateCompanyUseCase: GetCandidateCompanyUseCase,
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

    const findingsResult = await this.buildFindingsBlock(input, register);
    const candidateResult = await this.buildCandidateBlock(input, register);
    const knowledgeBlock = await this.buildKnowledgeBlock(input, register);

    const contextBlock = [findingsResult.block, candidateResult.block, knowledgeBlock].join("\n\n");

    return {
      sectionBlock,
      contextBlock,
      knownReferences: known,
      provenance: {
        candidateCompanyId: candidateResult.candidateCompanyId,
        analysisVersion: findingsResult.analysisVersion,
        dceRevision: findingsResult.dceRevision,
        analysisFreshness: findingsResult.analysisFreshness,
      },
    };
  }

  /** Checkpoint 2.1-P2.1-FIX-D — `GetEffectiveTenderAnalysisSummaryUseCase` n'est appelé QUE si
   *  cette section a au moins un lien DCE (mission §12/§13 "jamais une dépendance fabriquée") :
   *  sans lien, l'Analyse n'est structurellement jamais consommée, `analysisVersion`/`dceRevision`
   *  restent `undefined` en provenance. Quand un lien existe, une analyse a nécessairement déjà
   *  réussi (les liens référencent des Findings réels) — cet appel ne peut donc jamais lever
   *  `TenderBusinessAnalysisNotFoundError` dans ce chemin. */
  private async buildFindingsBlock(
    input: { organizationId: string; actorId: string; actorRole: string; memo: TechnicalMemo; section: TechnicalMemoSection },
    register: (sourceRef: string, reference: KnownTechnicalMemoReference) => string,
  ): Promise<{ block: string; analysisVersion: number | undefined; dceRevision: number | undefined; analysisFreshness: AnalysisFreshness | undefined }> {
    const links = await this.requirementRepository.listBySectionId({ organizationId: input.organizationId, technicalMemoSectionId: input.section.id });
    if (links.length === 0) {
      return { block: "## EXIGENCES DCE LIÉES\n(aucune)", analysisVersion: undefined, dceRevision: undefined, analysisFreshness: undefined };
    }

    const findingQuery = { organizationId: input.organizationId, tenderId: input.memo.tenderId, actorId: input.actorId, actorRole: input.actorRole, limit: FINDINGS_PAGE_LIMIT, offset: 0 };
    const [requirements, criteria, clauses, effectiveAnalysis] = await Promise.all([
      this.listTenderRequirementsUseCase.execute(findingQuery),
      this.listTenderCriteriaUseCase.execute(findingQuery),
      this.listTenderClausesUseCase.execute(findingQuery),
      this.getEffectiveTenderAnalysisSummaryUseCase.execute({ organizationId: input.organizationId, tenderId: input.memo.tenderId, actorId: input.actorId, actorRole: input.actorRole }),
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

    return {
      block: `## EXIGENCES DCE LIÉES\n${lines.length > 0 ? lines.join("\n") : "(aucune)"}`,
      analysisVersion: effectiveAnalysis.analysisVersion,
      dceRevision: effectiveAnalysis.dceRevision,
      analysisFreshness: effectiveAnalysis.analysisFreshness,
    };
  }

  private async buildCandidateBlock(
    input: { organizationId: string; actorId: string; actorRole: string; memo: TechnicalMemo; section: TechnicalMemoSection },
    register: (sourceRef: string, reference: KnownTechnicalMemoReference) => string,
  ): Promise<{ block: string; candidateCompanyId: string | undefined }> {
    // NEW FLOW / LEGACY FLOW (Checkpoint 2.1-A4, correctif post-audit) — jamais une fusion
    // silencieuse : soit l'identité vient entièrement de `CandidateCompany`, soit entièrement de
    // `legalIdentity`, jamais un mélange des deux.
    const tender = await this.getTenderUseCase.execute({ organizationId: input.organizationId, tenderId: input.memo.tenderId, actorId: input.actorId, actorRole: input.actorRole });
    const candidateIdentity = await this.resolveCandidateIdentityUseCase.execute({ organizationId: input.organizationId, candidateCompanyId: tender.candidateCompanyId });
    const usesCandidateCompany = candidateIdentity.source === CandidateIdentitySource.CandidateCompany;

    // Checkpoint 2.1-A6.3 — le profil legacy (seule source structurelle des CAPACITÉS aujourd'hui)
    // n'est JAMAIS résolu via `memo.clientAccountId` en NEW FLOW : ce serait le Client commercial du
    // Tender, une entité potentiellement distincte de la CandidateCompany résolue (mission A6.3
    // §6/§14 "CLIENT ≠ CANDIDATE"). Seul `sourceClientAccountId` — le ClientAccount dont CETTE
    // CandidateCompany a été migrée (A2) — peut servir de fallback, et uniquement s'il existe.
    const legacyProfile = usesCandidateCompany
      ? await this.resolveLegacyCapabilityProfile(input, tender.candidateCompanyId)
      : await this.getCompanyProfileUseCase
          .execute({ organizationId: input.organizationId, clientAccountId: input.memo.clientAccountId, actorId: input.actorId, actorRole: input.actorRole })
          .catch(() => undefined);

    const lines: string[] = [];

    const identityContent = usesCandidateCompany
      ? JSON.stringify({
          legalName: candidateIdentity.legalName,
          tradeName: candidateIdentity.displayName,
          siren: candidateIdentity.siren,
          legalForm: candidateIdentity.legalForm,
          vatNumber: candidateIdentity.vatNumber,
          siret: candidateIdentity.principalEstablishment?.siret,
          address: candidateIdentity.principalEstablishment,
        })
      : legacyProfile?.legalIdentity
        ? JSON.stringify(legacyProfile.legalIdentity)
        : undefined;

    if (identityContent) {
      const sourceRef = register("CANDIDATE:legalIdentity", {
        sourceType: TechnicalMemoCitationSourceType.CandidateField,
        candidateFieldPath: "legalIdentity",
        label: "Identité légale de l'entreprise",
        content: identityContent,
      });
      lines.push(`- [${sourceRef}] Identité légale : ${identityContent}`);
    }

    // Checkpoint 2.1-A6.3 — quand les capacités proviennent d'un fallback legacy (NEW FLOW), chaque
    // ligne le déclare EXPLICITEMENT (mission §15 "IDENTITY SOURCE = CandidateCompany, CAPABILITY
    // SOURCE = LegacyCompatibility — éviter un objet ambigu mélangeant silencieusement tout"), jamais
    // présenté au même titre qu'une donnée directement rattachée à la CandidateCompany.
    const capabilityQualifier = usesCandidateCompany ? " [fallback legacy — profil entreprise migré rattaché à cette entreprise candidate]" : "";
    if (legacyProfile) {
      if (legacyProfile.humanResources.length > 0) {
        const content = JSON.stringify(legacyProfile.humanResources);
        const sourceRef = register("CANDIDATE:humanResources", { sourceType: TechnicalMemoCitationSourceType.CandidateField, candidateFieldPath: "humanResources", label: `Moyens humains${capabilityQualifier}`, content });
        lines.push(`- [${sourceRef}] Moyens humains${capabilityQualifier} : ${content}`);
      }
      if (legacyProfile.materialResources.length > 0) {
        const content = JSON.stringify(legacyProfile.materialResources);
        const sourceRef = register("CANDIDATE:materialResources", { sourceType: TechnicalMemoCitationSourceType.CandidateField, candidateFieldPath: "materialResources", label: `Moyens techniques${capabilityQualifier}`, content });
        lines.push(`- [${sourceRef}] Moyens techniques${capabilityQualifier} : ${content}`);
      }
      if (legacyProfile.certifications.length > 0) {
        const content = JSON.stringify(legacyProfile.certifications);
        const sourceRef = register("CANDIDATE:certifications", { sourceType: TechnicalMemoCitationSourceType.CandidateField, candidateFieldPath: "certifications", label: `Certifications${capabilityQualifier}`, content });
        lines.push(`- [${sourceRef}] Certifications${capabilityQualifier} : ${content}`);
      }
      if (legacyProfile.insurances.length > 0) {
        const content = JSON.stringify(legacyProfile.insurances);
        const sourceRef = register("CANDIDATE:insurances", { sourceType: TechnicalMemoCitationSourceType.CandidateField, candidateFieldPath: "insurances", label: `Assurances${capabilityQualifier}`, content });
        lines.push(`- [${sourceRef}] Assurances${capabilityQualifier} : ${content}`);
      }

      // Mission §26 — TenderOS peut proposer/sélectionner les références les plus pertinentes, mais
      // doit expliquer pourquoi (secteur/technologie/taille similaires) et JAMAIS en inventer une.
      for (const reference of legacyProfile.references) {
        const content = [reference.projectName, reference.sector, reference.description, reference.results].filter(Boolean).join(" — ");
        const sourceRef = register(`REF:${reference.id}`, {
          sourceType: TechnicalMemoCitationSourceType.Reference,
          companyReferenceId: reference.id,
          label: `Référence "${reference.projectName}"${capabilityQualifier}`,
          content,
        });
        lines.push(`- [${sourceRef}] Référence "${reference.projectName}"${capabilityQualifier} (secteur : ${reference.sector ?? "non renseigné"}) : ${content}`);
      }
    }

    return {
      block: `## DONNÉES CANDIDAT (entreprise réelle, jamais à inventer)\n${lines.length > 0 ? lines.join("\n") : "(aucune donnée candidat disponible)"}`,
      // Checkpoint 2.1-P2.1-FIX-D — provenance figée quel que soit le flux (NEW/LEGACY), toujours
      // `tender.candidateCompanyId` tel quel (jamais recalculé/déduit), même valeur `undefined`
      // qu'un Tender LEGACY FLOW sans Candidate sélectionnée (mission "candidateStale=false pour un
      // Tender qui n'en a jamais eu", même discipline que `withGoNoGoCandidateStaleness`).
      candidateCompanyId: tender.candidateCompanyId,
    };
  }

  /** Checkpoint 2.1-A6.3 — fallback CAPACITÉS explicite, jamais l'identité : résout, si elle existe,
   *  la company-profile qui appartenait réellement à CETTE CandidateCompany avant sa migration A2
   *  (`sourceClientAccountId`, jamais un autre `clientAccountId`, jamais le Client du Tender). Aucune
   *  CandidateCompany trouvée, aucun `sourceClientAccountId`, ou accès refusé sur ce ClientAccount ⇒
   *  `undefined` (capacités explicitement absentes, mission §53), jamais une exception qui ferait
   *  échouer la génération de section. */
  private async resolveLegacyCapabilityProfile(
    input: { organizationId: string; actorId: string; actorRole: string },
    candidateCompanyId: string | undefined,
  ): Promise<CompanyProfileSummary | undefined> {
    if (!candidateCompanyId) return undefined;
    const candidateCompany = await this.getCandidateCompanyUseCase.execute({ organizationId: input.organizationId, candidateCompanyId }).catch(() => undefined);
    if (!candidateCompany?.sourceClientAccountId) return undefined;
    return this.getCompanyProfileUseCase
      .execute({ organizationId: input.organizationId, clientAccountId: candidateCompany.sourceClientAccountId, actorId: input.actorId, actorRole: input.actorRole })
      .catch(() => undefined);
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
