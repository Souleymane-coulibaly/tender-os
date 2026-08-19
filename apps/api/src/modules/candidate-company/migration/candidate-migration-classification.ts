// Import DIRECT du fichier source, jamais le barrel — même correctif de cycle require() que
// `create-candidate-company.use-case.ts` (voir son commentaire pour le détail complet).
import { isValidSiren, isValidSiret } from "../../company-profile/domain/french-company-identifiers";

/**
 * TenderOS 2.1-A2 — classification du backfill `ClientAccount`/`company-profile` → `CandidateCompany`.
 *
 * Mission §6 : INTERDIT de considérer automatiquement 1 ClientAccount = 1 CandidateCompany. Les
 * seuls signaux réellement disponibles et structurellement fiables sont :
 *  - la présence d'un `CompanyLegalIdentity` ACTIF pour ce `ClientAccount` (relation 1:1 réelle,
 *    `@@unique([clientAccountId, organizationId])`) — c'est la RAISON D'ÊTRE du module
 *    company-profile (déjà utilisé comme source de `candidate.siret` par les formulaires DC1/DC2/
 *    DC4, voir administrative-dossier) ;
 *  - la validité Luhn indépendante de son SIREN et de son SIRET principal (réutilisée depuis
 *    `company-profile/domain/french-company-identifiers.ts`, jamais réimplémentée/dérivée) ;
 *  - la présence d'au moins un enregistrement satellite (représentants, comptes bancaires,
 *    assurances, certifications, références, ressources humaines/matérielles) en l'absence de
 *    `CompanyLegalIdentity`.
 *
 * Aucune règle de seuil arbitraire (ex. "3 certifications = candidat") n'est inventée — seule la
 * PRÉSENCE des signaux compte, jamais leur nombre.
 *
 * Point important (mission §14) : un SIRET valide n'implique PAS mathématiquement que ses 9 premiers
 * chiffres forment un SIREN valide au sens de la fonction `isValidSiren` de ce dépôt (les deux
 * calculs Luhn ont un alignement de parité différent — l'un sur 14 chiffres, l'autre sur 9). Cette
 * classification ne dérive donc JAMAIS un SIREN à partir d'un SIRET : si seul le SIRET est
 * vérifiable, la `CandidateCompany` est migrée SANS SIREN (`useSiren: null`), jamais avec une valeur
 * fabriquée.
 */
export const CandidateMigrationClassification = {
  AutoMigratable: "AUTO_MIGRATABLE",
  MigratableWithRule: "MIGRATABLE_WITH_RULE",
  RequiresReview: "REQUIRES_REVIEW",
  NotACandidate: "NOT_A_CANDIDATE",
  AlreadyMigrated: "ALREADY_MIGRATED",
} as const;
export type CandidateMigrationClassification = (typeof CandidateMigrationClassification)[keyof typeof CandidateMigrationClassification];

export type LegalIdentitySignal = Readonly<{
  status: string;
  siren: string | null;
  siretPrincipal: string | null;
}>;

export type ClientAccountMigrationInput = Readonly<{
  /** Vrai si une `CandidateCompany` avec ce `sourceClientAccountId` existe déjà dans cette
   *  organisation (clé d'idempotence, mission §11/§35) — calculé par l'appelant via
   *  `CandidateCompanyRepository.findBySourceClientAccountId`, jamais recalculé ici. */
  alreadyMigrated: boolean;
  legalIdentity: LegalIdentitySignal | null;
  /** Somme des 7 listes satellites (representatives, bankAccounts, insurances, certifications,
   *  references, humanResources, materialResources) — présence uniquement, jamais un seuil. */
  satelliteRecordCount: number;
}>;

export type ClassificationResult = Readonly<{
  classification: CandidateMigrationClassification;
  reason: string;
  /** SIREN à persister sur `CandidateCompany.siren` — `null` sauf si indépendamment Luhn-valide. */
  useSiren: string | null;
  /** SIRET à utiliser pour créer le `CandidateEstablishment` principal — `null` sauf si
   *  indépendamment Luhn-valide. */
  useSiretPrincipal: string | null;
}>;

export function classifyClientAccountForCandidateMigration(input: ClientAccountMigrationInput): ClassificationResult {
  const hasActiveLegalIdentity = input.legalIdentity !== null && input.legalIdentity.status === "ACTIVE";
  const siren = hasActiveLegalIdentity ? input.legalIdentity!.siren : null;
  const siretPrincipal = hasActiveLegalIdentity ? input.legalIdentity!.siretPrincipal : null;
  const sirenValid = siren !== null && isValidSiren(siren);
  const siretValid = siretPrincipal !== null && isValidSiret(siretPrincipal);

  if (input.alreadyMigrated) {
    // Les identifiants vérifiés sont recalculés même ici (mission §25 — réparation idempotente) :
    // si une exécution précédente a créé la CandidateCompany mais a été interrompue avant l'ajout de
    // son CandidateEstablishment, l'orchestrateur du backfill a besoin de `useSiretPrincipal` pour
    // rattraper l'établissement manquant sans jamais recréer la société.
    return {
      classification: CandidateMigrationClassification.AlreadyMigrated,
      reason: "A CandidateCompany already exists for this ClientAccount (sourceClientAccountId match).",
      useSiren: sirenValid ? siren : null,
      useSiretPrincipal: siretValid ? siretPrincipal : null,
    };
  }

  if (input.legalIdentity !== null && !hasActiveLegalIdentity) {
    // Une identité légale existe mais n'est pas ACTIVE (ex. ARCHIVED) — signal réel qu'il y a EU un
    // profil candidat, jamais assimilable à "aucun signal du tout" (NOT_A_CANDIDATE) ni migrable
    // automatiquement : revue humaine requise (mission §7/§19).
    return {
      classification: CandidateMigrationClassification.RequiresReview,
      reason: "A CompanyLegalIdentity exists but is not ACTIVE — real candidate signal, but not safe to auto-migrate without review.",
      useSiren: null,
      useSiretPrincipal: null,
    };
  }

  if (!hasActiveLegalIdentity) {
    if (input.satelliteRecordCount === 0) {
      return {
        classification: CandidateMigrationClassification.NotACandidate,
        reason: "No active CompanyLegalIdentity and no company-profile satellite record — plain commercial client.",
        useSiren: null,
        useSiretPrincipal: null,
      };
    }
    return {
      classification: CandidateMigrationClassification.RequiresReview,
      reason: "Company-profile satellite records exist but no active CompanyLegalIdentity anchors them — cannot build a CandidateCompany without fabricating an identity.",
      useSiren: null,
      useSiretPrincipal: null,
    };
  }

  if (sirenValid) {
    return {
      classification: CandidateMigrationClassification.AutoMigratable,
      reason: "Active CompanyLegalIdentity with an independently SIREN-Luhn-valid identifier.",
      useSiren: siren,
      useSiretPrincipal: siretValid ? siretPrincipal : null,
    };
  }

  if (siretValid) {
    return {
      classification: CandidateMigrationClassification.MigratableWithRule,
      reason: "Active CompanyLegalIdentity with a valid SIRET but no independently valid SIREN — CandidateCompany migrated without a SIREN (never derived from the SIRET), CandidateEstablishment created from the verified SIRET.",
      useSiren: null,
      useSiretPrincipal: siretPrincipal,
    };
  }

  return {
    classification: CandidateMigrationClassification.RequiresReview,
    reason: "Active CompanyLegalIdentity present but neither its SIREN nor its SIRET passes Luhn validation — no verifiable identifier to migrate automatically.",
    useSiren: null,
    useSiretPrincipal: null,
  };
}
