import { Injectable } from "@nestjs/common";
import { GetCompanyProfileUseCase } from "../../../../company-profile";
import { GetTenderUseCase } from "../../../../tenders";
import { AdministrativeFormFieldStatus } from "../../../domain/administrative-form-field-status";
import { summarizeAdministrativeFormReadiness, type AdministrativeFormFieldReadiness, type AdministrativeFormReadiness } from "../../../domain/administrative-form-readiness";
import { FormFieldSource } from "../../../domain/form-field-source";
import { ConsortiumMemberNotFoundError } from "../../../domain/errors";
import { GetConsortiumUseCase } from "../../use-cases/consortium.use-cases";

/** V2 Sprint 11B — un DC2 concerne toujours UN opérateur économique explicite (mission §9) : soit
 *  le candidat du Tender lui-même (candidature individuelle OU le candidat/mandataire au sein d'un
 *  groupement), soit un membre PRÉCIS du groupement désigné par son `memberId` stable (voir
 *  `Consortium.members[].memberId`). Jamais résolu implicitement ("premier membre"). */
export type Dc2OperatorScope = Readonly<{ kind: "CANDIDATE" }> | Readonly<{ kind: "MEMBER"; memberId: string }>;

export type Dc2OfficialFormResolution = Readonly<{
  readiness: AdministrativeFormReadiness;
  data: Readonly<Record<string, unknown>>;
  /** Clé de portée stable pour `GeneratedDocument.subjectId` — jamais dérivée ailleurs que dans ce
   *  résolveur, jamais recalculée différemment par un autre appelant. */
  subjectId: string;
  operatorLabel: string;
}>;

/**
 * V2 Sprint 11B — résout les 15 champs du template DC2 réel préparé (`assets/dc2-template-v1.docx`
 * — voir l'en-tête de `scripts/prepare-dc2-template.ts` pour le détail rubrique par rubrique de ce
 * qui est mappé/différé et pourquoi), PLUS 2 champs de readiness sans placeholder correspondant
 * (`dc2.financialCapacity`/`dc2.technicalCapacity`, correctif audit Codex P2 — les zones F1/G1 du
 * DC2 officiel restent honnêtement visibles comme `NEEDS_REVIEW` plutôt qu'invisibles par simple
 * absence du gabarit dérivé). Mission §7/§8/§9 : un candidat individuel réutilise SA fiche
 * (`CompanyLegalIdentity` via `GetCompanyProfileUseCase`, même source que DC1/DC4) ; un membre de
 * groupement réutilise UNIQUEMENT les champs réellement portés par `Consortium.members[memberId]`
 * (`name`→tradeName, `legalIdentifier`→siret) — `Consortium.members` est un JSON de valeur SANS
 * coordonnées structurées (adresse/email/téléphone/forme juridique, vérifié dès l'audit Sprint
 * 11A), donc ces champs restent honnêtement `MISSING` pour un membre, jamais recopiés depuis le
 * candidat ou un autre membre (mission §11 "aucune contamination").
 */
@Injectable()
export class Dc2OfficialFormResolver {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly getCompanyProfileUseCase: GetCompanyProfileUseCase,
    private readonly getConsortiumUseCase: GetConsortiumUseCase,
  ) {}

  async resolve(input: { organizationId: string; actorId: string; actorRole: string; tenderId: string; scope: Dc2OperatorScope }): Promise<Dc2OfficialFormResolution> {
    const tender = await this.getTenderUseCase.execute({ organizationId: input.organizationId, tenderId: input.tenderId, actorId: input.actorId, actorRole: input.actorRole });

    const fields: AdministrativeFormFieldReadiness[] = [];
    const data: Record<string, unknown> = {};
    const put = (fieldKey: string, label: string, required: boolean, value: string | boolean | undefined, source: FormFieldSource | undefined, forcedStatus?: AdministrativeFormFieldStatus, reviewReason?: string) => {
      const status = forcedStatus ?? (value === undefined || value === "" ? AdministrativeFormFieldStatus.Missing : AdministrativeFormFieldStatus.Available);
      fields.push({ fieldKey, label, required, status, value: status === AdministrativeFormFieldStatus.Available ? value : undefined, source, reviewReason });
      if (status === AdministrativeFormFieldStatus.Available && value !== undefined) data[fieldKey] = value;
    };

    let subjectId: string;
    let operatorLabel: string;

    if (input.scope.kind === "CANDIDATE") {
      subjectId = "candidate";
      const companyProfile = await this.getCompanyProfileUseCase.execute({ organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, clientAccountId: tender.clientAccountId });
      const legalIdentity = companyProfile.legalIdentity;
      operatorLabel = legalIdentity?.tradeName ?? legalIdentity?.legalName ?? "Candidat";
      const address = legalIdentity ? [legalIdentity.addressLine, [legalIdentity.postalCode, legalIdentity.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : undefined;

      put("candidate.tradeName", "Nom commercial", true, legalIdentity?.tradeName ?? legalIdentity?.legalName ?? undefined, FormFieldSource.ClientProfile);
      put("candidate.address", "Adresse", true, address, FormFieldSource.ClientProfile);
      put("candidate.email", "Courriel", false, legalIdentity?.generalEmail ?? undefined, FormFieldSource.ClientProfile);
      put("candidate.phone", "Téléphone", false, legalIdentity?.phone ?? undefined, FormFieldSource.ClientProfile);
      put("candidate.siret", "SIRET", true, legalIdentity?.siretPrincipal ?? undefined, FormFieldSource.ClientProfile);
      put("candidate.legalForm", "Forme juridique", false, legalIdentity?.legalForm ?? undefined, FormFieldSource.ClientProfile);
    } else {
      const memberId = input.scope.memberId;
      subjectId = `member:${memberId}`;
      const consortium = await this.getConsortiumUseCase.execute({ organizationId: input.organizationId, actorId: input.actorId, actorRole: input.actorRole, tenderId: input.tenderId });
      const member = consortium?.members.find((m) => m.memberId === memberId);
      if (!member) throw new ConsortiumMemberNotFoundError();
      operatorLabel = member.name;

      put("candidate.tradeName", "Nom commercial", true, member.name, FormFieldSource.GroupMember);
      put("candidate.siret", "SIRET", true, member.legalIdentifier, FormFieldSource.GroupMember);
      // Gap structurel réel, déjà documenté en Sprint 11A pour `mandataire.*` — `Consortium.members`
      // ne porte aucune coordonnée structurée au-delà de name/legalIdentifier/role/scopeDescription/
      // percentage. Jamais recopié depuis le candidat ou un autre membre.
      put("candidate.address", "Adresse", true, undefined, undefined, AdministrativeFormFieldStatus.Missing, "Le répertoire des membres du groupement ne porte pas d'adresse structurée — à compléter manuellement.");
      put("candidate.email", "Courriel", false, undefined, undefined, AdministrativeFormFieldStatus.Missing, "Non disponible dans le répertoire des membres.");
      put("candidate.phone", "Téléphone", false, undefined, undefined, AdministrativeFormFieldStatus.Missing, "Non disponible dans le répertoire des membres.");
      put("candidate.legalForm", "Forme juridique", false, undefined, undefined, AdministrativeFormFieldStatus.Missing, "Non disponible dans le répertoire des membres.");
    }

    // Rubrique C1 — aucune donnée TenderOS pour la classification PME (aucun champ équivalent sur
    // `CompanyLegalIdentity`/`Consortium.members`) : jamais devinée depuis l'effectif ou un autre
    // proxy, une déclaration explicite est nécessaire.
    put("dc2.pmeOui", "PME (oui)", false, undefined, undefined, AdministrativeFormFieldStatus.NeedsReview, "Aucune classification PME enregistrée dans TenderOS — déclaration à confirmer.");
    put("dc2.pmeNon", "PME (non)", false, undefined, undefined, AdministrativeFormFieldStatus.NeedsReview, "Idem.");

    // Correctif audit Codex P2 — F1 (chiffres d'affaires 3 exercices) et G1 (capacité technique :
    // effectifs/moyens/références) ne sont PAS dans les 15 placeholders du gabarit dérivé (zones en
    // tableau pour F1, texte libre long pour G1 — voir `scripts/prepare-dc2-template.ts`). Jamais
    // silencieusement absentes de la readiness pour autant : signalées explicitement ici, jamais un
    // 0/valeur inventée, jamais recopiées d'un autre membre. `dc2.financialCapacity`/
    // `dc2.technicalCapacity` ne rejoignent jamais `data` (aucun placeholder ne les consomme) — leur
    // seul rôle est d'empêcher une readiness DC2 trop optimiste par omission.
    put(
      "dc2.financialCapacity",
      "Capacités économiques et financières (CA 3 derniers exercices)",
      false,
      undefined,
      undefined,
      AdministrativeFormFieldStatus.NeedsReview,
      "Aucune donnée de chiffre d'affaires enregistrée dans TenderOS (aucun satellite financier sur la fiche entreprise) — cette rubrique du DC2 officiel doit être complétée manuellement, jamais laissée à 0.",
    );
    put(
      "dc2.technicalCapacity",
      "Capacité technique et professionnelle (effectifs, moyens, références)",
      false,
      undefined,
      undefined,
      AdministrativeFormFieldStatus.NeedsReview,
      "Le préremplissage automatique depuis les références/moyens humains et matériels de la fiche entreprise n'est pas encore implémenté (synthèse hors périmètre de ce sprint) — à compléter manuellement.",
    );

    // Rubriques C2/C3/F3/H — cases conditionnelles rares, aucune donnée métier TenderOS équivalente.
    for (const [key, label] of [
      ["dc2.reservedMarketCheckbox1", "Marché réservé — cas 1"],
      ["dc2.reservedMarketCheckbox2", "Marché réservé — cas 2"],
      ["dc2.reservedMarketCheckbox3", "Marché réservé — cas 3"],
      ["dc2.officialListCheckbox1", "Liste officielle — inscription"],
      ["dc2.officialListCheckbox2", "Déclaration simplifiée"],
      ["dc2.insuranceCheckbox", "Assurance décennale (travaux)"],
      ["dc2.otherOperatorsCheckbox", "Appui sur d'autres opérateurs"],
    ] as const) {
      put(key, label, false, undefined, undefined, AdministrativeFormFieldStatus.NeedsReview, "Aucune donnée métier TenderOS équivalente — déclaration à confirmer si applicable.");
    }

    return { readiness: summarizeAdministrativeFormReadiness("DC2", fields), data, subjectId, operatorLabel };
  }
}
