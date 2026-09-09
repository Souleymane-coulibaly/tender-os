import { Injectable } from "@nestjs/common";
import { GetCandidateCompanyUseCase } from "../../../candidate-company";
// Import DIRECT du fichier source, jamais le barrel — même discipline que
// `create-candidate-company.use-case.ts` : le barrel de `company-profile` réexporte son module, et
// ces deux modules se référencent transitivement. `assertHasCandidatePermission` est une fonction
// PURE, aucun besoin du conteneur NestJS pour l'utiliser.
import { assertHasCandidatePermission, type CandidatePermission } from "../../../candidate-company/domain/candidate-permission";
import { CandidateCompanyNotFoundError } from "../../../candidate-company/domain/errors";

export type CandidateCapabilityAccessInput = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  actorRole: string;
  permission: CandidatePermission;
}>;

/**
 * Checkpoint TENDEROS-2.1-CCV2-C — porte d'entrée unique des capacités candidate.
 *
 * Deux vérifications, dans un ORDRE VOLONTAIRE :
 *   1. la permission `CandidatePermission` (CCV2-A), évaluée sur le SEUL rôle d'organisation de
 *      l'acteur — elle n'interroge aucune ressource, donc un 403 ne révèle jamais l'existence de
 *      quoi que ce soit ;
 *   2. l'existence de la `CandidateCompany` DANS CETTE organisation, via le use case canonique
 *      `GetCandidateCompanyUseCase` (jamais un second chemin de lecture direct au repository) —
 *      404 `CANDIDATE_COMPANY_NOT_FOUND` sinon, convention anti-énumération inchangée.
 *
 * Aucune nouvelle permission n'est créée : CCV2-A couvrait déjà le besoin
 * (`Read` / `CapabilityEdit`).
 */
@Injectable()
export class CandidateCapabilityAccessService {
  constructor(private readonly getCandidateCompanyUseCase: GetCandidateCompanyUseCase) {}

  async assertCandidateAccess(input: CandidateCapabilityAccessInput): Promise<void> {
    assertHasCandidatePermission(input.actorRole, input.permission);

    const company = await this.getCandidateCompanyUseCase
      .execute({ organizationId: input.organizationId, candidateCompanyId: input.candidateCompanyId })
      .catch(() => null);
    if (!company) {
      throw new CandidateCompanyNotFoundError();
    }
  }
}
