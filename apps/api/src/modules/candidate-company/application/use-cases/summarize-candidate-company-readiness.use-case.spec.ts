import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { UuidGenerator } from "../../../../shared-kernel/id-generator";
import { FixedClock, InMemoryAuditLogWriter, InMemoryCandidateCompanyRepository } from "../../test-support/fakes";
import { AddCandidateEstablishmentUseCase } from "./add-candidate-establishment.use-case";
import { CreateCandidateCompanyUseCase } from "./create-candidate-company.use-case";
import { SummarizeCandidateCompanyReadinessUseCase } from "./summarize-candidate-company-readiness.use-case";
import { UpdateCandidateCompanyIdentityUseCase } from "./update-candidate-company-identity.use-case";

const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const ACTOR = randomUUID();
const SIRET_A = "35600000000048";
// SIRET dont les 9 premiers chiffres forment un SIREN lui-même valide : les deux contrôles Luhn
// sont indépendants (9 et 14 chiffres), un SIRET valide ne garantit donc pas un SIREN valide.
const SIRET_B = "55210055400005";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.1 — ferme `P2-DASHBOARD-SEMANTIC-SOT`.
 *
 * Le tableau de bord affichait « Compléter l'entreprise candidate » en interrogeant en réalité la
 * complétude du profil des `ClientAccount`. Un client commercial n'est pas le candidat : la coche
 * pouvait donc être verte sans qu'aucune entreprise candidate n'existe, et inversement.
 *
 * L'enjeu de ces tests n'est pas seulement « le compte est juste » : c'est que le prédicat rendu
 * soit INDÉPENDANT DE L'ORDRE DE LECTURE. Une organisation peut porter plusieurs entreprises
 * candidates ; désigner « la » candidate (la première, la plus récente) ferait dépendre l'état
 * affiché d'un tri, et confondrait la candidate A avec la B.
 */
describe("SummarizeCandidateCompanyReadinessUseCase", () => {
  let repository: InMemoryCandidateCompanyRepository;
  let useCase: SummarizeCandidateCompanyReadinessUseCase;
  let createCompany: CreateCandidateCompanyUseCase;
  let addEstablishment: AddCandidateEstablishmentUseCase;
  let updateIdentity: UpdateCandidateCompanyIdentityUseCase;

  beforeEach(() => {
    repository = new InMemoryCandidateCompanyRepository();
    const auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new SummarizeCandidateCompanyReadinessUseCase(repository);
    createCompany = new CreateCandidateCompanyUseCase(repository, auditLogWriter, new FixedClock(), new UuidGenerator());
    addEstablishment = new AddCandidateEstablishmentUseCase(repository, auditLogWriter, new FixedClock(), new UuidGenerator());
    updateIdentity = new UpdateCandidateCompanyIdentityUseCase(repository, auditLogWriter, new FixedClock());
  });

  async function completeCandidate(name: string, siret: string, organizationId = ORG): Promise<string> {
    const company = await createCompany.execute({ organizationId, actorId: ACTOR, actorRole: "OWNER", name });
    await updateIdentity.execute({
      organizationId,
      actorId: ACTOR,
      actorRole: "OWNER",
      candidateCompanyId: company.id,
      patch: { legalName: `${name} SAS`, siren: siret.slice(0, 9) },
    });
    await addEstablishment.execute({
      organizationId,
      actorId: ACTOR,
      actorRole: "OWNER",
      candidateCompanyId: company.id,
      siret,
      isPrincipal: true,
      addressLine: "12 rue de la République",
      postalCode: "75001",
      city: "Paris",
    });
    return company.id;
  }

  it("sans aucune entreprise candidate, le prédicat est faux — jamais indéfini", async () => {
    expect(await useCase.execute({ organizationId: ORG })).toEqual({ totalActive: 0, completeIdentityCount: 0, hasAtLeastOneComplete: false });
  });

  it("une candidate existante mais incomplète compte dans le total, jamais dans les complètes", async () => {
    // Le cas exact que l'ancien calcul ratait dans les deux sens : exister n'est pas être exploitable.
    await createCompany.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Ébauche" });

    const summary = await useCase.execute({ organizationId: ORG });
    expect(summary.totalActive).toBe(1);
    expect(summary.completeIdentityCount).toBe(0);
    expect(summary.hasAtLeastOneComplete).toBe(false);
  });

  it("une identité renseignée SANS établissement principal reste incomplète", async () => {
    // Traduction fidèle du critère Legacy `computeIdentityStatus` : SIRET, adresse, code postal et
    // ville sont portés par l'établissement, pas par l'entreprise. Les omettre du critère aurait
    // rendu la coche verte plus facilement qu'avant — un assouplissement jamais demandé.
    const company = await createCompany.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Sans établissement" });
    await updateIdentity.execute({
      organizationId: ORG,
      actorId: ACTOR,
      actorRole: "OWNER",
      candidateCompanyId: company.id,
      patch: { legalName: "SANS ÉTABLISSEMENT SAS", siren: "356000000" },
    });

    expect(await useCase.execute({ organizationId: ORG })).toMatchObject({ totalActive: 1, completeIdentityCount: 0, hasAtLeastOneComplete: false });
  });

  it("une candidate complète suffit à rendre le prédicat vrai", async () => {
    await completeCandidate("Acme", SIRET_A);

    expect(await useCase.execute({ organizationId: ORG })).toEqual({ totalActive: 1, completeIdentityCount: 1, hasAtLeastOneComplete: true });
  });

  it("MULTI-CANDIDAT — le résultat ne dépend pas de l'ordre : une seule complète parmi plusieurs suffit", async () => {
    // Deux incomplètes créées AVANT la complète : si le calcul désignait « la » candidate par un
    // rang de lecture, il tomberait ici sur une incomplète et rendrait faux.
    await createCompany.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Incomplète 1" });
    await createCompany.execute({ organizationId: ORG, actorId: ACTOR, actorRole: "OWNER", name: "Incomplète 2" });
    await completeCandidate("Complète", SIRET_A);

    const summary = await useCase.execute({ organizationId: ORG });
    expect(summary.totalActive).toBe(3);
    expect(summary.completeIdentityCount).toBe(1);
    expect(summary.hasAtLeastOneComplete).toBe(true);
  });

  it("MULTI-CANDIDAT — deux candidates complètes sont comptées toutes les deux, sans qu'aucune ne soit élue", async () => {
    await completeCandidate("Première", SIRET_A);
    await completeCandidate("Seconde", SIRET_B);

    const summary = await useCase.execute({ organizationId: ORG });
    expect(summary.completeIdentityCount, "un COMPTE, jamais une désignation").toBe(2);
    expect(summary.hasAtLeastOneComplete).toBe(true);
  });

  it("le résumé est borné à l'organisation appelante — une candidate complète d'une autre org ne la rend jamais prête", async () => {
    await completeCandidate("Voisine", SIRET_A, OTHER_ORG);

    expect(await useCase.execute({ organizationId: ORG })).toEqual({ totalActive: 0, completeIdentityCount: 0, hasAtLeastOneComplete: false });
    expect(await useCase.execute({ organizationId: OTHER_ORG })).toMatchObject({ hasAtLeastOneComplete: true });
  });
});
