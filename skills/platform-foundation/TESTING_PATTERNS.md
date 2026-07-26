# TenderOS — Testing Patterns

Version : 1.0
Statut : Draft
Rôle concerné : Platform Foundation
Document parent : `skills/platform-foundation/SKILL.md`
Documents associés :

- `docs/04-architecture/ENGINEERING_STANDARDS.md` §29, §65-80 (règles d'autorité — ce document en est la traduction en patterns d'implémentation)
- `skills/platform-foundation/ARCHITECTURE_RULES.md`
- `skills/platform-foundation/MODULE_TEMPLATE.md` §53-59
- `skills/platform-foundation/DATABASE_PATTERNS.md` §118-125
- `skills/platform-foundation/API_PATTERNS.md` §38
- `skills/platform-foundation/AI_PATTERNS.md` §38-39
- `skills/platform-foundation/FRONTEND_PATTERNS.md` §37

---

## 1. Objectif

Ce document définit la stratégie et les patterns d'implémentation obligatoires pour les tests de TenderOS, toutes couches confondues.

Il traduit en patterns concrets (structure, outils, exemples) les règles déjà fixées par `ENGINEERING_STANDARDS.md` §29 et §65-80, qui reste le document d'autorité sur les décisions de fond (types de tests attendus, priorités de couverture, déterminisme, structure Given/When/Then). Ce document ne redéfinit aucune règle : il consolide les patterns de test déjà esquissés dans les documents précédents (`MODULE_TEMPLATE.md`, `DATABASE_PATTERNS.md`, `API_PATTERNS.md`, `AI_PATTERNS.md`, `FRONTEND_PATTERNS.md`) en une référence unique et outillée.

Il précise notamment : les outils de test de référence ; la pyramide de tests ; les priorités de couverture ; les patterns par couche (Domain, use case, repository, API, IA, frontend) ; le multi-tenant et les permissions ; le déterminisme ; les fixtures et fakes ; les tests d'architecture ; la gestion des échecs de test ; les anti-patterns interdits.

---

## 2. Documents d'autorité

Ordre de priorité pour toute question relative aux tests :

```text
1. PRODUCT_CONSTITUTION.md
2. bible/03-domain/business-rules.md
3. bible/03-domain/permissions.md
4. docs/04-architecture/ENGINEERING_STANDARDS.md
5. docs/04-architecture/API_GUIDELINES.md
6. docs/04-architecture/DATABASE_DESIGN.md
7. docs/05-ai/AI_ARCHITECTURE.md
8. skills/platform-foundation/ARCHITECTURE_RULES.md
9. skills/platform-foundation/MODULE_TEMPLATE.md
10. skills/platform-foundation/DATABASE_PATTERNS.md
11. skills/platform-foundation/API_PATTERNS.md
12. skills/platform-foundation/AI_PATTERNS.md
13. skills/platform-foundation/FRONTEND_PATTERNS.md
14. skills/platform-foundation/TESTING_PATTERNS.md   ← ce document
```

---

## 3. Outils de référence

Aucun document existant du projet n'imposait de runner de test unitaire/intégration avant ce document — seul Playwright était déjà présent et configuré (`playwright.config.ts`, `tests/example.spec.ts`, `package.json`). Décision retenue pour ce document :

```text
Unit & Integration tests  → Vitest
Component tests (frontend) → Vitest + React Testing Library (recommandé)
Contract tests (API)       → Vitest + client HTTP typé (packages/contracts)
End-to-End tests            → Playwright (déjà en place)
```

Le choix de React Testing Library pour les tests de composant est une recommandation de niveau 2 (`SKILL.md` §36) — cohérente avec Vitest, non encore validée formellement ; elle doit être confirmée ou remplacée avant la première implémentation de composants.

---

## 4. Principes directeurs

```text
Tests protect behavior, not implementation
Business rules before UI polish
Deterministic before convenient
Tenant isolation always tested
Permission denial always tested
Fast feedback before exhaustive coverage
A red test blocks the merge, never gets deleted to pass
Coverage number is a signal, not a goal
```

---

## 5. Pyramide de tests

```text
                 ▲
                 │  E2E (Playwright)
                 │  peu nombreux, workflows critiques
                 ├──────────────────────────
                 │  Contract (API)
                 │  un par endpoint significatif
                 ├──────────────────────────
                 │  Integration
                 │  repositories, adapters, transactions
                 ├──────────────────────────
                 │  Unit
                 │  Domain, use cases, policies — nombreux, rapides
                 ▼
```

La majorité des tests doivent être unitaires et rapides. Un workflow métier critique justifie un test E2E ; il ne justifie pas de dupliquer ce même scénario à toutes les couches.

---

## 6. Priorités de couverture

Ordre de priorité, cohérent avec `ARCHITECTURE_RULES.md` §41, `MODULE_TEMPLATE.md` §53 et `AI_PATTERNS.md` §38 :

```text
1. Business Rules
2. Permissions
3. Multi-tenancy
4. Transactions et concurrence
5. Data integrity (contraintes, migrations)
6. API contracts
7. Idempotence
8. Traitements asynchrones
9. Validation des sorties IA
10. Scénarios d'erreur
11. Comportement UI
```

La couverture de code n'est pas un objectif isolé (`ENGINEERING_STANDARDS.md` §71) : une couverture élevée avec des assertions faibles n'est pas suffisante.

---

## 7. Convention de nommage et structure

```text
<subject>.spec.ts
```

Cohérent avec la convention déjà en place (`tests/example.spec.ts`). Un fichier de test est colocalisé avec le code qu'il teste pour les tests unitaires, et regroupé dans un dossier `tests/` dédié pour les autres types :

```text
modules/tenders/
├── domain/
│   └── tender.aggregate.ts
│   └── tender.aggregate.spec.ts        ← colocalisé
├── application/
│   └── use-cases/
│       └── shortlist-tender.use-case.ts
│       └── shortlist-tender.use-case.spec.ts
└── tests/
    ├── integration/
    │   └── prisma-tender.repository.spec.ts
    ├── contract/
    │   └── shortlist-tender.contract.spec.ts
    ├── architecture/
    │   └── module-boundaries.spec.ts
    ├── factories/
    │   └── tender.factory.ts
    └── fixtures/
        └── tender.fixtures.ts
```

Cohérent avec l'arborescence de référence de `MODULE_TEMPLATE.md` §6.

---

## 8. Structure Given/When/Then

Convention recommandée pour tout test métier (`ENGINEERING_STANDARDS.md` §72) :

```typescript
import { describe, it, expect } from "vitest";

describe("Proposal.approve", () => {
  it("refuses approval when blocking comments remain", async () => {
    // Given
    const proposal = ProposalFactory.withBlockingComment();

    // When
    const action = () => proposal.approve(approvalInput);

    // Then
    expect(action).toThrow(ProposalHasBlockingCommentsError);
  });
});
```

Le nom du test décrit un comportement observable (« refuses... », « shortlists... », « rejects... »), jamais un détail d'implémentation (« calls repository.save »).

---

## 9. Tests du Domain

Périmètre prioritaire (`ENGINEERING_STANDARDS.md` §66) : invariants métier ; transitions d'état ; policies ; Value Objects ; calculs ; scénarios limites ; erreurs métier.

```typescript
describe("Tender.shortlist", () => {
  it("shortlists a discovered tender and records an event", () => {
    const tender = TenderFactory.newTender({
      status: TenderStatus.Discovered,
    });

    tender.shortlist({ actorId: ActorId.from(ACTOR_ID), occurredAt: FIXED_NOW });

    expect(tender.status).toBe(TenderStatus.Shortlisted);
    expect(tender.pullDomainEvents()).toEqual([
      expect.objectContaining({ eventType: "TenderShortlisted" }),
    ]);
  });

  it("rejects shortlisting an archived tender", () => {
    const tender = TenderFactory.archivedTender();

    expect(() =>
      tender.shortlist({ actorId: ActorId.from(ACTOR_ID), occurredAt: FIXED_NOW }),
    ).toThrow(TenderInvalidStateError);
  });
});
```

Ces tests sont rapides, déterministes, indépendants de PostgreSQL et du réseau (`ENGINEERING_STANDARDS.md` §66) — voir `MODULE_TEMPLATE.md` §53 pour le pattern complet.

---

## 10. Tests de use case

Un test de use case combine des fakes (§21) pour vérifier l'orchestration complète sans dépendance réelle.

```typescript
describe("ShortlistTenderUseCase", () => {
  it("shortlists a tenant-owned tender", async () => {
    const repository = new InMemoryTenderRepository();
    await repository.seed(TenderFactory.newTender({ organizationId: ORGANIZATION_A_ID }));

    const useCase = createUseCase({ repository, authorization: allow() });

    const result = await useCase.execute(validCommand());

    expect(result.status).toBe("SHORTLISTED");
  });

  it("refuses an unauthorized actor", async () => {
    const useCase = createUseCase({ authorization: deny("PERMISSION_MISSING") });

    await expect(useCase.execute(validCommand())).rejects.toThrow(PermissionDeniedError);
  });
});
```

Voir `MODULE_TEMPLATE.md` §54 pour la matrice complète de cas (succès, permission refusée, autre tenant, transaction, événement attendu).

---

## 11. Tests de repository et d'intégration

Couvrent : repositories Prisma ; transactions ; contraintes PostgreSQL ; Object Storage ; queues ; adapters ; migrations ; sérialisation d'événements (`ENGINEERING_STANDARDS.md` §67). Utilisent des dépendances réelles ou fidèles lorsque cela apporte de la valeur — typiquement une base PostgreSQL de test isolée, pas un mock du client Prisma.

```typescript
describe("PrismaTenderRepository", () => {
  it("does not return a tender from another organization", async () => {
    await seedTender({ organizationId: ORGANIZATION_B_ID, tenderId: TENDER_ID });

    const result = await repository.findById({
      organizationId: ORGANIZATION_A_ID,
      tenderId: TENDER_ID,
    });

    expect(result).toBeNull();
  });
});
```

Voir `MODULE_TEMPLATE.md` §55 et `DATABASE_PATTERNS.md` §118-120 pour le détail (mapping, concurrence, pagination, tri stable).

---

## 12. Tests multi-tenant

Chaque module manipulant des ressources tenant-scoped doit inclure au minimum un test vérifiant (`ENGINEERING_STANDARDS.md` §29) :

```text
Organization A
ne peut ni lire, ni modifier, ni déduire
une ressource de Organization B
```

Ce test est obligatoire pour : lecture directe par identifiant ; listes et recherche ; mise à jour ; suppression ; téléchargement de fichier ; worker traitant une ressource ; consommation d'un événement ; export ; RAG (`DATABASE_PATTERNS.md` §120, `AI_ARCHITECTURE.md` §91).

```typescript
it("prevents cross-tenant access via direct identifier", async () => {
  await seedTender({ organizationId: ORGANIZATION_B_ID, tenderId: TENDER_ID });

  await expect(
    getTenderDetailsUseCase.execute({
      organizationId: ORGANIZATION_A_ID,
      tenderId: TENDER_ID,
    }),
  ).rejects.toThrow(TenderNotFoundError);
});
```

Une fuite inter-tenant détectée en test ou en revue est un **blocker**, jamais un défaut mineur (`ARCHITECTURE_RULES.md` §44).

---

## 13. Tests de permissions

Toute permission importante doit être testée avec (`ENGINEERING_STANDARDS.md` §69) : utilisateur autorisé ; utilisateur non autorisé ; utilisateur d'un autre tenant ; utilisateur suspendu ; membre sans accès au Workspace ; ressource inexistante.

```typescript
describe.each([
  { actor: authorizedActor(), expected: "success" },
  { actor: actorWithoutPermission(), expected: "PERMISSION_MISSING" },
  { actor: actorFromAnotherOrganization(), expected: "TENDER_NOT_FOUND" },
  { actor: suspendedActor(), expected: "AUTHENTICATION_REQUIRED" },
  { actor: actorWithoutWorkspaceAccess(), expected: "WORKSPACE_ACCESS_DENIED" },
])("shortlistTender authorization — $expected", ({ actor, expected }) => {
  it(`resolves to ${expected}`, async () => {
    /* ... */
  });
});
```

Le système ne doit pas permettre de distinguer inutilement une ressource inaccessible d'une ressource inexistante — voir la règle d'anti-énumération de `API_PATTERNS.md` §17.

---

## 14. Tests de contrat API

Un test de contrat vérifie qu'un endpoint respecte exactement le format défini par `API_PATTERNS.md` : enveloppe de réponse, casing, codes d'erreur canoniques, codes HTTP.

```typescript
describe("POST /api/v1/tenders/:tenderId/shortlist", () => {
  it("returns the tender without a data wrapper", async () => {
    const response = await client.post(`/tenders/${tenderId}/shortlist`);

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty("data");
    expect(response.body.status).toBe("SHORTLISTED");
  });

  it("returns INVALID_TENDER_STATUS_TRANSITION for an archived tender", async () => {
    const response = await client.post(`/tenders/${archivedTenderId}/shortlist`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_TENDER_STATUS_TRANSITION");
  });
});
```

Cas minimaux par endpoint (`API_PATTERNS.md` §38, `MODULE_TEMPLATE.md` §56) : authentification ; validation ; permission ; tenant ; cas nominal ; conflit métier ; concurrence ; idempotence si applicable.

---

## 15. Tests end-to-end (Playwright)

Les workflows critiques doivent posséder des tests E2E (`ENGINEERING_STANDARDS.md` §68) :

```text
Créer une organisation
→ créer un Tender
→ le shortlister
→ enregistrer une décision GO
→ créer un Workspace

Uploader un DCE
→ traiter le document
→ extraire les exigences
→ afficher les citations

Approuver une Proposal
→ générer le package
→ vérifier la conformité
→ enregistrer la soumission
```

```typescript
import { test, expect } from "@playwright/test";

test("shortlists a tender and records a GO decision", async ({ page }) => {
  await page.goto("/tenders");
  await page.getByRole("button", { name: "Shortlist" }).click();
  await expect(page.getByText("SHORTLISTED")).toBeVisible();

  await page.getByRole("button", { name: "Enregistrer la décision" }).click();
  await page.getByLabel("Décision").selectOption("GO");
  await page.getByRole("button", { name: "Confirmer" }).click();

  await expect(page.getByText("Workspace créé")).toBeVisible();
});
```

Les tests E2E restent peu nombreux et ciblés sur les workflows métier réellement critiques — pas un doublon de chaque test de contrat ou de composant.

---

## 16. Tests de migration

Chaque migration importante est testée sur : base vide ; schéma existant ; données représentatives ; volume simulé ; ancienne version de l'application ; nouvelle version ; rollback ou restauration (`DATABASE_PATTERNS.md` §119).

```typescript
describe("migration 20260725_add_tender_version", () => {
  it("backfills existing rows with version = 1", async () => {
    await applyMigrationsUpTo("20260724_previous");
    await seedLegacyTenderWithoutVersion();

    await applyMigration("20260725_add_tender_version");

    const row = await queryRawTender();
    expect(row.version).toBe(1);
  });
});
```

---

## 17. Tests IA

Rappel de `AI_ARCHITECTURE.md` §93 et `AI_PATTERNS.md` §38 : **AI Gateway** (routage, refus de politique, timeout, fallback, budget, sortie invalide, traçabilité) ; **RAG** (tenant filter, permissions, version documentaire, confidentialité, absence de fuite, citations, documents supprimés exclus) ; **Agents** (outils autorisés/interdits, limite d'étapes, condition d'arrêt, validation humaine, injection) ; **Sorties** (schema validation, enums, données absentes, citations, contradictions, confiance).

```typescript
describe("RunDceAnalysisUseCase", () => {
  it("never retrieves chunks from another organization", async () => {
    await seedChunk({ organizationId: ORGANIZATION_B_ID });

    const result = await useCase.execute({ organizationId: ORGANIZATION_A_ID, ...input });

    expect(result.citations.every((c) => c.organizationId === ORGANIZATION_A_ID)).toBe(true);
  });
});
```

Les tests ordinaires ne dépendent jamais d'un modèle IA réel — toujours `FakeAIGateway` (`AI_PATTERNS.md` §38).

---

## 18. Tests frontend

Rappel de `FRONTEND_PATTERNS.md` §37 : cas nominal ; erreur serveur ; permission refusée (capacité désactivée) ; état vide ; état de chargement ; interaction clavier ; soumission de formulaire, y compris invalide ; opération asynchrone suivie jusqu'à son terme.

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

describe("ShortlistTenderButton", () => {
  it("is disabled when capabilities.canShortlist is false", () => {
    render(<ShortlistTenderButton tenderId="..." disabled />);

    expect(screen.getByRole("button", { name: /shortlist/i })).toBeDisabled();
  });
});
```

Les appels API sont simulés via les contrats de `packages/contracts`, jamais via un backend réel non maîtrisé.

---

## 19. Déterminisme

Les tests ne doivent pas dépendre directement de (`ENGINEERING_STANDARDS.md` §70) : l'heure réelle ; nombres aléatoires non contrôlés ; réseau externe ; ordre d'exécution ; données partagées ; modèle IA réel.

```typescript
const clock = new FixedClock(new Date("2026-07-25T14:00:00Z"));
const idGenerator = new SequentialIdGenerator();

const useCase = createUseCase({ clock, idGenerator });
```

Utiliser : `Clock` injectée (`DATABASE_PATTERNS.md` — abstraction de temps) ; IDs contrôlés ; fixtures ; providers simulés ; bases isolées par test ou par worker.

---

## 20. Fixtures et factories

Les fixtures doivent être : explicites ; faciles à modifier ; tenant-aware ; sans secret ; réalistes sans devenir volumineuses (`ENGINEERING_STANDARDS.md` §73).

```typescript
export class TenderFactory {
  static newTender(overrides: Partial<TenderFactoryInput> = {}): Tender {
    return Tender.rehydrate({
      id: TenderId.from(overrides.id ?? TENDER_ID),
      organizationId: OrganizationId.from(overrides.organizationId ?? ORGANIZATION_A_ID),
      status: overrides.status ?? TenderStatus.Discovered,
      version: overrides.version ?? 1,
      // ...
    });
  }
}
```

Voir `MODULE_TEMPLATE.md` §58. Éviter les fixtures globales contenant des dizaines de propriétés non pertinentes pour le test courant.

---

## 21. Fakes et in-memory adapters

Mocker uniquement les frontières nécessaires (`ENGINEERING_STANDARDS.md` §74) : fake repository ; fake clock ; fake event publisher ; fake identity provider ; `FakeAIGateway` (`AI_PATTERNS.md` §38) ; fake Object Storage.

```typescript
export class InMemoryTenderRepository implements TenderRepository {
  private readonly records = new Map<string, Tender>();

  async findById(input: { organizationId: string; tenderId: string }) {
    const tender = this.records.get(input.tenderId);
    if (!tender || tender.organizationId.value !== input.organizationId) return null;
    return tender;
  }
}
```

Un fake respecte strictement le contrat du port qu'il remplace — voir `MODULE_TEMPLATE.md` §59. Il ne doit pas être si permissif qu'il masque une règle réelle (ex. un fake qui ignore le filtrage tenant invaliderait le test §12).

---

## 22. Règles de mocking

Éviter de mocker chaque méthode interne d'une classe, ce qui rend les tests dépendants de l'implémentation plutôt que du comportement (`ENGINEERING_STANDARDS.md` §74).

```text
Préférer : remplacer un port entier par un fake cohérent
Éviter   : vi.spyOn(tenderRepository, "findById").mockResolvedValueOnce(...)
           répété à travers des dizaines de tests fragiles
```

---

## 23. Isolation des tests

Chaque test d'intégration s'exécute contre un état connu et isolé : base de test dédiée ou transaction annulée en fin de test, sans donnée partagée entre exécutions ni dépendance à l'ordre d'exécution (§19). Les tests parallèles (`fullyParallel: true` en Playwright, comportement par défaut de Vitest) ne doivent jamais se disputer la même donnée tenant.

```typescript
beforeEach(async () => {
  await resetTestDatabase();
});
```

---

## 24. Tests d'architecture

Des règles automatiques protègent les frontières définies par `ARCHITECTURE_RULES.md` (§34) :

```text
domain/** must not import @nestjs/*
domain/** must not import @prisma/*
application/** must not import interfaces/**
application/** must not import infrastructure/**
modules/A/** must not deep-import modules/B/**
packages/ui/** must not import a business type
```

```typescript
describe("module boundaries", () => {
  it("domain layer has no framework dependency", () => {
    const violations = dependencyCruiser.check("domain/**", FORBIDDEN_IMPORTS);
    expect(violations).toEqual([]);
  });
});
```

Ces contrôles utilisent ESLint boundaries, `dependency-cruiser`, ou un script interne équivalent (`MODULE_TEMPLATE.md` §57).

---

## 25. Couverture de code

Non un objectif isolé (`ENGINEERING_STANDARDS.md` §71). Priorité : règles métier critiques ; permissions ; multi-tenancy ; transactions ; workflows ; erreurs ; intégrations sensibles.

```text
Interdit : viser 100% de couverture sur packages/ui au détriment
           des tests de permission sur les use cases critiques.
```

Un rapport de couverture identifie les zones non testées ; il ne remplace jamais une revue des assertions elles-mêmes.

---

## 26. Assertions significatives

Une assertion doit vérifier un comportement observable, pas simplement l'absence d'exception.

```typescript
// Faible
expect(async () => await useCase.execute(command)).not.toThrow();

// Significatif
const result = await useCase.execute(command);
expect(result.status).toBe("SHORTLISTED");
expect(auditRepository.entries).toContainEqual(
  expect.objectContaining({ action: "tender.shortlist" }),
);
```

---

## 27. Tests de concurrence

```typescript
it("rejects a concurrent update with a stale version", async () => {
  const tenderV1 = await repository.findById({ organizationId, tenderId });

  await repository.save({ organizationId, tender: tenderV1, expectedVersion: 1 }); // → version 2

  await expect(
    repository.save({ organizationId, tender: tenderV1, expectedVersion: 1 }),
  ).rejects.toThrow(PersistenceConcurrencyError);
});
```

Voir `DATABASE_PATTERNS.md` §121 pour le scénario complet (deux utilisateurs, version obsolète).

---

## 28. Tests d'idempotence

```typescript
it("returns the same result for a replayed idempotency key", async () => {
  const first = await useCase.execute({ ...command, idempotencyKey: KEY });
  const second = await useCase.execute({ ...command, idempotencyKey: KEY });

  expect(second).toEqual(first);
  expect(repository.createdCount).toBe(1);
});

it("rejects a reused key with a different payload", async () => {
  await useCase.execute({ ...command, idempotencyKey: KEY });

  await expect(
    useCase.execute({ ...command, title: "different", idempotencyKey: KEY }),
  ).rejects.toThrow(IdempotencyKeyReusedWithDifferentPayloadError);
});
```

Voir `DATABASE_PATTERNS.md` §123 et `AI_PATTERNS.md` §22.

---

## 29. Tests de soft delete

```typescript
it("excludes soft-deleted tenders from standard queries", async () => {
  await repository.softDelete({ organizationId, tenderId });

  const result = await repository.findById({ organizationId, tenderId });

  expect(result).toBeNull();
});
```

Voir `DATABASE_PATTERNS.md` §124 pour la matrice complète (unicité, restauration, accès administratif).

---

## 30. Tests Outbox

```typescript
it("does not persist an outbox event when the business transaction rolls back", async () => {
  await expect(
    useCase.execute(commandThatFailsBusinessRule),
  ).rejects.toThrow();

  expect(await outboxRepository.countPending()).toBe(0);
});
```

Voir `DATABASE_PATTERNS.md` §122 : la cohérence transactionnelle entre écriture métier et Outbox doit être testée dans les deux sens (échec métier → pas d'événement ; échec Outbox → rollback métier).

---

## 31. Tests de sécurité minimaux

Sans se substituer à un audit dédié (`SECURITY_PATTERNS.md`, à venir), chaque module significatif teste au minimum : accès direct par identifiant hors tenant (§12) ; tentative d'accès sans authentification ; tentative d'accès sans permission (§13) ; upload de fichier avec MIME falsifié ; injection basique dans un champ texte libre (`'; DROP TABLE...`, `<script>...`) rejetée ou neutralisée sans erreur serveur.

```typescript
it("rejects a spoofed MIME type on upload", async () => {
  const response = await uploadFile({ contentType: "application/pdf", buffer: EXECUTABLE_BUFFER });

  expect(response.status).toBe(422);
});
```

---

## 32. Tests de performance

Non systématiques — exécutés lorsqu'un budget de latence ou un volume est explicitement défini (`ARCHITECTURE_RULES.md` §38, `DATABASE_PATTERNS.md` §95).

```typescript
it("lists 10,000 tenders within the pagination budget", async () => {
  await seedTenders(10_000);

  const started = performance.now();
  await listTendersUseCase.execute({ organizationId, limit: 25 });

  expect(performance.now() - started).toBeLessThan(200);
});
```

Un test de performance mesure une hypothèse explicite, pas une impression.

---

## 33. Configuration Vitest de référence

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.spec.ts"],
    exclude: ["tests/**"], // réservé aux specs Playwright
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
```

Dans un monorepo, chaque `package`/`app` peut définir sa propre configuration héritant d'une base partagée (`packages/testing` ou équivalent), avec un `environment: "jsdom"` pour les tests de composant frontend.

---

## 34. Configuration Playwright de référence

La configuration existante (`playwright.config.ts`) reste la base :

```typescript
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
});
```

Les tests E2E vivent dans `tests/`, à la racine — distincts des tests unitaires/intégration colocalisés dans chaque module (§7).

---

## 35. Exécution en CI

Pipeline minimum (`ENGINEERING_STANDARDS.md` §80) :

```text
Install
Lint
Format Check
Type Check
Unit Tests
Integration Tests
Build
Migration Validation
Security Scan
```

Selon le contexte : Contract Tests ; E2E Tests ; Dependency Review ; Container Scan. Le détail de l'orchestration CI/CD (environnements, secrets, parallélisation) est défini dans `DEPLOYMENT_PATTERNS.md` (à venir) ; ce document ne couvre que la nature des tests exécutés, pas leur infrastructure d'exécution.

---

## 36. Gestion des échecs de test

Un test qui échoue doit être diagnostiqué, jamais contourné.

```text
Test échoue
→ identifier la cause
→ déterminer si le test ou le code est incorrect
→ corriger la cause
→ réexécuter le test et les tests liés
```

Interdits : supprimer un test pour faire passer la CI ; désactiver un test sans justification documentée et un ticket de suivi ; affaiblir arbitrairement une assertion ; augmenter un timeout sans diagnostic préalable ; marquer un test `skip` pour clôturer une mission (cohérent avec `skills/engineering-governor/SKILL.md` §22).

---

## 37. Anti-patterns interdits

```text
Test nommé d'après l'implémentation plutôt que le comportement
Assertion qui vérifie seulement l'absence d'exception
Mock de chaque méthode interne d'une classe plutôt qu'un fake de port
Test dépendant de l'heure réelle ou d'un ID aléatoire non contrôlé
Test dépendant de l'ordre d'exécution ou de données partagées entre tests
Fixture géante réutilisée partout, masquant les propriétés pertinentes
Test d'intégration utilisant un mock du client Prisma plutôt qu'une base réelle
Test IA dépendant d'un modèle réel plutôt que d'un FakeAIGateway
Suppression ou skip d'un test en échec pour livrer plus vite
Couverture élevée obtenue par des tests sans assertion significative
Test E2E dupliquant un scénario déjà couvert par un test de contrat
Absence de test multi-tenant sur un module manipulant des données tenant-scoped
Absence de test de permission sur une action sensible
```

---

## 38. Conditions bloquantes

La livraison doit être bloquée lorsque : une règle métier critique n'a pas de test ; un module tenant-scoped n'a pas de test d'isolation inter-tenant ; une action protégée par permission n'a pas de test de refus ; un test critique échoue en CI ; un test a été supprimé ou skip sans justification et sans ticket de suivi ; un test d'intégration ou de contrat dépend d'un état non déterministe ; les tests d'architecture (§24) échouent.

---

## 39. Definition of Ready

La stratégie de test d'un changement est prête lorsque : les règles métier et permissions concernées sont identifiées ; le tenant scope est connu ; les priorités de couverture (§6) applicables sont identifiées ; les fakes/fixtures nécessaires existent ou sont prévus ; la nécessité d'un test E2E est tranchée.

---

## 40. Definition of Done

Une fonctionnalité est testée de manière satisfaisante lorsque :

```text
Business rules covered by unit tests
+
Permission denial tested for every sensitive action
+
Cross-tenant isolation tested for every tenant-scoped resource
+
Repository and transaction behavior covered by integration tests
+
API contract tested for nominal, validation, permission, tenant and conflict cases
+
Critical workflow covered by an E2E test if applicable
+
Tests are deterministic and independent of execution order
+
No test was deleted or skipped to make CI pass
+
CI pipeline passes in full
```

---

## 41. Checklist de test par type de changement

**Use case métier**

- [ ] Cas nominal.
- [ ] Règle métier refusée.
- [ ] Permission refusée.
- [ ] Autre tenant.
- [ ] Transaction correcte (rollback si échec).
- [ ] Événement Outbox attendu.

**Endpoint API**

- [ ] Cas nominal (enveloppe et casing corrects).
- [ ] Validation.
- [ ] Non authentifié.
- [ ] Non autorisé.
- [ ] Introuvable / autre tenant.
- [ ] Conflit métier ou de concurrence.
- [ ] Contrat conforme à `API_PATTERNS.md`.

**Repository**

- [ ] Mapping vers/depuis le Domain.
- [ ] Filtrage tenant.
- [ ] Contraintes uniques.
- [ ] Concurrence optimiste.
- [ ] Transaction.

**Worker / traitement asynchrone**

- [ ] Succès.
- [ ] Retry.
- [ ] Idempotence.
- [ ] Erreur définitive et Dead Letter.

**Capacité IA**

- [ ] Sortie valide et invalide.
- [ ] Permission et tenant.
- [ ] Citations.
- [ ] Fuite inter-tenant (RAG).
- [ ] Injection.

**Composant frontend**

- [ ] Cas nominal.
- [ ] Erreur serveur.
- [ ] Capacité désactivée (permission refusée).
- [ ] État vide et chargement.
- [ ] Soumission de formulaire invalide.

---

## 42. Critères d'acceptation

Ce document est correctement appliqué lorsque :

- chaque règle métier critique, chaque permission sensible et chaque ressource tenant-scoped dispose d'un test dédié ;
- les tests restent déterministes, rapides pour la majorité (pyramide respectée), et indépendants les uns des autres ;
- les fakes remplacent des ports entiers plutôt que de mocker des détails d'implémentation ;
- les tests de contrat API et les tests IA restent alignés sur les conventions déjà fixées par `API_PATTERNS.md` et `AI_PATTERNS.md` ;
- aucun test n'est supprimé ou désactivé pour faire passer la CI sans justification documentée ;
- la couverture sert à identifier les zones non testées, jamais utilisée comme objectif indépendant des priorités du §6 ;
- les tests E2E restent peu nombreux et ciblés sur les workflows métier réellement critiques ;
- le choix de Vitest et React Testing Library (§3) est confirmé ou révisé avant la première implémentation de code applicatif.
