import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { CandidatePermission } from "../../../candidate-company/domain/candidate-permission";
import {
  CompanyCertificationNotFoundError,
  CompanyHumanResourceNotFoundError,
  CompanyInsuranceNotFoundError,
  CompanyMaterialResourceNotFoundError,
  CompanyReferenceNotFoundError,
  CompanyRepresentativeNotFoundError,
} from "../../domain/errors";
import type {
  CompanyCertificationRecord,
  CompanyHumanResourceRecord,
  CompanyInsuranceRecord,
  CompanyMaterialResourceRecord,
  CompanyReferenceRecord,
  CompanyRepresentativeRecord,
} from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import {
  COMPANY_CERTIFICATION_REPOSITORY,
  COMPANY_HUMAN_RESOURCE_REPOSITORY,
  COMPANY_INSURANCE_REPOSITORY,
  COMPANY_MATERIAL_RESOURCE_REPOSITORY,
  COMPANY_REFERENCE_REPOSITORY,
  COMPANY_REPRESENTATIVE_REPOSITORY,
  type CandidateEntityScope,
  type CandidateScope,
  type CompanyCertificationRepository,
  type CompanyHumanResourceRepository,
  type CompanyInsuranceRepository,
  type CompanyMaterialResourceRepository,
  type CompanyReferenceRepository,
  type CompanyRepresentativeRepository,
  type Patch,
} from "../ports/company-satellite.repository";
import { CandidateCapabilityAccessService } from "../services/candidate-capability-access.service";

/**
 * Checkpoint TENDEROS-2.1-CCV2-C — CRUD des capacités adressées par leur SOT V2, `CandidateCompany`.
 *
 * PAS de seconde table, PAS de copie, PAS de dual-write : ces use cases écrivent dans les MÊMES
 * lignes que le chemin Legacy, simplement bornées par `candidateCompanyId` au lieu de
 * `clientAccountId` (voir `CandidateScope`). Une capacité migrée en CCV2-B est donc lisible ici
 * SANS aucune recopie.
 *
 * AUCUN FALLBACK SILENCIEUX (mission §14) : si une capacité n'existe pas côté CandidateCompany, ces
 * use cases retournent une liste vide ou un 404 — jamais une valeur empruntée à `ClientAccount`
 * pour donner l'illusion que la migration est complète.
 *
 * SUPPRESSION : le domaine `company-profile` n'a JAMAIS de suppression physique — aucun repository
 * n'expose `delete`, et le schéma documente explicitement "jamais de suppression physique si
 * utilisé dans un document/package existant : uniquement `status = ARCHIVED`". La route DELETE de
 * l'API candidate applique donc cet archivage, elle n'invente pas une sémantique destructrice qui
 * casserait les packages de réponse déjà constitués.
 *
 * Les 6 familles restent STRICTEMENT distinctes : tables, champs, schémas de validation et erreurs
 * métier propres. Seul le cycle de vie (4 opérations identiques) est factorisé — jamais les
 * concepts (mission §7 : un représentant légal n'est pas un signataire, et le modèle continue de
 * les distinguer via `type`/`signatureScope`).
 */

export const CandidateCapabilityFamily = {
  Representatives: "representatives",
  Insurances: "insurances",
  Certifications: "certifications",
  References: "references",
  HumanResources: "human-resources",
  MaterialResources: "material-resources",
} as const;
export type CandidateCapabilityFamily = (typeof CandidateCapabilityFamily)[keyof typeof CandidateCapabilityFamily];

export type CandidateCapabilityRecord =
  | CompanyRepresentativeRecord
  | CompanyInsuranceRecord
  | CompanyCertificationRecord
  | CompanyReferenceRecord
  | CompanyHumanResourceRecord
  | CompanyMaterialResourceRecord;

/** Contrat minimal commun aux 6 repositories — ils l'implémentent déjà tous, aucune abstraction
 *  nouvelle n'est introduite côté infrastructure. */
type CandidateCapabilityRepository = Readonly<{
  create(input: Record<string, unknown>): Promise<CandidateCapabilityRecord>;
  listByCandidate(scope: CandidateScope): Promise<CandidateCapabilityRecord[]>;
  findByIdForCandidate(scope: CandidateEntityScope): Promise<CandidateCapabilityRecord | null>;
  updateForCandidate(scope: CandidateEntityScope, patch: Patch<Record<string, unknown>>): Promise<CandidateCapabilityRecord | null>;
}>;

type FamilyDescriptor = Readonly<{
  repository: CandidateCapabilityRepository;
  /** Erreur métier PROPRE à la famille — jamais une erreur générique qui perdrait le contexte. */
  notFound: () => Error;
  /** Suffixe des actions d'audit, aligné sur la nomenclature Legacy (`company_profile.*_added`). */
  auditNoun: string;
  /** Valeurs par défaut non nullables du modèle, jamais devinées : reprises du schéma Prisma. */
  defaults: Record<string, unknown>;
}>;

export type ListCandidateCapabilitiesQuery = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  actorRole: string;
  family: CandidateCapabilityFamily;
}>;

export type CreateCandidateCapabilityCommand = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  actorId: string;
  actorRole: string;
  family: CandidateCapabilityFamily;
  /** Corps DÉJÀ validé par le schéma Zod propre à la famille (interfaces/http) — jamais un objet
   *  arbitraire non validé. */
  attributes: Record<string, unknown>;
}>;

export type UpdateCandidateCapabilityCommand = CreateCandidateCapabilityCommand & { capabilityId: string };

export type ArchiveCandidateCapabilityCommand = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  capabilityId: string;
  actorId: string;
  actorRole: string;
  family: CandidateCapabilityFamily;
}>;

@Injectable()
export class CandidateCapabilityRegistry {
  private readonly families: Readonly<Record<CandidateCapabilityFamily, FamilyDescriptor>>;

  constructor(
    @Inject(COMPANY_REPRESENTATIVE_REPOSITORY) representatives: CompanyRepresentativeRepository,
    @Inject(COMPANY_INSURANCE_REPOSITORY) insurances: CompanyInsuranceRepository,
    @Inject(COMPANY_CERTIFICATION_REPOSITORY) certifications: CompanyCertificationRepository,
    @Inject(COMPANY_REFERENCE_REPOSITORY) references: CompanyReferenceRepository,
    @Inject(COMPANY_HUMAN_RESOURCE_REPOSITORY) humanResources: CompanyHumanResourceRepository,
    @Inject(COMPANY_MATERIAL_RESOURCE_REPOSITORY) materialResources: CompanyMaterialResourceRepository,
  ) {
    this.families = {
      [CandidateCapabilityFamily.Representatives]: {
        repository: representatives as unknown as CandidateCapabilityRepository,
        notFound: () => new CompanyRepresentativeNotFoundError(),
        auditNoun: "representative",
        defaults: { status: "ACTIVE" },
      },
      [CandidateCapabilityFamily.Insurances]: {
        repository: insurances as unknown as CandidateCapabilityRepository,
        notFound: () => new CompanyInsuranceNotFoundError(),
        auditNoun: "insurance",
        defaults: { status: "ACTIVE" },
      },
      [CandidateCapabilityFamily.Certifications]: {
        repository: certifications as unknown as CandidateCapabilityRepository,
        notFound: () => new CompanyCertificationNotFoundError(),
        auditNoun: "certification",
        defaults: { status: "ACTIVE" },
      },
      [CandidateCapabilityFamily.References]: {
        repository: references as unknown as CandidateCapabilityRepository,
        notFound: () => new CompanyReferenceNotFoundError(),
        auditNoun: "reference",
        // `confidentiality` et `status` ont une valeur par défaut au niveau du schéma Prisma
        // (`STANDARD`/`DRAFT`) — reprises telles quelles, jamais réinventées.
        defaults: { status: "DRAFT", confidentiality: "STANDARD" },
      },
      [CandidateCapabilityFamily.HumanResources]: {
        repository: humanResources as unknown as CandidateCapabilityRepository,
        notFound: () => new CompanyHumanResourceNotFoundError(),
        auditNoun: "human_resource",
        defaults: { status: "ACTIVE" },
      },
      [CandidateCapabilityFamily.MaterialResources]: {
        repository: materialResources as unknown as CandidateCapabilityRepository,
        notFound: () => new CompanyMaterialResourceNotFoundError(),
        auditNoun: "material_resource",
        defaults: { status: "ACTIVE", availabilityStatus: "AVAILABLE" },
      },
    };
  }

  descriptorFor(family: CandidateCapabilityFamily): FamilyDescriptor {
    return this.families[family];
  }
}

@Injectable()
export class ListCandidateCapabilitiesUseCase {
  constructor(
    private readonly registry: CandidateCapabilityRegistry,
    private readonly accessService: CandidateCapabilityAccessService,
  ) {}

  async execute(query: ListCandidateCapabilitiesQuery): Promise<CandidateCapabilityRecord[]> {
    await this.accessService.assertCandidateAccess({ ...query, permission: CandidatePermission.Read });
    return this.registry.descriptorFor(query.family).repository.listByCandidate({
      organizationId: query.organizationId,
      candidateCompanyId: query.candidateCompanyId,
    });
  }
}

@Injectable()
export class CreateCandidateCapabilityUseCase {
  constructor(
    private readonly registry: CandidateCapabilityRegistry,
    private readonly accessService: CandidateCapabilityAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: CreateCandidateCapabilityCommand): Promise<CandidateCapabilityRecord> {
    await this.accessService.assertCandidateAccess({ ...command, permission: CandidatePermission.CapabilityEdit });
    const descriptor = this.registry.descriptorFor(command.family);

    const created = await descriptor.repository.create({
      id: randomUUID(),
      organizationId: command.organizationId,
      // La capacité NAÎT candidate-owned. `clientAccountId` reste NULL : une capacité créée par
      // l'API V2 n'a aucun propriétaire Legacy, y compris pour une CandidateCompany native — c'est
      // exactement ce que la migration CCV2-C rend possible.
      clientAccountId: null,
      candidateCompanyId: command.candidateCompanyId,
      ...descriptor.defaults,
      ...command.attributes,
      createdBy: command.actorId,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: `candidate_company.${descriptor.auditNoun}_added`,
      resourceType: "candidate_company",
      resourceId: command.candidateCompanyId,
      metadata: { capabilityId: created.id, family: command.family },
    });
    return created;
  }
}

@Injectable()
export class UpdateCandidateCapabilityUseCase {
  constructor(
    private readonly registry: CandidateCapabilityRegistry,
    private readonly accessService: CandidateCapabilityAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: UpdateCandidateCapabilityCommand): Promise<CandidateCapabilityRecord> {
    await this.accessService.assertCandidateAccess({ ...command, permission: CandidatePermission.CapabilityEdit });
    const descriptor = this.registry.descriptorFor(command.family);

    const updated = await descriptor.repository.updateForCandidate(
      { organizationId: command.organizationId, candidateCompanyId: command.candidateCompanyId, id: command.capabilityId },
      // `updatedBy` n'est PAS écrit ici : seule `CompanyRepresentative` possède cette colonne
      // parmi les 6 familles, et le chemin Legacy ne la renseigne pas non plus. L'acteur d'une
      // mutation est tracé par l'AuditLog ci-dessous, source unique et homogène.
      { ...command.attributes },
    );
    if (!updated) {
      // La ressource n'existe pas SOUS CE CANDIDAT — y compris lorsqu'elle existe sous un autre
      // candidat de la même organisation (isolation cross-candidate) : 404, jamais 403.
      throw descriptor.notFound();
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: `candidate_company.${descriptor.auditNoun}_updated`,
      resourceType: "candidate_company",
      resourceId: command.candidateCompanyId,
      metadata: { capabilityId: updated.id, family: command.family },
    });
    return updated;
  }
}

@Injectable()
export class ArchiveCandidateCapabilityUseCase {
  constructor(
    private readonly registry: CandidateCapabilityRegistry,
    private readonly accessService: CandidateCapabilityAccessService,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: ArchiveCandidateCapabilityCommand): Promise<CandidateCapabilityRecord> {
    await this.accessService.assertCandidateAccess({ ...command, permission: CandidatePermission.CapabilityEdit });
    const descriptor = this.registry.descriptorFor(command.family);

    const archived = await descriptor.repository.updateForCandidate(
      { organizationId: command.organizationId, candidateCompanyId: command.candidateCompanyId, id: command.capabilityId },
      { status: "ARCHIVED" },
    );
    if (!archived) {
      throw descriptor.notFound();
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: `candidate_company.${descriptor.auditNoun}_archived`,
      resourceType: "candidate_company",
      resourceId: command.candidateCompanyId,
      metadata: { capabilityId: archived.id, family: command.family },
    });
    return archived;
  }
}
