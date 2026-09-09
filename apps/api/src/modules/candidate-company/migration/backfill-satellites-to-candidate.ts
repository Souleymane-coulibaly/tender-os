import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Checkpoint TENDEROS-2.1-CCV2-B — backfill de PROPRIÉTÉ des satellites de capacités vers
 * `CandidateCompany`.
 *
 * MODÈLE : ASSOCIATION, jamais DÉPLACEMENT. Ce backfill n'écrit QUE `candidate_company_id` ; il ne
 * met jamais `client_account_id` à NULL, ne copie aucune ligne et n'en supprime aucune. Pour toute
 * famille : `BEFORE = AFTER` (le nombre total de lignes est un invariant), et `MIGRATED` est le
 * nombre de lignes ayant ACQUIS un propriétaire candidate. Aucune donnée ne peut donc être perdue,
 * et le chemin de lecture Legacy reste intact pendant toute la transition (mission §9/§12).
 *
 * IDEMPOTENCE : chaque UPDATE est borné par `candidate_company_id IS NULL`. Un second passage ne
 * trouve plus aucune ligne éligible et migre 0 ligne, sans jamais réécrire un propriétaire déjà
 * posé. Le pont utilisé est `CandidateCompany.sourceClientAccountId`, unique par organisation
 * (`@@unique([organizationId, sourceClientAccountId])`), ce qui rend l'appariement DÉTERMINISTE :
 * un ClientAccount ne peut correspondre qu'à au plus une CandidateCompany.
 *
 * GRANULARITÉ TRANSACTIONNELLE : une transaction PAR CandidateCompany. Un échec au milieu d'une
 * unité annule cette unité entière (jamais de demi-migration : les 7 familles d'un même candidat
 * sont migrées ensemble ou pas du tout) et laisse intactes les unités déjà validées — la reprise
 * consiste simplement à relancer.
 *
 * TENANT-SAFE : tous les prédicats portent `organization_id`, et la base elle-même refuse un
 * rattachement cross-organisation (FK composite `(candidate_company_id, organization_id)`) ainsi
 * qu'un lignage incohérent (FK à 3 colonnes vers `(id, organization_id, source_client_account_id)`).
 *
 * AUCUNE CRÉATION AUTOMATIQUE : un ClientAccount sans CandidateCompany n'est jamais promu
 * silencieusement (décision produit figée) — il est inscrit au registre de migration.
 */

/** Les 7 familles réellement repointées. `company_legal_identities` est exclu (son contenu est déjà
 *  porté par CandidateCompany/CandidateEstablishment — le repointer recréerait la duplication de SOT
 *  que CCV2 supprime) ; `company_reference_documents` l'est aussi (il suit `company_references` par
 *  cascade, sans colonne propre). */
export const SATELLITE_FAMILIES = [
  "companyRepresentative",
  "companyBankAccount",
  "companyInsurance",
  "companyCertification",
  "companyReference",
  "companyHumanResource",
  "companyMaterialResource",
] as const;

export type SatelliteFamily = (typeof SATELLITE_FAMILIES)[number];

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.2 — PRÉDICAT D'ÉLIGIBILITÉ par famille.
 *
 * Toutes les familles ne sont pas migrables en bloc. `company_representatives` porte DEUX
 * sémantiques distinctes dans la même table, et CCV2-I.1 a fixé la frontière :
 *  - `LEGAL_REPRESENTATIVE` / `SIGNATORY` = AUTORITÉ JURIDIQUE → appartient à l'entreprise candidate,
 *    c'est elle qui signe un acte d'engagement ;
 *  - `ADMINISTRATIVE_CONTACT` / `COMMERCIAL_CONTACT` / `TECHNICAL_CONTACT` = CONTACTS CRM → restent
 *    la donnée du `ClientAccount`, et l'interface client continue légitimement de les gérer.
 *
 * Sans ce prédicat, le backfill repointait INDISTINCTEMENT tous les représentants d'un client vers
 * le candidat. Le défaut ne se voyait pas sur le jeu de données courant (les lignes Legacy y sont
 * toutes des `SIGNATORY`), mais il devenait visible dès qu'un client possédait un contact
 * commercial : ce contact aurait changé de propriétaire, puis disparu du CRM une fois la lecture
 * client bornée aux lignes Legacy (§17). La règle est donc corrigée par CONSTRUCTION, pas par
 * chance de la donnée.
 *
 * Les six autres familles sont bidder-sémantiques en totalité : aucun prédicat n'y est nécessaire,
 * et en inventer un serait une restriction non fondée.
 */
const FAMILY_ELIGIBILITY: Partial<Record<SatelliteFamily, Prisma.CompanyRepresentativeWhereInput>> = {
  companyRepresentative: { type: { in: ["LEGAL_REPRESENTATIVE", "SIGNATORY"] } },
};

/** Lignes d'une famille éligibles à l'acquisition d'un propriétaire candidate, pour un client donné. */
function eligibilityWhere(family: SatelliteFamily, organizationId: string, clientAccountId: string): Record<string, unknown> {
  return { organizationId, clientAccountId, candidateCompanyId: null, ...(FAMILY_ELIGIBILITY[family] ?? {}) };
}

export type SatelliteBackfillReport = Readonly<{
  organizationId: string;
  dryRun: boolean;
  candidateCompaniesScanned: number;
  candidateCompaniesWithSource: number;
  /** Lignes ayant ACQUIS `candidate_company_id` pendant CE passage, par famille. */
  migratedByFamily: Readonly<Record<SatelliteFamily, number>>;
  /** Lignes déjà candidate-owned AVANT ce passage (0 au premier run, tout au second). */
  alreadyOwnedByFamily: Readonly<Record<SatelliteFamily, number>>;
  /** Lignes restées Legacy-only après ce passage, par famille. */
  legacyRemainingByFamily: Readonly<Record<SatelliteFamily, number>>;
  /** Réconciliation (mission §12) — invariant du modèle par association : ces deux compteurs sont
   *  TOUJOURS égaux, puisque le backfill n'écrit qu'une colonne de propriété et ne crée/supprime
   *  jamais de ligne. `totalAfterByFamily = alreadyOwned + migrated + legacyRemaining`. */
  totalBeforeByFamily: Readonly<Record<SatelliteFamily, number>>;
  totalAfterByFamily: Readonly<Record<SatelliteFamily, number>>;
  tradeNamesBackfilled: number;
  registerEntriesUpserted: number;
  registerEntriesResolved: number;
  failures: readonly Readonly<{ candidateCompanyId: string; message: string }>[];
}>;

export type SatelliteBackfillOptions = Readonly<{
  organizationId: string;
  dryRun?: boolean | undefined;
}>;

function emptyCounters(): Record<SatelliteFamily, number> {
  return Object.fromEntries(SATELLITE_FAMILIES.map((family) => [family, 0])) as Record<SatelliteFamily, number>;
}

function delegate(client: unknown, family: SatelliteFamily) {
  return (client as Record<SatelliteFamily, { count: (args: unknown) => Promise<number>; updateMany: (args: unknown) => Promise<{ count: number }> }>)[family];
}

async function countByFamily(
  client: unknown,
  organizationId: string,
  where: Prisma.CompanyCertificationWhereInput,
): Promise<Record<SatelliteFamily, number>> {
  const counters = emptyCounters();
  for (const family of SATELLITE_FAMILIES) {
    counters[family] = await delegate(client, family).count({ where: { organizationId, ...where } });
  }
  return counters;
}

export async function backfillSatellitesToCandidate(prisma: PrismaClient, options: SatelliteBackfillOptions): Promise<SatelliteBackfillReport> {
  const { organizationId } = options;
  const dryRun = options.dryRun ?? false;

  const candidateCompanies = (await prisma.candidateCompany.findMany({
    where: { organizationId },
    select: { id: true, sourceClientAccountId: true, tradeName: true, legalName: true },
    orderBy: { createdAt: "asc" },
  })) as { id: string; sourceClientAccountId: string | null; tradeName: string | null; legalName: string | null }[];

  const withSource = candidateCompanies.filter((company) => company.sourceClientAccountId !== null);

  const totalBefore = await countByFamily(prisma, organizationId, {});
  const alreadyOwned = await countByFamily(prisma, organizationId, { candidateCompanyId: { not: null } });

  const migrated = emptyCounters();
  let tradeNamesBackfilled = 0;
  const failures: { candidateCompanyId: string; message: string }[] = [];

  for (const company of withSource) {
    const sourceClientAccountId = company.sourceClientAccountId as string;
    if (dryRun) {
      for (const family of SATELLITE_FAMILIES) {
        migrated[family] += await delegate(prisma, family).count({
          where: eligibilityWhere(family, organizationId, sourceClientAccountId),
        });
      }
      continue;
    }

    try {
      // Une transaction PAR entreprise candidate : les 7 familles d'un même candidat sont migrées
      // ensemble ou pas du tout (mission §15 — jamais de demi-migration incohérente).
      const unit = await prisma.$transaction(async (tx) => {
        const perFamily = emptyCounters();
        for (const family of SATELLITE_FAMILIES) {
          const result = await delegate(tx, family).updateMany({
            where: eligibilityWhere(family, organizationId, sourceClientAccountId),
            data: { candidateCompanyId: company.id },
          });
          perFamily[family] = result.count;
        }

        // `tradeName` (mission §3) — UNIQUEMENT depuis une source Legacy réelle
        // (`CompanyLegalIdentity.tradeName`), jamais dérivé de `legalName` pour remplir le champ.
        let tradeNameWritten = 0;
        if (company.tradeName === null) {
          const legalIdentity = await tx.companyLegalIdentity.findFirst({
            where: { organizationId, clientAccountId: sourceClientAccountId },
            select: { tradeName: true },
          });
          const legacyTradeName = legalIdentity?.tradeName?.trim();
          if (legacyTradeName !== undefined && legacyTradeName !== "") {
            await tx.candidateCompany.update({ where: { id: company.id }, data: { tradeName: legacyTradeName } });
            tradeNameWritten = 1;
          }
        }

        return { perFamily, tradeNameWritten };
      });

      for (const family of SATELLITE_FAMILIES) {
        migrated[family] += unit.perFamily[family];
      }
      tradeNamesBackfilled += unit.tradeNameWritten;
    } catch (error) {
      failures.push({ candidateCompanyId: company.id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const { upserted, resolved } = await upsertMigrationRegister(prisma, organizationId, dryRun);

  const totalAfter = await countByFamily(prisma, organizationId, {});
  const legacyRemaining = await countByFamily(prisma, organizationId, { candidateCompanyId: null });

  return {
    organizationId,
    dryRun,
    candidateCompaniesScanned: candidateCompanies.length,
    candidateCompaniesWithSource: withSource.length,
    migratedByFamily: migrated,
    alreadyOwnedByFamily: alreadyOwned,
    legacyRemainingByFamily: legacyRemaining,
    totalBeforeByFamily: totalBefore,
    totalAfterByFamily: totalAfter,
    tradeNamesBackfilled,
    registerEntriesUpserted: upserted,
    registerEntriesResolved: resolved,
    failures,
  };
}

/**
 * Registre de migration (mission §8) — inscrit tout ClientAccount SANS CandidateCompany
 * correspondante. Aucune donnée métier sensible n'y entre : identifiants, motif, statut, et un
 * simple compteur de lignes satellites restées Legacy.
 *
 * Idempotent par `upsert` sur `(organizationId, clientAccountId)`. Une entrée dont le ClientAccount
 * a depuis acquis une CandidateCompany passe à `RESOLVED` et n'est jamais supprimée : le registre
 * garde l'historique de ce qui n'avait pas pu être migré automatiquement.
 */
async function upsertMigrationRegister(prisma: PrismaClient, organizationId: string, dryRun: boolean): Promise<{ upserted: number; resolved: number }> {
  const client = prisma;

  const clientAccounts = await client.clientAccount.findMany({ where: { organizationId }, select: { id: true } });
  const migratedSources = new Set(
    (await client.candidateCompany.findMany({ where: { organizationId, sourceClientAccountId: { not: null } }, select: { sourceClientAccountId: true } })).map(
      (row) => row.sourceClientAccountId as string,
    ),
  );

  let upserted = 0;
  let resolved = 0;

  for (const clientAccount of clientAccounts) {
    const hasCandidate = migratedSources.has(clientAccount.id);

    if (hasCandidate) {
      if (dryRun) continue;
      const existing = await client.candidateMigrationRegisterEntry.findUnique({
        where: { organizationId_clientAccountId: { organizationId, clientAccountId: clientAccount.id } },
      });
      if (existing && existing.status !== "RESOLVED") {
        await client.candidateMigrationRegisterEntry.update({ where: { id: existing.id }, data: { status: "RESOLVED" } });
        resolved += 1;
      }
      continue;
    }

    let legacySatelliteCount = 0;
    for (const family of SATELLITE_FAMILIES) {
      legacySatelliteCount += await delegate(client, family).count({ where: { organizationId, clientAccountId: clientAccount.id } });
    }

    if (dryRun) {
      upserted += 1;
      continue;
    }

    await client.candidateMigrationRegisterEntry.upsert({
      where: { organizationId_clientAccountId: { organizationId, clientAccountId: clientAccount.id } },
      create: { organizationId, clientAccountId: clientAccount.id, reason: "NO_CANDIDATE_COMPANY", status: "PENDING_PRODUCT_DECISION", legacySatelliteCount },
      update: { reason: "NO_CANDIDATE_COMPANY", status: "PENDING_PRODUCT_DECISION", legacySatelliteCount },
    });
    upserted += 1;
  }

  return { upserted, resolved };
}
