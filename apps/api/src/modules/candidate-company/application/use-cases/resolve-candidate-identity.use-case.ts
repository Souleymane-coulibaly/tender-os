import { Inject, Injectable } from "@nestjs/common";
import { CANDIDATE_COMPANY_REPOSITORY, type CandidateCompanyRepository } from "../ports/candidate-company.repository";

/**
 * TenderOS 2.1-A4 (Checkpoint "Candidate Context") — point d'accès canonique UNIQUE pour résoudre
 * l'identité juridique de l'entreprise candidate d'un Tender, réutilisable par tout consumer qui a
 * besoin de "quelle entreprise répond ?" (administratif, GO/NO-GO, checklist, mémoire technique...).
 * Volontairement PAS un "God Service" (mission A4 §10) : ne résout QUE l'identité (dénomination
 * sociale, nom commercial, SIREN,
 * établissement principal — SIRET/adresse) déjà portée par `CandidateCompany`/`CandidateEstablishment`
 * (A1). Ne recrée jamais un second système de contact/représentants/certifications — ces données
 * n'existent PAS encore sur `CandidateCompany` (satellites `company-profile` non migrés, mission A4
 * §46 "réduire progressivement", pas "supprimer immédiatement") ; les consumers qui en ont besoin
 * continuent de les lire depuis `company-profile` en A4, documenté explicitement à chaque site
 * d'appel — jamais un fallback silencieux (mission A4 §11).
 *
 * NEW FLOW / LEGACY FLOW (mission A4 §11) : appelé avec `candidateCompanyId` défini (nouveau
 * rattachement, A3) → résout depuis la nouvelle SOT, source `"CANDIDATE_COMPANY"`. Appelé avec
 * `candidateCompanyId` absent (Tender legacy, jamais rétroactivement rempli) → `source: "NONE"`,
 * jamais une erreur : c'est à l'appelant de décider s'il retombe sur son propre fallback legacy
 * explicite (`company-profile` via `clientAccountId`) ou traite l'absence comme
 * `CANDIDATE_NOT_SELECTED`. Ne lève jamais d'exception pour un id introuvable/tenant incohérent —
 * best-effort, même discipline que les résolutions "meilleur effort" déjà établies dans ce dépôt
 * (Checkpoint D — routing decisions) : une identité candidate non résolvable ne doit jamais faire
 * échouer le consumer appelant, seulement dégrader sa confiance (source: "NONE").
 */
export const CandidateIdentitySource = {
  CandidateCompany: "CANDIDATE_COMPANY",
  None: "NONE",
} as const;
export type CandidateIdentitySource = (typeof CandidateIdentitySource)[keyof typeof CandidateIdentitySource];

export type CandidateIdentitySummary = Readonly<{
  source: CandidateIdentitySource;
  candidateCompanyId?: string | undefined;
  /**
   * Nom d'usage, destine a un AFFICHAGE : `legalName` lorsqu'il est renseigne, sinon `name`.
   *
   * Checkpoint TENDEROS-2.1-H.6 — le commentaire precedent affirmait que `CandidateCompany` ne
   * portait pas de nom commercial distinct. C'etait vrai en A1 ; ce ne l'est plus depuis CCV2-F.1,
   * qui a ajoute `tradeName` et l'a rendu editable en F.2. Le champ est donc desormais expose
   * ci-dessous, et ce libelle n'est plus une identite juridique deguisee : `displayName` reste un
   * LIBELLE D'AFFICHAGE, `legalName` la denomination sociale, `tradeName` le nom commercial.
   */
  displayName?: string | undefined;
  /** Denomination sociale — identite JURIDIQUE de la personne morale qui candidate. */
  legalName?: string | undefined;
  /** Nom commercial, lorsqu'il differe de la denomination sociale. Jamais une identite juridique :
   *  il ne peut pas se substituer a `legalName` dans un champ qui exige la denomination sociale. */
  tradeName?: string | undefined;
  siren?: string | undefined;
  legalForm?: string | undefined;
  vatNumber?: string | undefined;
  /** Établissement PRINCIPAL uniquement (mission A4 §18 "ne pas utiliser systématiquement le
   *  premier établissement") — `undefined` si aucun établissement n'est encore déclaré, jamais
   *  substitué par un établissement secondaire arbitraire. */
  principalEstablishment?:
    | Readonly<{
        siret: string;
        addressLine?: string | undefined;
        postalCode?: string | undefined;
        city?: string | undefined;
        country?: string | undefined;
      }>
    | undefined;
}>;

export type ResolveCandidateIdentityQuery = Readonly<{
  organizationId: string;
  candidateCompanyId?: string | undefined;
}>;

@Injectable()
export class ResolveCandidateIdentityUseCase {
  constructor(@Inject(CANDIDATE_COMPANY_REPOSITORY) private readonly candidateCompanyRepository: CandidateCompanyRepository) {}

  async execute(query: ResolveCandidateIdentityQuery): Promise<CandidateIdentitySummary> {
    if (query.candidateCompanyId === undefined) {
      return { source: CandidateIdentitySource.None };
    }

    const company = await this.candidateCompanyRepository.findById({
      organizationId: query.organizationId,
      candidateCompanyId: query.candidateCompanyId,
    });
    if (!company) {
      return { source: CandidateIdentitySource.None };
    }

    const establishments = await this.candidateCompanyRepository.listEstablishmentsByCompany({
      organizationId: query.organizationId,
      candidateCompanyId: query.candidateCompanyId,
    });
    const principal = establishments.find((establishment) => establishment.isPrincipal);

    return {
      source: CandidateIdentitySource.CandidateCompany,
      candidateCompanyId: company.id,
      displayName: company.legalName ?? company.name,
      legalName: company.legalName,
      tradeName: company.tradeName,
      siren: company.siren,
      legalForm: company.legalForm,
      vatNumber: company.vatNumber,
      principalEstablishment: principal
        ? {
            siret: principal.siret,
            addressLine: principal.addressLine,
            postalCode: principal.postalCode,
            city: principal.city,
            country: principal.country,
          }
        : undefined,
    };
  }
}
