import type { Clock } from "../../../shared-kernel/clock";
import { AddCandidateEstablishmentUseCase } from "../application/use-cases/add-candidate-establishment.use-case";
import { CreateCandidateCompanyUseCase } from "../application/use-cases/create-candidate-company.use-case";
import type { CandidateCompanyRepository } from "../application/ports/candidate-company.repository";
import { classifyClientAccountForCandidateMigration, CandidateMigrationClassification } from "./candidate-migration-classification";

/**
 * TenderOS 2.1-A2 — backfill `ClientAccount` + `company-profile` → `CandidateCompany` +
 * `CandidateEstablishment` (mission "BACKFILL & MIGRATION DES DONNÉES CANDIDATE").
 *
 * ## Stratégie technique (mission §22)
 * Orchestration pure/testable (ce fichier), séparée d'un entrypoint CLI à effet de bord
 * (`backfill-from-client-accounts.cli.ts`) — même discipline que `scripts/compliance-probe.ts` /
 * `compliance-probe.cli.ts`, seul précédent de script autonome trouvé dans ce dépôt. Les dépendances
 * "lecture" (`ClientAccountLister`, `CompanyProfileReader`) sont des interfaces structurelles,
 * volontairement satisfaites par les vraies use cases exportées (`ListClientAccountsUseCase`,
 * `GetCompanyProfileUseCase`) SANS les importer ici : ce module ne dépend donc que de la forme des
 * données, jamais de l'implémentation, ce qui rend cette orchestration testable avec de simples
 * objets en mémoire (mission §45).
 *
 * Chaque `CandidateCompany`/`CandidateEstablishment` est créée via les use cases A1 existants
 * (`CreateCandidateCompanyUseCase`/`AddCandidateEstablishmentUseCase`) — jamais un accès Prisma
 * direct depuis ce script — pour ne JAMAIS dupliquer les règles métier déjà posées en A1 (validation
 * Luhn, normalisation de nom, unicité, écriture d'audit).
 *
 * ## Idempotence (mission §10/§35)
 * Clé d'idempotence : `CandidateCompany.sourceClientAccountId` (`@@unique([organizationId,
 * sourceClientAccountId])`, migration A1). Avant toute création, `findBySourceClientAccountId` est
 * consultée. Un `ClientAccount` déjà migré est classé `ALREADY_MIGRATED` et ne produit jamais de
 * doublon. Une ré-exécution complète du backfill est donc un no-op sur tout ce qui a déjà été
 * migré.
 *
 * ## Atomicité (mission §25)
 * `CreateCandidateCompanyUseCase` et `AddCandidateEstablishmentUseCase` restent deux opérations
 * distinctes (même discipline que le reste du dépôt : aucune transaction Prisma inter-agrégats
 * n'existe ailleurs pour ce genre de séquence création + sous-ressource, voir
 * `CreateClientAccountUseCase` / `AssignUserToClientUseCase`). L'atomicité "métier" est obtenue par
 * IDEMPOTENCE plutôt que par une transaction technique : si le process est interrompu entre les deux
 * appels, une ré-exécution retrouve la `CandidateCompany` déjà créée (`ALREADY_MIGRATED`) et répare
 * l'établissement manquant (`action: "REPAIRED"`) au lieu de recréer la société ou d'échouer.
 *
 * ## Gestion des statuts (décision explicite, mission §12/§21 — aucune perte de donnée silencieuse)
 * `ClientAccount.status` a 3 états (ACTIVE | INACTIVE | ARCHIVED), `CandidateCompany.status` n'en a
 * que 2 (ACTIVE | ARCHIVED, décision A1). Mapping retenu : INACTIVE → ACTIVE (une pause commerciale
 * ne rend pas l'entité juridique invalide) ; ARCHIVED → ARCHIVED (la `CandidateCompany` backfillée
 * est immédiatement archivée pour ne jamais apparaître comme un candidat actif alors que sa source
 * ne l'est plus).
 *
 * ## Rollback avant A3 (mission §36 — documentation obligatoire, jamais un mécanisme destructif
 * automatique)
 * Toutes les lignes créées par ce backfill portent un `sourceClientAccountId` non NULL. Un rollback
 * complet et sûr (n'affecte JAMAIS `ClientAccount`/`company-profile`, aucune donnée legacy touchée) :
 * ```sql
 * DELETE FROM candidate_companies WHERE source_client_account_id IS NOT NULL AND organization_id = $1;
 * -- ON DELETE CASCADE supprime les candidate_establishments correspondants automatiquement.
 * ```
 * À exécuter manuellement, avec le `organization_id` explicite ciblé — jamais une commande globale
 * sans portée, et jamais intégré comme sous-commande automatique de ce script.
 */

export type ClientAccountForMigration = Readonly<{
  id: string;
  organizationId: string;
  name: string;
  legalName?: string | undefined;
  status: string;
  createdBy: string;
}>;

export interface ClientAccountLister {
  execute(query: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    includeArchived: boolean;
    cursor?: string | undefined;
    limit: number;
  }): Promise<{ items: readonly ClientAccountForMigration[]; nextCursor: string | null }>;
}

export type CompanyProfileForMigration = Readonly<{
  legalIdentity: Readonly<{
    status: string;
    legalName: string | null;
    siren: string | null;
    siretPrincipal: string | null;
    vatNumber: string | null;
    legalForm: string | null;
    addressLine: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
  }> | null;
  representatives: readonly unknown[];
  bankAccounts: readonly unknown[];
  insurances: readonly unknown[];
  certifications: readonly unknown[];
  references: readonly unknown[];
  humanResources: readonly unknown[];
  materialResources: readonly unknown[];
}>;

export interface CompanyProfileReader {
  execute(query: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyProfileForMigration>;
}

export type BackfillItemOutcome = Readonly<{
  clientAccountId: string;
  classification: CandidateMigrationClassification;
  action: "CREATED" | "REPAIRED" | "SKIPPED" | "DRY_RUN_PLANNED" | "FAILED";
  candidateCompanyId?: string | undefined;
  establishmentCreated?: boolean | undefined;
  error?: string | undefined;
}>;

export type BackfillSummary = Readonly<{
  organizationId: string;
  dryRun: boolean;
  scanned: number;
  eligible: number;
  migrated: number;
  repaired: number;
  alreadyMigrated: number;
  requiresReview: number;
  notACandidate: number;
  failed: number;
  items: readonly BackfillItemOutcome[];
}>;

export type BackfillDependencies = Readonly<{
  clientAccountLister: ClientAccountLister;
  companyProfileReader: CompanyProfileReader;
  candidateCompanyRepository: CandidateCompanyRepository;
  createCandidateCompanyUseCase: CreateCandidateCompanyUseCase;
  addCandidateEstablishmentUseCase: AddCandidateEstablishmentUseCase;
  clock: Clock;
}>;

export type BackfillOptions = Readonly<{
  organizationId: string;
  dryRun: boolean;
  /** Acteur "système" utilisé pour les appels aux use cases dépendants d'un actorRole/actorId
   *  (mission — jamais un actorId fabriqué : réutilise `ClientAccount.createdBy`, le créateur réel
   *  de la donnée legacy, avec `actorRole: "OWNER"` pour garantir l'accès organization-wide déjà
   *  accordé à ce rôle par `CompanyProfileAccessService`/`assertClientAccess`). */
  actorRole?: string | undefined;
  pageSize?: number | undefined;
}>;

function countSatelliteRecords(profile: CompanyProfileForMigration): number {
  return (
    profile.representatives.length +
    profile.bankAccounts.length +
    profile.insurances.length +
    profile.certifications.length +
    profile.references.length +
    profile.humanResources.length +
    profile.materialResources.length
  );
}

export async function runCandidateCompanyBackfill(deps: BackfillDependencies, options: BackfillOptions): Promise<BackfillSummary> {
  const actorRole = options.actorRole ?? "OWNER";
  const pageSize = options.pageSize ?? 50;

  const items: BackfillItemOutcome[] = [];
  let scanned = 0;
  let eligible = 0;
  let migrated = 0;
  let repaired = 0;
  let alreadyMigrated = 0;
  let requiresReview = 0;
  let notACandidate = 0;
  let failed = 0;

  let cursor: string | undefined;
  for (;;) {
    const page = await deps.clientAccountLister.execute({
      organizationId: options.organizationId,
      actorId: "system-backfill",
      actorRole,
      includeArchived: true,
      cursor,
      limit: pageSize,
    });

    for (const clientAccount of page.items) {
      scanned += 1;

      if (clientAccount.organizationId !== options.organizationId) {
        // Fail-safe strict (mission §13) — ne devrait jamais arriver (le lister est déjà scopé),
        // mais une incohérence d'organizationId ne migre jamais l'enregistrement concerné.
        items.push({ clientAccountId: clientAccount.id, classification: CandidateMigrationClassification.RequiresReview, action: "SKIPPED", error: "organizationId mismatch" });
        requiresReview += 1;
        continue;
      }

      try {
        const alreadyMigratedCompany = await deps.candidateCompanyRepository.findBySourceClientAccountId({
          organizationId: options.organizationId,
          sourceClientAccountId: clientAccount.id,
        });

        const profile = await deps.companyProfileReader.execute({
          organizationId: options.organizationId,
          clientAccountId: clientAccount.id,
          actorId: clientAccount.createdBy,
          actorRole,
        });

        const result = classifyClientAccountForCandidateMigration({
          alreadyMigrated: alreadyMigratedCompany !== null,
          legalIdentity: profile.legalIdentity,
          satelliteRecordCount: countSatelliteRecords(profile),
        });

        if (result.classification === CandidateMigrationClassification.NotACandidate) {
          notACandidate += 1;
          items.push({ clientAccountId: clientAccount.id, classification: result.classification, action: "SKIPPED" });
          continue;
        }

        if (result.classification === CandidateMigrationClassification.RequiresReview) {
          requiresReview += 1;
          items.push({ clientAccountId: clientAccount.id, classification: result.classification, action: "SKIPPED" });
          continue;
        }

        if (result.classification === CandidateMigrationClassification.AlreadyMigrated) {
          alreadyMigrated += 1;
          const company = alreadyMigratedCompany!;
          // Réparation idempotente (mission §25) — si l'établissement principal n'a pas encore été
          // créé (interruption entre les deux appels lors d'une exécution précédente), on le
          // rattrape ici sans jamais recréer la CandidateCompany.
          if (!options.dryRun && result.useSiretPrincipal) {
            const existingEstablishments = await deps.candidateCompanyRepository.listEstablishmentsByCompany({
              organizationId: options.organizationId,
              candidateCompanyId: company.id,
            });
            if (existingEstablishments.length === 0) {
              try {
                await deps.addCandidateEstablishmentUseCase.execute({
                  organizationId: options.organizationId,
                  actorId: clientAccount.createdBy,
                  candidateCompanyId: company.id,
                  siret: result.useSiretPrincipal,
                  isPrincipal: true,
                  addressLine: profile.legalIdentity?.addressLine ?? undefined,
                  postalCode: profile.legalIdentity?.postalCode ?? undefined,
                  city: profile.legalIdentity?.city ?? undefined,
                  country: profile.legalIdentity?.country ?? undefined,
                });
                repaired += 1;
                items.push({ clientAccountId: clientAccount.id, classification: result.classification, action: "REPAIRED", candidateCompanyId: company.id, establishmentCreated: true });
                continue;
              } catch (error) {
                // Le SIRET existe déjà ailleurs (course concurrente / autre organisation ou candidat)
                // — no-op sûr, jamais une erreur bloquante pour ce ClientAccount (mission §26).
                items.push({ clientAccountId: clientAccount.id, classification: result.classification, action: "SKIPPED", candidateCompanyId: company.id, error: (error as Error).message });
                continue;
              }
            }
          }
          items.push({ clientAccountId: clientAccount.id, classification: result.classification, action: "SKIPPED", candidateCompanyId: company.id });
          continue;
        }

        // AUTO_MIGRATABLE ou MIGRATABLE_WITH_RULE — éligible.
        eligible += 1;

        if (options.dryRun) {
          items.push({ clientAccountId: clientAccount.id, classification: result.classification, action: "DRY_RUN_PLANNED" });
          continue;
        }

        const occurredAt = deps.clock.now();
        const created = await deps.createCandidateCompanyUseCase.execute({
          organizationId: options.organizationId,
          actorId: clientAccount.createdBy,
          name: clientAccount.name,
          legalName: profile.legalIdentity?.legalName ?? clientAccount.legalName ?? undefined,
          siren: result.useSiren ?? undefined,
          vatNumber: profile.legalIdentity?.vatNumber ?? undefined,
          legalForm: profile.legalIdentity?.legalForm ?? undefined,
          sourceClientAccountId: clientAccount.id,
        });

        // Mapping de statut explicite (voir commentaire d'en-tête) — INACTIVE -> ACTIVE (no-op,
        // c'est déjà le statut initial), ARCHIVED -> archivage immédiat de la CandidateCompany créée.
        if (clientAccount.status === "ARCHIVED") {
          const company = await deps.candidateCompanyRepository.findById({ organizationId: options.organizationId, candidateCompanyId: created.id });
          if (company) {
            company.archive(occurredAt);
            await deps.candidateCompanyRepository.save(company);
          }
        }

        let establishmentCreated = false;
        if (result.useSiretPrincipal) {
          try {
            await deps.addCandidateEstablishmentUseCase.execute({
              organizationId: options.organizationId,
              actorId: clientAccount.createdBy,
              candidateCompanyId: created.id,
              siret: result.useSiretPrincipal,
              isPrincipal: true,
              addressLine: profile.legalIdentity?.addressLine ?? undefined,
              postalCode: profile.legalIdentity?.postalCode ?? undefined,
              city: profile.legalIdentity?.city ?? undefined,
              country: profile.legalIdentity?.country ?? undefined,
            });
            establishmentCreated = true;
          } catch (error) {
            // La CandidateCompany reste valide sans établissement (mission §26 — fail item, continue) ;
            // signalé dans le résumé plutôt que masqué.
            items.push({
              clientAccountId: clientAccount.id,
              classification: result.classification,
              action: "CREATED",
              candidateCompanyId: created.id,
              establishmentCreated: false,
              error: `establishment creation failed: ${(error as Error).message}`,
            });
            migrated += 1;
            continue;
          }
        }

        migrated += 1;
        items.push({ clientAccountId: clientAccount.id, classification: result.classification, action: "CREATED", candidateCompanyId: created.id, establishmentCreated });
      } catch (error) {
        failed += 1;
        items.push({ clientAccountId: clientAccount.id, classification: CandidateMigrationClassification.RequiresReview, action: "FAILED", error: (error as Error).message });
      }
    }

    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return { organizationId: options.organizationId, dryRun: options.dryRun, scanned, eligible, migrated, repaired, alreadyMigrated, requiresReview, notACandidate, failed, items };
}
