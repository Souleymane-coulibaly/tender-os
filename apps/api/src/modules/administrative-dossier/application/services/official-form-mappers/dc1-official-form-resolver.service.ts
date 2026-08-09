import { Injectable } from "@nestjs/common";
import { GetCompanyProfileUseCase } from "../../../../company-profile";
import { GetTenderUseCase } from "../../../../tenders";
import { Dc1CandidateType } from "../../../domain/dc1-declaration.aggregate";
import { ConsortiumType } from "../../../domain/consortium.aggregate";
import { AdministrativeFormFieldStatus } from "../../../domain/administrative-form-field-status";
import { summarizeAdministrativeFormReadiness, type AdministrativeFormFieldReadiness, type AdministrativeFormReadiness } from "../../../domain/administrative-form-readiness";
import { FormFieldSource } from "../../../domain/form-field-source";
import { GetConsortiumUseCase } from "../../use-cases/consortium.use-cases";
import { GetDc1DeclarationUseCase } from "../../use-cases/dc1-declaration.use-cases";

export type Dc1OfficialFormResolution = Readonly<{
  readiness: AdministrativeFormReadiness;
  /** Valeurs BRUTES (jamais formatées) keyées par `fieldKey` — le formatage (☒/☐, dates, devises)
   *  est appliqué par `DocumentGenerationExecutionService` via les `DocumentTemplateFieldMapping`
   *  du template actif (mission "jamais un second moteur de formatage"). N'inclut que les champs
   *  réellement résolus (`AVAILABLE`) — jamais une clé présente avec une valeur vide/inventée. */
  data: Readonly<Record<string, unknown>>;
}>;

const DC1_MEMBER_FIELDS_NOT_APPLICABLE_REASON = "Candidat individuel — le groupement ne s'applique pas.";

/**
 * V2 Sprint 11 — résout les 27 champs (+1 boucle) du template DC1 réel préparé
 * (`assets/dc1-template-v1.docx`, voir `scripts/prepare-dc1-template.ts` pour l'origine exacte de
 * chaque `fieldKey`) depuis les agrégats métier RÉELS déjà existants (`Dc1Declaration`,
 * `Consortium`, `Tender`, `CompanyLegalIdentity` via `GetCompanyProfileUseCase`) — jamais une
 * nouvelle copie de ces données, jamais une valeur inventée pour un champ absent (mission §19/§20).
 * Distinct de `mapDc4Form`/`PrepareOfficialFormUseCase` (Sprint 8C.1 — Annexe TenderOS
 * complémentaire) : ce résolveur alimente le remplissage du VRAI formulaire officiel via le moteur
 * Sprint 10, jamais l'ancien moteur de composition IR (`DOCUMENT_RENDERER`/`RenderableDocument`).
 * Champs volontairement non dérivés automatiquement (mission "jamais une valeur inventée quand
 * l'incertitude est réelle") : `dc1.scopeMarcheUnique/scopeTousLots/scopeLotSpecifique/lotNumeros`
 * (le lot ciblé est un choix de LANCEMENT, pas une donnée métier stockée) et
 * `dc1.mandataireSolidaireOui/Non` (`Consortium.liabilityMode` est un texte libre, non
 * mécaniquement traduisible en oui/non) — marqués `NEEDS_REVIEW`, jamais un statut `MISSING` qui
 * laisserait croire qu'il suffit de renseigner une fiche pour les résoudre.
 */
@Injectable()
export class Dc1OfficialFormResolver {
  constructor(
    private readonly getDc1DeclarationUseCase: GetDc1DeclarationUseCase,
    private readonly getConsortiumUseCase: GetConsortiumUseCase,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly getCompanyProfileUseCase: GetCompanyProfileUseCase,
  ) {}

  async resolve(input: { organizationId: string; actorId: string; actorRole: string; tenderId: string }): Promise<Dc1OfficialFormResolution> {
    const [dc1, tender] = await Promise.all([
      this.getDc1DeclarationUseCase.execute({ organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, tenderId: input.tenderId }),
      this.getTenderUseCase.execute({ organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, tenderId: input.tenderId }),
    ]);

    const [companyProfile, consortium] = await Promise.all([
      this.getCompanyProfileUseCase.execute({ organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, clientAccountId: tender.clientAccountId }),
      dc1?.candidateType === Dc1CandidateType.Consortium
        ? this.getConsortiumUseCase.execute({ organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, tenderId: input.tenderId })
        : Promise.resolve(null),
    ]);

    const legalIdentity = companyProfile.legalIdentity;
    const isConsortium = dc1?.candidateType === Dc1CandidateType.Consortium;
    const address = legalIdentity ? [legalIdentity.addressLine, [legalIdentity.postalCode, legalIdentity.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : undefined;

    const fields: AdministrativeFormFieldReadiness[] = [];
    const data: Record<string, unknown> = {};

    const put = (fieldKey: string, label: string, required: boolean, value: string | boolean | undefined, source: FormFieldSource | undefined, status?: AdministrativeFormFieldStatus, reviewReason?: string) => {
      const resolvedStatus = status ?? (value === undefined || value === "" ? AdministrativeFormFieldStatus.Missing : AdministrativeFormFieldStatus.Available);
      fields.push({ fieldKey, label, required, status: resolvedStatus, value: resolvedStatus === AdministrativeFormFieldStatus.Available ? value : undefined, source, reviewReason });
      if (resolvedStatus === AdministrativeFormFieldStatus.Available && value !== undefined) {
        data[fieldKey] = value;
      }
    };

    put("tender.buyerIdentification", "Identification de l'acheteur", true, tender.buyerName, FormFieldSource.Tender);
    put("tender.consultationObject", "Objet de la consultation", true, tender.title, FormFieldSource.Tender);

    // Choix de lot/périmètre : décision de LANCEMENT, jamais dérivée automatiquement d'une donnée
    // stockée — jamais une valeur devinée (mission "jamais une valeur inventée").
    put("dc1.scopeMarcheUnique", "Marché unique (case à cocher)", false, undefined, undefined, AdministrativeFormFieldStatus.NeedsReview, "Le périmètre (marché unique / tous les lots / lot(s) spécifique(s)) est un choix à faire au lancement de la génération.");
    put("dc1.scopeTousLots", "Tous les lots (case à cocher)", false, undefined, undefined, AdministrativeFormFieldStatus.NeedsReview, "Idem — choix de lancement.");
    put("dc1.scopeLotSpecifique", "Lot(s) spécifique(s) (case à cocher)", false, undefined, undefined, AdministrativeFormFieldStatus.NeedsReview, "Idem — choix de lancement.");
    put("dc1.lotNumeros", "Numéro(s) de lot(s) concerné(s)", false, undefined, undefined, AdministrativeFormFieldStatus.NeedsReview, "Dépend du choix de périmètre ci-dessus.");

    put("dc1.candidatSeul", "Candidat seul (case à cocher)", true, dc1 ? !isConsortium : undefined, dc1 ? FormFieldSource.AdministrativeDossier : undefined);

    put("candidate.tradeName", "Nom commercial du candidat", true, legalIdentity?.tradeName ?? legalIdentity?.legalName ?? undefined, FormFieldSource.ClientProfile);
    put("candidate.address", "Adresse du candidat", true, address, FormFieldSource.ClientProfile);
    put("candidate.email", "Courriel du candidat", false, legalIdentity?.generalEmail ?? undefined, FormFieldSource.ClientProfile);
    put("candidate.phone", "Téléphone du candidat", false, legalIdentity?.phone ?? undefined, FormFieldSource.ClientProfile);
    put("candidate.siret", "SIRET du candidat", true, legalIdentity?.siretPrincipal ?? undefined, FormFieldSource.ClientProfile);

    put("dc1.groupementEntreprises", "Groupement d'entreprises (case à cocher)", true, dc1 ? isConsortium : undefined, dc1 ? FormFieldSource.AdministrativeDossier : undefined);

    if (isConsortium && consortium) {
      put("dc1.groupementConjoint", "Groupement conjoint (case à cocher)", true, consortium.type === ConsortiumType.Joint, FormFieldSource.AdministrativeDossier);
      put("dc1.groupementSolidaire", "Groupement solidaire (case à cocher)", true, consortium.type === ConsortiumType.Solidarity, FormFieldSource.AdministrativeDossier);
    } else {
      put("dc1.groupementConjoint", "Groupement conjoint (case à cocher)", false, undefined, undefined, AdministrativeFormFieldStatus.NotApplicable);
      put("dc1.groupementSolidaire", "Groupement solidaire (case à cocher)", false, undefined, undefined, AdministrativeFormFieldStatus.NotApplicable);
    }

    if (isConsortium && consortium?.type === ConsortiumType.Joint) {
      // `Consortium.liabilityMode` est un texte libre (mission §15) — jamais mécaniquement
      // traduisible en oui/non, un humain doit trancher.
      put("dc1.mandataireSolidaireNon", "Le mandataire n'est pas solidaire (case à cocher)", false, undefined, undefined, AdministrativeFormFieldStatus.NeedsReview, "Non dérivable automatiquement du texte libre « modalités de responsabilité » du groupement.");
      put("dc1.mandataireSolidaireOui", "Le mandataire est solidaire (case à cocher)", false, undefined, undefined, AdministrativeFormFieldStatus.NeedsReview, "Idem.");
    } else {
      put("dc1.mandataireSolidaireNon", "Le mandataire n'est pas solidaire (case à cocher)", false, undefined, undefined, AdministrativeFormFieldStatus.NotApplicable);
      put("dc1.mandataireSolidaireOui", "Le mandataire est solidaire (case à cocher)", false, undefined, undefined, AdministrativeFormFieldStatus.NotApplicable);
    }

    if (isConsortium && consortium && consortium.members.length > 0) {
      const members = consortium.members.map((m) => ({ lotNumber: "", identity: [m.name, m.legalIdentifier].filter(Boolean).join(" — "), prestations: m.scopeDescription ?? "" }));
      fields.push({ fieldKey: "dc1.members", label: "Membres du groupement", required: true, status: AdministrativeFormFieldStatus.Available, source: FormFieldSource.GroupMember });
      data["dc1.members"] = members;
    } else if (isConsortium) {
      fields.push({ fieldKey: "dc1.members", label: "Membres du groupement", required: true, status: AdministrativeFormFieldStatus.Missing });
    } else {
      fields.push({ fieldKey: "dc1.members", label: "Membres du groupement", required: false, status: AdministrativeFormFieldStatus.NotApplicable, reviewReason: DC1_MEMBER_FIELDS_NOT_APPLICABLE_REASON });
    }

    put("dc1.exclusionAttestation", "Attestation sur l'honneur — absence de motif d'exclusion", true, dc1?.exclusionAttestation ?? undefined, dc1 ? FormFieldSource.AdministrativeDossier : undefined);

    // Aucune source de données TenderOS pour une preuve d'accès à des documents externes —
    // toujours optionnel, jamais bloquant (mission "champ optionnel non fourni ≠ dette").
    put("dc1.proofUrl", "Adresse internet de la preuve", false, undefined, undefined);
    put("dc1.proofAccessInfo", "Informations d'accès à la preuve", false, undefined, undefined);

    put("dc1.capacitesViaDc2", "Capacités justifiées via DC2 (case à cocher)", false, dc1 ? true : undefined, dc1 ? FormFieldSource.AdministrativeDossier : undefined);
    put("dc1.capacitesViaDocuments", "Capacités justifiées via documents joints (case à cocher)", false, dc1 ? false : undefined, dc1 ? FormFieldSource.AdministrativeDossier : undefined);

    // Mandataire : `Consortium.members` est un JSON de valeur SANS coordonnées structurées
    // (adresse/email/téléphone/SIRET, voir mission §15/l'agrégat `Consortium`) — jamais une donnée
    // inventée pour compenser cette absence structurelle réelle, documentée dès l'audit préalable.
    if (!dc1 || !isConsortium) {
      for (const key of ["tradeName", "address", "email", "phone", "siret"] as const) {
        put(`mandataire.${key}`, `Mandataire — ${key}`, false, undefined, undefined, AdministrativeFormFieldStatus.NotApplicable);
      }
    } else {
      for (const key of ["tradeName", "address", "email", "phone", "siret"] as const) {
        put(`mandataire.${key}`, `Mandataire — ${key}`, false, undefined, undefined, AdministrativeFormFieldStatus.Missing, "Le répertoire des membres du groupement ne porte pas de coordonnées structurées — à compléter manuellement au lancement si le mandataire diffère du candidat.");
      }
    }

    return { readiness: summarizeAdministrativeFormReadiness("DC1", fields), data };
  }
}
