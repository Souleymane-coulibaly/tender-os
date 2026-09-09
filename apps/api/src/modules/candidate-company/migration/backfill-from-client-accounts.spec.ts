import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../shared-kernel/id-generator";
import { AddCandidateEstablishmentUseCase } from "../application/use-cases/add-candidate-establishment.use-case";
import { CreateCandidateCompanyUseCase } from "../application/use-cases/create-candidate-company.use-case";
import { FixedClock, InMemoryAuditLogWriter, InMemoryCandidateCompanyRepository } from "../test-support/fakes";
import {
  type ClientAccountForMigration,
  type ClientAccountLister,
  type CompanyProfileForMigration,
  type CompanyProfileReader,
  runCandidateCompanyBackfill,
} from "./backfill-from-client-accounts";

const VALID_SIREN = "356000000";
const INVALID_SIREN = "356000001";
const VALID_SIRET_A = "35600000000048";
const VALID_SIRET_B = "39395385100010";

const EMPTY_PROFILE: CompanyProfileForMigration = {
  legalIdentity: null,
  representatives: [],
  bankAccounts: [],
  insurances: [],
  certifications: [],
  references: [],
  humanResources: [],
  materialResources: [],
};

/** Fake minimal — reproduit la pagination par curseur d'une vraie use case sans DI. */
class FakeClientAccountLister implements ClientAccountLister {
  constructor(private readonly accounts: ClientAccountForMigration[]) {}
  async execute(query: { organizationId: string; cursor?: string | undefined; limit: number }) {
    const scoped = this.accounts.filter((a) => a.organizationId === query.organizationId);
    const startIndex = query.cursor ? scoped.findIndex((a) => a.id === query.cursor) + 1 : 0;
    const page = scoped.slice(startIndex, startIndex + query.limit);
    const nextCursor = startIndex + query.limit < scoped.length ? (page[page.length - 1]?.id ?? null) : null;
    return { items: page, nextCursor };
  }
}

class FakeCompanyProfileReader implements CompanyProfileReader {
  constructor(private readonly profiles: Map<string, CompanyProfileForMigration>) {}
  async execute(query: { clientAccountId: string }) {
    return this.profiles.get(query.clientAccountId) ?? EMPTY_PROFILE;
  }
}

describe("runCandidateCompanyBackfill", () => {
  const ORG_A = randomUUID();
  const ORG_B = randomUUID();
  const ACTOR = randomUUID();

  let repository: InMemoryCandidateCompanyRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let createCandidateCompanyUseCase: CreateCandidateCompanyUseCase;
  let addCandidateEstablishmentUseCase: AddCandidateEstablishmentUseCase;
  let clock: FixedClock;

  beforeEach(() => {
    repository = new InMemoryCandidateCompanyRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    clock = new FixedClock();
    createCandidateCompanyUseCase = new CreateCandidateCompanyUseCase(repository, auditLogWriter, clock, new UuidGenerator());
    addCandidateEstablishmentUseCase = new AddCandidateEstablishmentUseCase(repository, auditLogWriter, clock, new UuidGenerator());
  });

  function deps(lister: ClientAccountLister, reader: CompanyProfileReader) {
    return { clientAccountLister: lister, companyProfileReader: reader, candidateCompanyRepository: repository, createCandidateCompanyUseCase, addCandidateEstablishmentUseCase, clock };
  }

  it("Scénario A — un ClientAccount purement commercial (aucun company-profile) ne produit AUCUNE CandidateCompany", async () => {
    const clientAccount: ClientAccountForMigration = { id: randomUUID(), organizationId: ORG_A, name: "Acheteur Public Paris", status: "ACTIVE", createdBy: ACTOR };
    const lister = new FakeClientAccountLister([clientAccount]);
    const reader = new FakeCompanyProfileReader(new Map());

    const summary = await runCandidateCompanyBackfill(deps(lister, reader), { organizationId: ORG_A, dryRun: false });

    expect(summary.notACandidate).toBe(1);
    expect(summary.migrated).toBe(0);
    const list = await repository.list({ organizationId: ORG_A, includeArchived: true, limit: 100 });
    expect(list.items).toHaveLength(0);
  });

  it("Scénario B — CompanyLegalIdentity ACTIVE avec SIREN+SIRET valides produit une CandidateCompany + un CandidateEstablishment, et préserve le legacy tel quel", async () => {
    const clientAccountId = randomUUID();
    const clientAccount: ClientAccountForMigration = { id: clientAccountId, organizationId: ORG_A, name: "Menuiserie Corentin SARL", legalName: "Menuiserie Corentin", status: "ACTIVE", createdBy: ACTOR };
    const profile: CompanyProfileForMigration = {
      legalIdentity: {
        status: "ACTIVE",
        legalName: "Menuiserie Corentin SARL",
        siren: VALID_SIREN,
        siretPrincipal: VALID_SIRET_A,
        vatNumber: "FR40356000000",
        legalForm: "SARL",
        addressLine: "12 rue des Artisans",
        postalCode: "75011",
        city: "Paris",
        country: "FR",
      },
      representatives: [],
      bankAccounts: [],
      insurances: [{}],
      certifications: [{}, {}],
      references: [],
      humanResources: [],
      materialResources: [],
    };
    const lister = new FakeClientAccountLister([clientAccount]);
    const reader = new FakeCompanyProfileReader(new Map([[clientAccountId, profile]]));

    const summary = await runCandidateCompanyBackfill(deps(lister, reader), { organizationId: ORG_A, dryRun: false });

    expect(summary.migrated).toBe(1);
    const created = await repository.findBySourceClientAccountId({ organizationId: ORG_A, sourceClientAccountId: clientAccountId });
    expect(created?.name).toBe("Menuiserie Corentin SARL");
    expect(created?.siren).toBe(VALID_SIREN);
    expect(created?.status).toBe("ACTIVE");

    const establishments = await repository.listEstablishmentsByCompany({ organizationId: ORG_A, candidateCompanyId: created!.id });
    expect(establishments).toHaveLength(1);
    expect(establishments[0]?.siret).toBe(VALID_SIRET_A);
    expect(establishments[0]?.isPrincipal).toBe(true);

    // Legacy préservé (mission §16/§21) — le fixture ClientAccount/legalIdentity n'est jamais muté
    // par le backfill (aucune écriture n'existe dans ce module vers ces tables).
    expect(clientAccount.name).toBe("Menuiserie Corentin SARL");
    expect(profile.legalIdentity?.siren).toBe(VALID_SIREN);
  });

  it("Scénario C — une deuxième exécution du backfill sur la même donnée ne duplique rien (idempotence)", async () => {
    const clientAccountId = randomUUID();
    const clientAccount: ClientAccountForMigration = { id: clientAccountId, organizationId: ORG_A, name: "Toiture Bernard SARL", status: "ACTIVE", createdBy: ACTOR };
    const profile: CompanyProfileForMigration = { ...EMPTY_PROFILE, legalIdentity: { status: "ACTIVE", legalName: null, siren: VALID_SIREN, siretPrincipal: VALID_SIRET_A, vatNumber: null, legalForm: null, addressLine: null, postalCode: null, city: null, country: null } };
    const lister = new FakeClientAccountLister([clientAccount]);
    const reader = new FakeCompanyProfileReader(new Map([[clientAccountId, profile]]));

    const runOne = await runCandidateCompanyBackfill(deps(lister, reader), { organizationId: ORG_A, dryRun: false });
    expect(runOne.migrated).toBe(1);

    const runTwo = await runCandidateCompanyBackfill(deps(lister, reader), { organizationId: ORG_A, dryRun: false });
    expect(runTwo.migrated).toBe(0);
    expect(runTwo.alreadyMigrated).toBe(1);

    const list = await repository.list({ organizationId: ORG_A, includeArchived: true, limit: 100 });
    expect(list.items).toHaveLength(1);
    const establishments = await repository.listEstablishmentsByCompany({ organizationId: ORG_A, candidateCompanyId: list.items[0]!.id });
    expect(establishments).toHaveLength(1);
  });

  it("Scénario C (repair) — si une exécution précédente s'est arrêtée entre la création de la société et celle de l'établissement, la ré-exécution répare sans dupliquer la société", async () => {
    const clientAccountId = randomUUID();
    const clientAccount: ClientAccountForMigration = { id: clientAccountId, organizationId: ORG_A, name: "Isolation SAS", status: "ACTIVE", createdBy: ACTOR };

    // Simule une CandidateCompany déjà créée par une exécution précédente interrompue AVANT l'ajout
    // de l'établissement.
    await createCandidateCompanyUseCase.execute({ organizationId: ORG_A, actorId: ACTOR, actorRole: "OWNER", name: clientAccount.name, siren: VALID_SIREN, sourceClientAccountId: clientAccountId });

    const profile: CompanyProfileForMigration = { ...EMPTY_PROFILE, legalIdentity: { status: "ACTIVE", legalName: null, siren: VALID_SIREN, siretPrincipal: VALID_SIRET_A, vatNumber: null, legalForm: null, addressLine: null, postalCode: null, city: null, country: null } };
    const lister = new FakeClientAccountLister([clientAccount]);
    const reader = new FakeCompanyProfileReader(new Map([[clientAccountId, profile]]));

    const summary = await runCandidateCompanyBackfill(deps(lister, reader), { organizationId: ORG_A, dryRun: false });

    expect(summary.migrated).toBe(0);
    expect(summary.repaired).toBe(1);
    const list = await repository.list({ organizationId: ORG_A, includeArchived: true, limit: 100 });
    expect(list.items).toHaveLength(1); // toujours une seule société
    const establishments = await repository.listEstablishmentsByCompany({ organizationId: ORG_A, candidateCompanyId: list.items[0]!.id });
    expect(establishments).toHaveLength(1);
  });

  it("Scénario D — isolation multi-tenant stricte : Org A / Org B ne se croisent jamais", async () => {
    const clientA = randomUUID();
    const clientB = randomUUID();
    const accountA: ClientAccountForMigration = { id: clientA, organizationId: ORG_A, name: "Candidat Alpha", status: "ACTIVE", createdBy: ACTOR };
    const accountB: ClientAccountForMigration = { id: clientB, organizationId: ORG_B, name: "Candidat Beta", status: "ACTIVE", createdBy: ACTOR };
    const profileA: CompanyProfileForMigration = { ...EMPTY_PROFILE, legalIdentity: { status: "ACTIVE", legalName: null, siren: VALID_SIREN, siretPrincipal: VALID_SIRET_A, vatNumber: null, legalForm: null, addressLine: null, postalCode: null, city: null, country: null } };
    const profileB: CompanyProfileForMigration = { ...EMPTY_PROFILE, legalIdentity: { status: "ACTIVE", legalName: null, siren: VALID_SIREN, siretPrincipal: VALID_SIRET_B, vatNumber: null, legalForm: null, addressLine: null, postalCode: null, city: null, country: null } };
    const lister = new FakeClientAccountLister([accountA, accountB]);
    const reader = new FakeCompanyProfileReader(
      new Map([
        [clientA, profileA],
        [clientB, profileB],
      ]),
    );

    await runCandidateCompanyBackfill(deps(lister, reader), { organizationId: ORG_A, dryRun: false });
    await runCandidateCompanyBackfill(deps(lister, reader), { organizationId: ORG_B, dryRun: false });

    const listA = await repository.list({ organizationId: ORG_A, includeArchived: true, limit: 100 });
    const listB = await repository.list({ organizationId: ORG_B, includeArchived: true, limit: 100 });
    expect(listA.items.map((c) => c.name)).toEqual(["Candidat Alpha"]);
    expect(listB.items.map((c) => c.name)).toEqual(["Candidat Beta"]);
  });

  it("Scénario E — CompanyLegalIdentity ACTIVE mais sans SIREN ni SIRET vérifiables => REQUIRES_REVIEW, aucune création automatique", async () => {
    const clientAccountId = randomUUID();
    const clientAccount: ClientAccountForMigration = { id: clientAccountId, organizationId: ORG_A, name: "Ambigu SAS", status: "ACTIVE", createdBy: ACTOR };
    const profile: CompanyProfileForMigration = { ...EMPTY_PROFILE, legalIdentity: { status: "ACTIVE", legalName: "Ambigu SAS", siren: null, siretPrincipal: null, vatNumber: null, legalForm: null, addressLine: null, postalCode: null, city: null, country: null } };
    const lister = new FakeClientAccountLister([clientAccount]);
    const reader = new FakeCompanyProfileReader(new Map([[clientAccountId, profile]]));

    const summary = await runCandidateCompanyBackfill(deps(lister, reader), { organizationId: ORG_A, dryRun: false });

    expect(summary.requiresReview).toBe(1);
    expect(summary.migrated).toBe(0);
    const list = await repository.list({ organizationId: ORG_A, includeArchived: true, limit: 100 });
    expect(list.items).toHaveLength(0);
  });

  it("Scénario F (adapté) — chaque ClientAccount legacy ne porte qu'un seul siretPrincipal ; deux candidats distincts produisent chacun exactement 1 CandidateEstablishment, jamais 2 sur le même candidat", async () => {
    // Note : le modèle legacy `CompanyLegalIdentity` n'expose qu'un unique champ `siretPrincipal`
    // (aucune liste de SIRET secondaires n'existe dans company-profile — vérifié sur le schéma réel,
    // mission §7 "ne pas inventer de signaux"). Un unique enregistrement legacy ne peut donc jamais
    // produire plus d'un `CandidateEstablishment` pendant A2 ; ce test démontre le comportement réel
    // avec deux sources distinctes plutôt qu'un scénario "2 établissements" fabriqué de toutes pièces.
    const clientA = randomUUID();
    const clientB = randomUUID();
    const accountA: ClientAccountForMigration = { id: clientA, organizationId: ORG_A, name: "Candidat Un", status: "ACTIVE", createdBy: ACTOR };
    const accountB: ClientAccountForMigration = { id: clientB, organizationId: ORG_A, name: "Candidat Deux", status: "ACTIVE", createdBy: ACTOR };
    const profileA: CompanyProfileForMigration = { ...EMPTY_PROFILE, legalIdentity: { status: "ACTIVE", legalName: null, siren: VALID_SIREN, siretPrincipal: VALID_SIRET_A, vatNumber: null, legalForm: null, addressLine: null, postalCode: null, city: null, country: null } };
    const profileB: CompanyProfileForMigration = { ...EMPTY_PROFILE, legalIdentity: { status: "ACTIVE", legalName: null, siren: INVALID_SIREN, siretPrincipal: VALID_SIRET_B, vatNumber: null, legalForm: null, addressLine: null, postalCode: null, city: null, country: null } };
    const lister = new FakeClientAccountLister([accountA, accountB]);
    const reader = new FakeCompanyProfileReader(
      new Map([
        [clientA, profileA],
        [clientB, profileB],
      ]),
    );

    const summary = await runCandidateCompanyBackfill(deps(lister, reader), { organizationId: ORG_A, dryRun: false });

    expect(summary.migrated).toBe(2);
    const list = await repository.list({ organizationId: ORG_A, includeArchived: true, limit: 100 });
    expect(list.items).toHaveLength(2);
    for (const company of list.items) {
      const establishments = await repository.listEstablishmentsByCompany({ organizationId: ORG_A, candidateCompanyId: company.id });
      expect(establishments).toHaveLength(1);
    }
  });

  it("dry-run: ne crée AUCUNE CandidateCompany, mais rapporte correctement les compteurs", async () => {
    const clientAccountId = randomUUID();
    const clientAccount: ClientAccountForMigration = { id: clientAccountId, organizationId: ORG_A, name: "Couverture Marchand SAS", status: "ACTIVE", createdBy: ACTOR };
    const profile: CompanyProfileForMigration = { ...EMPTY_PROFILE, legalIdentity: { status: "ACTIVE", legalName: null, siren: VALID_SIREN, siretPrincipal: VALID_SIRET_A, vatNumber: null, legalForm: null, addressLine: null, postalCode: null, city: null, country: null } };
    const lister = new FakeClientAccountLister([clientAccount]);
    const reader = new FakeCompanyProfileReader(new Map([[clientAccountId, profile]]));

    const summary = await runCandidateCompanyBackfill(deps(lister, reader), { organizationId: ORG_A, dryRun: true });

    expect(summary.dryRun).toBe(true);
    expect(summary.eligible).toBe(1);
    expect(summary.migrated).toBe(0);
    expect(summary.items[0]?.action).toBe("DRY_RUN_PLANNED");
    const list = await repository.list({ organizationId: ORG_A, includeArchived: true, limit: 100 });
    expect(list.items).toHaveLength(0);
  });

  it("un ClientAccount ARCHIVED est migré en CandidateCompany ARCHIVED (jamais silencieusement ACTIVE)", async () => {
    const clientAccountId = randomUUID();
    const clientAccount: ClientAccountForMigration = { id: clientAccountId, organizationId: ORG_A, name: "Ancien Candidat SARL", status: "ARCHIVED", createdBy: ACTOR };
    const profile: CompanyProfileForMigration = { ...EMPTY_PROFILE, legalIdentity: { status: "ACTIVE", legalName: null, siren: VALID_SIREN, siretPrincipal: null, vatNumber: null, legalForm: null, addressLine: null, postalCode: null, city: null, country: null } };
    const lister = new FakeClientAccountLister([clientAccount]);
    const reader = new FakeCompanyProfileReader(new Map([[clientAccountId, profile]]));

    await runCandidateCompanyBackfill(deps(lister, reader), { organizationId: ORG_A, dryRun: false });

    const created = await repository.findBySourceClientAccountId({ organizationId: ORG_A, sourceClientAccountId: clientAccountId });
    expect(created?.status).toBe("ARCHIVED");
  });
});
