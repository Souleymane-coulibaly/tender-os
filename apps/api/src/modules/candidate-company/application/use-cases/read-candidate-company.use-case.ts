import { Injectable } from "@nestjs/common";
import { assertHasCandidatePermission, CandidatePermission } from "../../domain/candidate-permission";
import type { CandidateCompanySummary } from "../dtos";
import { GetCandidateCompanyUseCase } from "./get-candidate-company.use-case";

export type ReadCandidateCompanyQuery = Readonly<{
  organizationId: string;
  candidateCompanyId: string;
  /** Rôle d'ORGANISATION de l'acteur (`MembershipContext.role`), jamais un rôle client. */
  actorRole: string;
}>;

/**
 * Checkpoint TENDEROS-2.1-CCV2-A — lecture HTTP d'une entreprise candidate, gardée par
 * `CandidatePermission.Read`.
 *
 * Pourquoi un use case distinct plutôt qu'un `actorRole` ajouté à `GetCandidateCompanyUseCase` :
 * ce dernier a un contrat DIFFÉRENT et déjà établi (voir `candidate-company/index.ts`) — il est
 * réexporté comme simple vérification "cette CandidateCompany existe, appartient à l'organisation
 * et n'est pas archivée", consommée en INTERNE par `opportunity` (création/mise à jour),
 * `tenders` (changement de candidat) et `technical-memo` (assemblage de contexte). Ces appelants
 * sont déjà gardés par LEUR propre permission (`OpportunityPermission.Create`,
 * `ClientPermission.ChangeTenderCandidate`...) ; y imposer en plus une permission candidate
 * double-garderait des flux internes et obligerait à modifier `technical-memo`, explicitement hors
 * périmètre de ce checkpoint. La garde est donc posée sur le chemin HTTP, sans dupliquer une seule
 * ligne de logique de lecture : ce use case délègue intégralement.
 *
 * L'ordre est volontaire — permission d'abord, lecture ensuite : un acteur d'une AUTRE organisation
 * passe l'assertion (elle ne juge que SON rôle dans SA propre organisation) puis reçoit le 404
 * anti-énumération de `GetCandidateCompanyUseCase`, jamais un 403 qui trahirait une existence.
 */
@Injectable()
export class ReadCandidateCompanyUseCase {
  constructor(private readonly getCandidateCompanyUseCase: GetCandidateCompanyUseCase) {}

  async execute(query: ReadCandidateCompanyQuery): Promise<CandidateCompanySummary> {
    assertHasCandidatePermission(query.actorRole, CandidatePermission.Read);
    return this.getCandidateCompanyUseCase.execute({
      organizationId: query.organizationId,
      candidateCompanyId: query.candidateCompanyId,
    });
  }
}
