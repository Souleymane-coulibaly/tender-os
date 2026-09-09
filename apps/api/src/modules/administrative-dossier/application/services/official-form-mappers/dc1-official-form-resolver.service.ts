import { Injectable } from "@nestjs/common";
import { resolveCandidateContact } from "./candidate-contact.resolver";
import { CandidateCompanyRequiredError, ResolveCandidateIdentityUseCase } from "../../../../candidate-company";
import { ResolveCandidateCapabilitiesUseCase } from "../../../../company-profile";
import { GetTenderUseCase } from "../../../../tenders";
import { Dc1CandidateType } from "../../../domain/dc1-declaration.aggregate";
import { ConsortiumType } from "../../../domain/consortium.aggregate";
import { AdministrativeFormFieldStatus } from "../../../domain/administrative-form-field-status";
import { summarizeAdministrativeFormReadiness, type AdministrativeFormFieldReadiness, type AdministrativeFormReadiness } from "../../../domain/administrative-form-readiness";
import { FormFieldSource } from "../../../domain/form-field-source";
import { GetConsortiumUseCase } from "../../use-cases/consortium.use-cases";
import { GetDc1DeclarationUseCase } from "../../use-cases/dc1-declaration.use-cases";
import { buildOfficialCompanyName } from "./official-company-name";

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
 * `Consortium`, `Tender`, et l'identité de la `CandidateCompany` — jamais une
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
 *
 * V2 Sprint 26 (Checkpoint 2.1-A4) — `candidate.siret`/`tradeName`/`address` préfèrent désormais la
 * SOT `CandidateCompany`/`CandidateEstablishment` (A1/A3, via `ResolveCandidateIdentityUseCase`,
 * "Candidate Context" canonique) quand `Tender.candidateCompanyId` est renseigné (NEW FLOW) ; retombe
 * sur `company-profile.legalIdentity` (`clientAccountId`) sinon (LEGACY FLOW — Tender sans
 * `candidateCompanyId`, jamais rétroactivement rempli, voir A2/A3).
 *
 * V2 Sprint 26 (Checkpoint TENDEROS-2.1-P2.2-F3.1, correctif audit Codex P1) — `candidate.email`/
 * `phone` ne retombent PLUS sur `legalIdentity` (le CLIENT COMMERCIAL) en NEW FLOW :
 * `CandidateCompany` ne porte aucun champ de contact (mission A1 §6, minimalisme) et aucune autre
 * SOT candidate-native n'existe (`Signatory`/`CompanyRepresentative` restent scopés
 * `clientAccountId`) — ces deux champs restent honnêtement `MISSING` en NEW FLOW plutôt que
 * d'emprunter silencieusement l'identité du client commercial. En LEGACY FLOW (candidat == client
 * commercial), `legalIdentity` reste la SEULE source légitime, inchangée.
 */
@Injectable()
export class Dc1OfficialFormResolver {
  constructor(
    private readonly getDc1DeclarationUseCase: GetDc1DeclarationUseCase,
    private readonly getConsortiumUseCase: GetConsortiumUseCase,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly resolveCandidateIdentityUseCase: ResolveCandidateIdentityUseCase,
    private readonly resolveCandidateCapabilitiesUseCase: ResolveCandidateCapabilitiesUseCase,
  ) {}

  async resolve(input: { organizationId: string; actorId: string; actorRole: string; tenderId: string }): Promise<Dc1OfficialFormResolution> {
    const [dc1, tender] = await Promise.all([
      this.getDc1DeclarationUseCase.execute({ organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, tenderId: input.tenderId }),
      this.getTenderUseCase.execute({ organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, tenderId: input.tenderId }),
    ]);

    // Checkpoint TENDEROS-2.1-CCV2-G.2 — POLICY A appliquée à la GÉNÉRATION COURANTE.
    //
    // Le repli sur `CompanyProfile` (profil du CLIENT commercial) est SUPPRIMÉ : il décrivait une
    // autre personne morale que celle qui candidate, et l'imprimer dans un formulaire officiel
    // revenait à déclarer la mauvaise entreprise à l'acheteur public.
    //
    // Un Tender historique sans entreprise candidate reste LISIBLE et ses formulaires déjà générés
    // restent intacts : seule une RÉSOLUTION NOUVELLE est refusée, explicitement, tant qu'un
    // utilisateur autorisé n'a pas désigné l'entreprise candidate (contrat officiel CCV2-F.2).
    //
    // L'erreur est levée AVANT toute lecture : aucune requête `CompanyProfile` ne part.
    if (!tender.candidateCompanyId) {
      throw new CandidateCompanyRequiredError();
    }

    const [candidateIdentity, candidateCapabilities, consortium] = await Promise.all([
      this.resolveCandidateIdentityUseCase.execute({ organizationId: input.organizationId, candidateCompanyId: tender.candidateCompanyId }),
      this.resolveCandidateCapabilitiesUseCase.execute({ organizationId: input.organizationId, candidateCompanyId: tender.candidateCompanyId }),
      dc1?.candidateType === Dc1CandidateType.Consortium
        ? this.getConsortiumUseCase.execute({ organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, tenderId: input.tenderId })
        : Promise.resolve(null),
    ]);

    const isConsortium = dc1?.candidateType === Dc1CandidateType.Consortium;
    // La source est TOUJOURS l'entreprise candidate : le garde ci-dessus l'a rendue obligatoire.
    const candidateSource = FormFieldSource.CandidateCompanyProfile;

    // H.6 — champ officiel COMBINE « nom commercial et denomination sociale » (DC1 P46).
    const candidateTradeName = buildOfficialCompanyName({ legalOrDisplayName: candidateIdentity.displayName, tradeName: candidateIdentity.tradeName });
    const candidateSiret = candidateIdentity.principalEstablishment?.siret;
    const candidateAddress = candidateIdentity.principalEstablishment
      ? [candidateIdentity.principalEstablishment.addressLine, [candidateIdentity.principalEstablishment.postalCode, candidateIdentity.principalEstablishment.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
      : undefined;
    // Checkpoint TENDEROS-2.1-P2.2-F3.1 (correctif audit Codex P1) — `CandidateCompany` ne porte
    // aucun champ email/téléphone (`CANDIDATE_CONTACT_SOURCE_AUDIT` : aucune SOT candidate-native
    // trouvée ailleurs — `Signatory`/`CompanyRepresentative` restent tous deux scopés
    // `clientAccountId`, jamais `candidateCompanyId`). En NEW FLOW, `legalIdentity` appartient au
    // CLIENT COMMERCIAL, jamais au candidat : ne plus jamais l'utiliser comme repli silencieux pour
    // ces deux champs (mission §4 "ne pas inventer candidate.email = client.email"). Reste `undefined`
    // (→ statut MISSING via `put`, jamais une valeur fabriquée) tant qu'aucune SOT candidate-native
    // n'existe (`CANDIDATE_CONTACT_MISSING_USES_NEEDS_REVIEW`). En LEGACY FLOW, comportement
    // historique inchangé — `legalIdentity` reste la SOT légitime (candidat == client commercial).
    // Checkpoint CCV2-E — ferme CCV2-01/P0-02. En NEW FLOW, le contact vient désormais des
    // REPRÉSENTANTS de l'entreprise candidate (`CompanyRepresentative` rattaché à
    // `CandidateCompany` depuis CCV2-B/C), jamais du client commercial. Aucune valeur n'est
    // fabriquée : sans représentant porteur, le champ reste MISSING comme auparavant.
    const candidateContact = resolveCandidateContact(candidateCapabilities);
    const candidateEmail = candidateContact?.email;
    const candidatePhone = candidateContact?.phone;
    const candidateContactSource = FormFieldSource.CandidateCompanyProfile;

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

    put("candidate.tradeName", "Nom commercial du candidat", true, candidateTradeName, candidateSource);
    put("candidate.address", "Adresse du candidat", true, candidateAddress, candidateSource);
    put("candidate.email", "Courriel du candidat", false, candidateEmail, candidateContactSource);
    put("candidate.phone", "Téléphone du candidat", false, candidatePhone, candidateContactSource);
    put("candidate.siret", "SIRET du candidat", true, candidateSiret, candidateSource);

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
