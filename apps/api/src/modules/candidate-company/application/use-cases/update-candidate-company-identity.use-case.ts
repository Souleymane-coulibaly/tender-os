import { Inject, Injectable } from "@nestjs/common";
// Import DIRECT du fichier source (jamais le barrel `company-profile/index.ts`) — même motif exact
// que `create-candidate-company.use-case.ts` : le barrel réexporte `CompanyProfileModule`, qui
// referme un cycle require() réel. Ces validateurs sont des fonctions PURES.
import { isValidFrenchVatNumber, isValidSiren } from "../../../company-profile/domain/french-company-identifiers";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { assertHasCandidatePermission, CandidatePermission } from "../../domain/candidate-permission";
import { normalizeCandidateCompanyName } from "../../domain/candidate-name-normalizer";
import {
  CandidateCompanyNotFoundError,
  DuplicateCandidateCompanyNameError,
  InvalidSirenError,
} from "../../domain/errors";
import { toCandidateCompanySummary, type CandidateCompanySummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CANDIDATE_COMPANY_REPOSITORY, type CandidateCompanyRepository } from "../ports/candidate-company.repository";
import { InvalidCandidateVatNumberError } from "../../domain/errors";

/**
 * Checkpoint TENDEROS-2.1-CCV2-F.2 — patch d'identité juridique. Le TYPE lui-même est la liste
 * blanche : `organizationId` y figure comme contexte du TENANT COURANT (résolu côté serveur à
 * partir de `X-Organization-Id`, jamais d'un corps de requête), et aucun champ de provenance
 * (`sourceClientAccountId`, `clientAccountId`) ni de cycle de vie (`status`, `archivedAt`,
 * `createdBy`, `createdAt`) n'est atteignable.
 */
export type UpdateCandidateCompanyIdentityCommand = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  actorId: string;
  /** Rôle d'ORGANISATION de l'acteur (`MembershipContext.role`), jamais un rôle client. */
  actorRole: string;
  patch: Readonly<{
    name?: string | undefined;
    legalName?: string | null | undefined;
    tradeName?: string | null | undefined;
    siren?: string | null | undefined;
    vatNumber?: string | null | undefined;
    legalForm?: string | null | undefined;
  }>;
  requestId?: string | undefined;
}>;

/**
 * Checkpoint TENDEROS-2.1-CCV2-F.2 — mise à jour de l'identité juridique de l'entreprise candidate,
 * NATIVE CandidateCompany. Ferme l'incomplétude fonctionnelle relevée par l'audit indépendant :
 * CandidateCompany V2 est la surface d'administration principale, mais son identité était en
 * lecture seule — la seule façon de la corriger était d'écrire dans le Legacy `CompanyProfile`,
 * c'est-à-dire exactement la dépendance que CCV2 supprime.
 *
 * AUCUNE ÉCRITURE LEGACY, AUCUN DOUBLE-ÉCRITURE : ce use case ne touche que `CandidateCompany`.
 * `CompanyLegalIdentity` reste ce qu'il est pour les `ClientAccount` ; les deux ne sont pas
 * synchronisés, et ce serait un double-écriture s'ils l'étaient.
 *
 * CHAMPS MUTABLES — décidés d'après la sémantique de domaine RÉELLE, jamais supposés :
 *  - `name`, `legalName`, `tradeName`, `legalForm` : données déclaratives, corrigeables.
 *  - `siren`, `vatNumber` : identifiants de registre. Ils SONT mutables, avec exactement les mêmes
 *    validations que partout ailleurs (`isValidSiren` Luhn, `isValidFrenchVatNumber`). Ce n'est pas
 *    une invention : `UpsertCompanyLegalIdentityUseCase` (company-profile) autorise déjà la même
 *    mutation avec les mêmes validateurs. L'interdire ici rendrait une simple faute de frappe de
 *    SIREN irréparable autrement qu'en archivant l'entreprise et en recréant tous ses satellites.
 *  - Le SIRET n'est PAS ici : il appartient à `CandidateEstablishment` (mission CCV2 §7, pas
 *    d'ambiguïté SIREN/SIRET), et y possède déjà sa propre validation et son unicité organisation.
 *
 * ANTI-ÉNUMÉRATION : une entreprise candidate d'un autre tenant produit 404 (jamais 403) — le refus
 * de rôle, lui, est évalué AVANT toute lecture et ne parle que de l'acteur dans sa propre
 * organisation, donc n'apprend rien sur l'existence d'une ressource étrangère.
 */
@Injectable()
export class UpdateCandidateCompanyIdentityUseCase {
  constructor(
    @Inject(CANDIDATE_COMPANY_REPOSITORY) private readonly repository: CandidateCompanyRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateCandidateCompanyIdentityCommand): Promise<CandidateCompanySummary> {
    assertHasCandidatePermission(command.actorRole, CandidatePermission.ManageIdentity);

    const { patch } = command;

    // Validation AVANT lecture d'agrégat : un format invalide est un 422 quel que soit l'état de la
    // ressource. `null` = effacement explicite, donc jamais soumis à la validation de format.
    if (typeof patch.siren === "string" && !isValidSiren(patch.siren)) {
      throw new InvalidSirenError();
    }
    if (typeof patch.vatNumber === "string" && patch.vatNumber.toUpperCase().startsWith("FR") && !isValidFrenchVatNumber(patch.vatNumber)) {
      throw new InvalidCandidateVatNumberError();
    }

    const company = await this.repository.findById({
      organizationId: command.organizationId,
      candidateCompanyId: command.candidateCompanyId,
    });
    if (!company) {
      throw new CandidateCompanyNotFoundError();
    }

    // Doublon de nom : vérifié AVANT l'écriture pour renvoyer un 409 explicite plutôt que de
    // laisser remonter une violation d'index. Le `save` du dépôt garde malgré tout sa propre
    // traduction P2002 — cette vérification est une course, pas une garantie ; la contrainte
    // PostgreSQL reste l'autorité.
    if (patch.name !== undefined) {
      const nameNormalized = normalizeCandidateCompanyName(patch.name);
      if (nameNormalized !== company.nameNormalized) {
        const existing = await this.repository.findByNormalizedName({ organizationId: command.organizationId, nameNormalized });
        if (existing && existing.id !== company.id) {
          throw new DuplicateCandidateCompanyNameError();
        }
      }
    }

    const before = {
      name: company.name,
      legalName: company.legalName,
      tradeName: company.tradeName,
      siren: company.siren,
      vatNumber: company.vatNumber,
      legalForm: company.legalForm,
    };

    company.updateIdentity(patch, command.actorId, this.clock.now());
    await this.repository.save(company);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "candidate_company.identity_updated",
      resourceType: "candidate_company",
      resourceId: company.id,
      requestId: command.requestId,
      // Les CHAMPS touchés sont tracés, jamais l'intégralité des valeurs : l'identité juridique
      // n'est pas un secret, mais un journal d'audit n'a pas vocation à dupliquer l'état complet.
      metadata: { changedFields: Object.keys(patch).filter((key) => patch[key as keyof typeof patch] !== undefined), before },
    });

    return toCandidateCompanySummary(company);
  }
}
