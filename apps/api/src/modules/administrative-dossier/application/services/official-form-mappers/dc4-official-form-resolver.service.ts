import { Inject, Injectable } from "@nestjs/common";
import { CandidateIdentitySource, ResolveCandidateIdentityUseCase } from "../../../../candidate-company";
import { GetCompanyProfileUseCase } from "../../../../company-profile";
import { GetTenderUseCase } from "../../../../tenders";
import { GetSubcontractorProfileUseCase, SubcontractorProfileNotFoundError } from "../../../../subcontractors";
import { AdministrativeFormFieldStatus } from "../../../domain/administrative-form-field-status";
import { summarizeAdministrativeFormReadiness, type AdministrativeFormFieldReadiness, type AdministrativeFormReadiness } from "../../../domain/administrative-form-readiness";
import { FormFieldSource } from "../../../domain/form-field-source";
import { SubcontractorDeclarationNotFoundError } from "../../../domain/errors";
import { SUBCONTRACTOR_DECLARATION_REPOSITORY, type SubcontractorDeclarationRepository } from "../../ports/subcontractor-declaration.repository";
import { formatMoney } from "../renderable-document-builders/shared";

export type Dc4OfficialFormResolution = Readonly<{
  readiness: AdministrativeFormReadiness;
  data: Readonly<Record<string, unknown>>;
  tenderId: string;
}>;

/**
 * V2 Sprint 11 — résout les 18 champs du template DC4 réel préparé (`assets/dc4-template-v1.docx`,
 * voir l'en-tête de `scripts/prepare-dc4-template.ts` pour le détail exact rubrique par rubrique de
 * ce qui est mappé et de ce qui est volontairement différé, avec sa raison technique réelle).
 * `titulaire.*` = l'entreprise candidate TenderOS elle-même (celle qui sous-traite une partie du
 * marché) ; `subcontractor.*` = le sous-traitant déclaré. Mission §29/§30 : PLUSIEURS
 * `SubcontractorDeclaration` indépendantes possibles par Tender — ce résolveur est appelé PAR
 * déclaration (`subcontractorDeclarationId`), jamais globalement au niveau Tender, garantissant
 * qu'un montant/lot/périmètre d'une déclaration ne contamine jamais une autre déclaration du même
 * Tender (mission "isolation stricte entre déclarations").
 *
 * Correctif audit Codex (revue post-livraison) — `subcontractor.signatoryName` n'est JAMAIS résolu
 * depuis `SubcontractorProfile.legalRepresentativeName` (mission "signataire ≠ représentant légal
 * sauf si le modèle métier le prévoit explicitement" — aucun champ "signataire" dédié n'existe sur
 * `SubcontractorProfile`, donc aucune donnée fiable à proposer) : reste `NEEDS_REVIEW`, jamais
 * auto-rempli dans `data`, un humain doit le renseigner explicitement.
 *
 * V2 Sprint 26 (Checkpoint 2.1-A4, correctif post-audit) — `titulaire.tradeName`/`siret`/`address`/
 * `legalForm` préfèrent la SOT `CandidateCompany`/`CandidateEstablishment` (via
 * `ResolveCandidateIdentityUseCase`) quand `Tender.candidateCompanyId` est renseigné (NEW FLOW),
 * sinon `company-profile.legalIdentity` (LEGACY FLOW) — même discipline que DC1/DC2.
 * `subcontractor.*` reste ENTIÈREMENT inchangé : le sous-traitant n'est jamais une `CandidateCompany`
 * (mission A4 §16 "ne pas confondre CandidateCompany et Subcontractor").
 */
@Injectable()
export class Dc4OfficialFormResolver {
  constructor(
    @Inject(SUBCONTRACTOR_DECLARATION_REPOSITORY) private readonly declarationRepository: SubcontractorDeclarationRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly getCompanyProfileUseCase: GetCompanyProfileUseCase,
    private readonly getSubcontractorProfileUseCase: GetSubcontractorProfileUseCase,
    private readonly resolveCandidateIdentityUseCase: ResolveCandidateIdentityUseCase,
  ) {}

  async resolve(input: { organizationId: string; actorId: string; actorRole: string; subcontractorDeclarationId: string }): Promise<Dc4OfficialFormResolution> {
    const declaration = await this.declarationRepository.findById({ organizationId: input.organizationId, subcontractorDeclarationId: input.subcontractorDeclarationId });
    if (!declaration) throw new SubcontractorDeclarationNotFoundError();

    const tender = await this.getTenderUseCase.execute({ organizationId: input.organizationId, tenderId: declaration.tenderId, actorId: input.actorId, actorRole: input.actorRole });
    const [companyProfile, candidateIdentity] = await Promise.all([
      this.getCompanyProfileUseCase.execute({ organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, clientAccountId: tender.clientAccountId }),
      this.resolveCandidateIdentityUseCase.execute({ organizationId: input.organizationId, candidateCompanyId: tender.candidateCompanyId }),
    ]);

    let subcontractorProfile: Awaited<ReturnType<GetSubcontractorProfileUseCase["execute"]>> | undefined;
    if (declaration.subcontractorProfileId) {
      try {
        subcontractorProfile = await this.getSubcontractorProfileUseCase.execute({ organizationId: input.organizationId, subcontractorProfileId: declaration.subcontractorProfileId, actorRole: input.actorRole });
      } catch (error) {
        if (!(error instanceof SubcontractorProfileNotFoundError)) throw error;
        // Référence dénormalisée obsolète (mission — "jamais de FK stricte inter-module", voir le
        // commentaire du schéma) : on retombe sur les champs propres à la déclaration, jamais une
        // erreur bloquante pour la préparation du formulaire.
      }
    }

    const legalIdentity = companyProfile.legalIdentity;
    const usesCandidateCompany = candidateIdentity.source === CandidateIdentitySource.CandidateCompany;
    const candidateSource = usesCandidateCompany ? FormFieldSource.CandidateCompanyProfile : FormFieldSource.ClientProfile;
    const titulaireTradeName = usesCandidateCompany ? candidateIdentity.displayName : (legalIdentity?.tradeName ?? legalIdentity?.legalName ?? undefined);
    const titulaireSiret = usesCandidateCompany ? candidateIdentity.principalEstablishment?.siret : (legalIdentity?.siretPrincipal ?? undefined);
    const titulaireAddress = usesCandidateCompany
      ? candidateIdentity.principalEstablishment
        ? [candidateIdentity.principalEstablishment.addressLine, [candidateIdentity.principalEstablishment.postalCode, candidateIdentity.principalEstablishment.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
        : undefined
      : legalIdentity
        ? [legalIdentity.addressLine, [legalIdentity.postalCode, legalIdentity.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
        : undefined;
    const subAddress = subcontractorProfile ? [subcontractorProfile.addressLine, [subcontractorProfile.postalCode, subcontractorProfile.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : undefined;

    const fields: AdministrativeFormFieldReadiness[] = [];
    const data: Record<string, unknown> = {};

    const put = (fieldKey: string, label: string, required: boolean, value: string | undefined, source: FormFieldSource | undefined, forcedStatus?: AdministrativeFormFieldStatus, reviewReason?: string) => {
      const status = forcedStatus ?? (value === undefined || value === "" ? AdministrativeFormFieldStatus.Missing : AdministrativeFormFieldStatus.Available);
      fields.push({ fieldKey, label, required, status, value: status === AdministrativeFormFieldStatus.Available ? value : undefined, source, reviewReason });
      if (status === AdministrativeFormFieldStatus.Available && value !== undefined) data[fieldKey] = value;
    };

    put("tender.buyerIdentification", "Identification de l'acheteur", true, tender.buyerName, FormFieldSource.Tender);
    put("tender.marketObject", "Objet du marché", true, tender.title, FormFieldSource.Tender);

    put("titulaire.tradeName", "Nom commercial du titulaire", true, titulaireTradeName, candidateSource);
    put("titulaire.address", "Adresse du titulaire", true, titulaireAddress, candidateSource);
    put("titulaire.email", "Courriel du titulaire", false, legalIdentity?.generalEmail ?? undefined, FormFieldSource.ClientProfile);
    put("titulaire.phone", "Téléphone du titulaire", false, legalIdentity?.phone ?? undefined, FormFieldSource.ClientProfile);
    put("titulaire.siret", "SIRET du titulaire", true, titulaireSiret, candidateSource);
    const titulaireLegalForm = usesCandidateCompany ? candidateIdentity.legalForm : (legalIdentity?.legalForm ?? undefined);
    put("titulaire.legalForm", "Forme juridique du titulaire", false, titulaireLegalForm, candidateSource);

    put("subcontractor.tradeName", "Nom commercial du sous-traitant", true, subcontractorProfile?.tradeName ?? subcontractorProfile?.legalName ?? declaration.subcontractorName, FormFieldSource.Subcontractor);
    put("subcontractor.address", "Adresse du sous-traitant", true, subAddress, FormFieldSource.Subcontractor);
    put("subcontractor.email", "Courriel du sous-traitant", false, subcontractorProfile?.contactEmail ?? undefined, FormFieldSource.Subcontractor);
    put("subcontractor.phone", "Téléphone du sous-traitant", false, subcontractorProfile?.contactPhone ?? undefined, FormFieldSource.Subcontractor);
    put("subcontractor.siret", "SIRET du sous-traitant", true, subcontractorProfile?.siret ?? declaration.subcontractorLegalIdentifier, FormFieldSource.Subcontractor);
    put("subcontractor.legalForm", "Forme juridique du sous-traitant", false, subcontractorProfile?.legalForm ?? undefined, FormFieldSource.Subcontractor);
    // Jamais auto-rempli depuis le représentant légal — voir le commentaire de classe.
    put(
      "subcontractor.signatoryName",
      "Signataire du sous-traitant",
      false,
      undefined,
      undefined,
      AdministrativeFormFieldStatus.NeedsReview,
      "Le signataire n'est jamais présumé identique au représentant légal déclaré sur la fiche sous-traitant — à confirmer explicitement.",
    );

    put("subcontractor.servicesDescription", "Nature des prestations sous-traitées", true, declaration.servicesDescription, FormFieldSource.Subcontractor);
    put("subcontractor.declaredAmount", "Montant des prestations sous-traitées", true, formatMoney(declaration.amountValue, declaration.amountCurrency), FormFieldSource.Subcontractor);
    put("subcontractor.durationMonths", "Durée du contrat de sous-traitance (mois)", false, declaration.durationMonths !== undefined ? String(declaration.durationMonths) : undefined, FormFieldSource.Subcontractor);

    return { readiness: summarizeAdministrativeFormReadiness("DC4", fields), data, tenderId: declaration.tenderId };
  }
}
