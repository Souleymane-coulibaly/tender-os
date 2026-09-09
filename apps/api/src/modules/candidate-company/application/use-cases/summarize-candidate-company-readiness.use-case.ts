import { Inject, Injectable } from "@nestjs/common";
import { CANDIDATE_COMPANY_REPOSITORY, type CandidateCompanyRepository } from "../ports/candidate-company.repository";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.1 — état de complétude de l'IDENTITÉ des entreprises candidates
 * d'une organisation.
 *
 * Ferme `P2-DASHBOARD-SEMANTIC-SOT` : le tableau de bord affichait « Compléter l'entreprise
 * candidate » en interrogeant en réalité la complétude du profil des `ClientAccount`. Un client
 * commercial n'est pas le candidat — la coche pouvait donc être verte sans qu'aucune entreprise
 * candidate ne soit renseignée, et inversement.
 *
 * SÉMANTIQUE MULTI-CANDIDAT (mission §15) : une organisation peut porter plusieurs entreprises
 * candidates. On ne désigne JAMAIS « la » candidate — ni la première, ni la plus récente. On rend
 * un COMPTE : combien existent, combien ont une identité complète. La règle du tableau de bord
 * devient donc « au moins une entreprise candidate est complète », un prédicat indépendant de
 * l'ordre de lecture et qui ne peut pas confondre la candidate A avec la B.
 *
 * CRITÈRE DE COMPLÉTUDE — traduction fidèle du critère Legacy `computeIdentityStatus`, jamais un
 * durcissement inventé : les mêmes six informations, lues à leur source candidate-native.
 *  - `CandidateCompany` : raison sociale, SIREN ;
 *  - établissement PRINCIPAL : SIRET, adresse, code postal, ville.
 */
export type CandidateCompanyReadinessSummary = Readonly<{
  /** Entreprises candidates ACTIVES de l'organisation (archivées exclues). */
  totalActive: number;
  /** Combien d'entre elles ont une identité juridique complète. */
  completeIdentityCount: number;
  /** Prédicat du tableau de bord : au moins une candidate exploitable existe. */
  hasAtLeastOneComplete: boolean;
}>;

/**
 * Borne de lecture, même discipline que le reste du tableau de bord : on ne parcourt jamais tout le
 * référentiel d'une organisation pour cocher une case d'activation.
 */
const READINESS_SCAN_LIMIT = 25;

@Injectable()
export class SummarizeCandidateCompanyReadinessUseCase {
  // Un SEUL dépôt : `CandidateCompany` et ses `CandidateEstablishment` forment un même agrégat,
  // contrairement à `client-portfolio`. On ne fabrique donc pas un second port pour l'occasion.
  constructor(@Inject(CANDIDATE_COMPANY_REPOSITORY) private readonly repository: CandidateCompanyRepository) {}

  async execute(query: { organizationId: string }): Promise<CandidateCompanyReadinessSummary> {
    const page = await this.repository.list({ organizationId: query.organizationId, includeArchived: false, limit: READINESS_SCAN_LIMIT });

    let completeIdentityCount = 0;
    for (const company of page.items) {
      if (!company.legalName || !company.siren) {
        continue;
      }
      const establishments = await this.repository.listEstablishmentsByCompany({
        organizationId: query.organizationId,
        candidateCompanyId: company.id,
      });
      const principal = establishments.find((establishment) => establishment.isPrincipal);
      if (principal?.siret && principal.addressLine && principal.postalCode && principal.city) {
        completeIdentityCount += 1;
      }
    }

    return {
      totalActive: page.items.length,
      completeIdentityCount,
      hasAtLeastOneComplete: completeIdentityCount > 0,
    };
  }
}
