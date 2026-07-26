# TenderOS — Engineering Standards

Version : 1.0
Statut : Draft
Propriétaires : Engineering Governor & Product Architecture

---

## 1. Objectif

Ce document définit les standards d'ingénierie applicables à TenderOS.

Il sert de référence pour : Claude agissant comme CTO & Lead Developer ; les développeurs humains ; les agents et Skills techniques ; les revues de code ; les décisions d'architecture ; la validation des Pull Requests ; la préparation des mises en production.

Toute contribution au projet doit respecter ces standards.

Une dérogation significative doit être :

1. explicitement justifiée ;
2. documentée ;
3. limitée dans le temps si possible ;
4. validée selon le niveau d'autonomie défini dans le Skill `engineering-governor`.

---

## 2. Hiérarchie des documents

En cas de contradiction, l'ordre de priorité est le suivant :

```text
1. PRODUCT_CONSTITUTION.md (racine)
2. bible/03-domain/business-rules.md
3. bible/03-domain/permissions.md
4. bible/03-domain/domain-model.md
5. bible/03-domain/workflow.md
6. bible/03-domain/events.md
7. bible/04-architecture/system-architecture.md
8. docs/04-architecture/DATABASE_DESIGN.md
9. docs/04-architecture/API_GUIDELINES.md
10. docs/05-ai/AI_ARCHITECTURE.md
11. docs/04-architecture/ENGINEERING_STANDARDS.md (ce document)
12. bible/04-architecture/adr/ (ADR acceptés)
13. Documentation locale du module
```

Un standard technique ne peut jamais neutraliser une règle métier ou une permission.

---

## 3. Principes fondamentaux

TenderOS applique les principes suivants :

- Correctness before cleverness
- Security by default
- Explicit over implicit
- Simple before generic
- Modular Monolith First
- Business intent before technical convenience
- Tests are part of the implementation
- No silent failure
- No untraceable AI action
- No cross-tenant access

---

## 4. Priorités d'ingénierie

En cas de compromis, l'ordre de priorité est :

1. sécurité ;
2. intégrité métier ;
3. isolation multi-tenant ;
4. traçabilité ;
5. maintenabilité ;
6. testabilité ;
7. fiabilité ;
8. performance ;
9. rapidité de développement ;
10. sophistication technique.

La rapidité de livraison ne justifie jamais : une faille de sécurité ; une violation des permissions ; une perte de données ; une suppression de contrôle métier ; un accès inter-tenant ; une absence totale de tests sur un workflow critique.

---

## 5. Architecture générale

TenderOS suit une architecture : modulaire ; orientée domaine ; en couches ; event-driven lorsque pertinent ; API-first ; multi-tenant ; AI-first mais human-controlled.

Architecture de référence :

```text
Presentation
    ↓
Application
    ↓
Domain
    ↑
Infrastructure
```

Les dépendances doivent pointer vers le Domain, jamais l'inverse.

---

## 6. Modular Monolith

Chaque domaine fonctionnel doit être isolé dans un module.

```text
identity
organizations
authorization
tenders
qualification
workspaces
documents
dce
ai-analysis
company-brain
proposals
compliance
submission
audit
```

Chaque module est propriétaire de : sa logique métier ; ses use cases ; ses interfaces publiques ; ses repositories ; ses événements ; ses tests ; sa documentation locale.

**Interdictions** — Un module ne doit pas : accéder directement aux repositories privés d'un autre module ; modifier les tables d'un autre module sans contrat ; importer les entités internes d'un autre module ; contourner un use case pour modifier un statut ; dépendre d'un contrôleur ou d'un DTO de présentation.

---

## 7. Architecture des modules

Structure recommandée :

```text
module/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── aggregates/
│   ├── events/
│   ├── services/
│   ├── repositories/
│   └── errors/
│
├── application/
│   ├── commands/
│   ├── queries/
│   ├── use-cases/
│   ├── handlers/
│   ├── policies/
│   └── ports/
│
├── infrastructure/
│   ├── persistence/
│   ├── adapters/
│   ├── mappers/
│   └── configuration/
│
├── presentation/
│   ├── controllers/
│   ├── dto/
│   ├── presenters/
│   └── validation/
│
└── tests/
```

Cette structure peut être simplifiée pour les petits modules, mais les responsabilités doivent rester séparées.

---

## 8. Domain-Driven Design

Le Domain doit exprimer le vocabulaire métier défini dans `UBIQUITOUS_LANGUAGE.md`.

**Le Domain peut contenir** — agrégats ; entités ; value objects ; invariants ; services de domaine ; événements métier ; erreurs métier ; interfaces de repositories.

**Le Domain ne peut pas dépendre de** — NestJS ; Prisma ; Next.js ; HTTP ; Redis ; S3 ; fournisseurs IA ; systèmes de logs ; variables d'environnement ; formats de transport.

Exemple :

```typescript
// Correct
proposal.approve({
  approvedBy: actorId,
  approvedAt: clock.now(),
});

// Incorrect
await prisma.proposal.update({
  where: { id: proposalId },
  data: { status: "APPROVED" },
});
```

Le second exemple contourne les invariants métier.

---

## 9. Agrégats

Un agrégat doit protéger ses invariants.

Exemples d'agrégats possibles : Tender ; Qualification ; TenderWorkspace ; Document ; Proposal ; ComplianceChecklist ; SubmissionPackage.

**Règles** — les modifications passent par des méthodes métier ; les propriétés sensibles ne doivent pas être librement modifiables ; un agrégat ne doit pas charger inutilement tout le graphe relationnel ; les références vers d'autres agrégats utilisent leurs identifiants ; les événements sont produits par l'agrégat ou le use case responsable.

---

## 10. Use Cases

Toute action métier significative doit être représentée par un use case explicite.

```text
CreateManualTender
ShortlistTender
RecordGoNoGoDecision
CreateTenderWorkspace
UploadConsultationDocument
ApproveProposal
GenerateSubmissionPackage
RecordSubmission
```

Un use case doit : exprimer une intention métier ; vérifier l'autorisation ; charger les données nécessaires ; appliquer les règles métier ; exécuter les changements dans une transaction si nécessaire ; générer les événements ; produire un résultat explicite ; échouer avec une erreur identifiable.

---

## 11. Commands et Queries

Le projet peut utiliser une séparation légère entre commandes et requêtes.

**Command** — modifie l'état ; exprime une intention ; peut produire des événements ; ne doit pas être exécutée silencieusement plusieurs fois sans stratégie d'idempotence.

```typescript
type ApproveProposalCommand = {
  organizationId: OrganizationId;
  proposalId: ProposalId;
  proposalVersionId: ProposalVersionId;
  actorId: UserId;
};
```

**Query** — ne modifie pas l'état métier ; optimise la lecture ; peut utiliser des projections ; doit respecter les permissions et le tenant.

CQRS ne signifie pas que deux bases de données distinctes sont obligatoires.

---

## 12. TypeScript

TenderOS utilise TypeScript en mode strict.

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

---

## 13. Règles TypeScript

**Obligatoire** — types explicites aux frontières ; `readonly` lorsque pertinent ; unions discriminées pour les états ; `unknown` pour les données non validées ; validation des entrées externes ; gestion exhaustive des cas ; identifiants métier typés lorsque pertinent.

**Interdit par défaut** — `any` ; assertions non justifiées ; `@ts-ignore` ; `@ts-nocheck` ; types trop génériques ; objets non validés provenant d'une API ; cast utilisé pour masquer une erreur de conception.

```typescript
// Exemple déconseillé
const payload = response.data as Tender;

// Exemple correct
const payload = TenderSourceSchema.parse(response.data);
```

---

## 14. Usage de `any`

`any` est interdit sauf intégration externe exceptionnelle.

Une utilisation exceptionnelle doit : être isolée dans un adapter ; être commentée ; être convertie vers `unknown` ou un type validé immédiatement ; ne pas se propager dans le Domain ou l'Application.

---

## 15. Types métier

Éviter les primitives ambiguës.

```typescript
// Incorrect
function approveProposal(
  proposalId: string,
  userId: string,
  organizationId: string,
): Promise<void>;

// Préférable
function approveProposal(input: {
  proposalId: ProposalId;
  actorId: UserId;
  organizationId: OrganizationId;
}): Promise<void>;
```

Pour les valeurs sensibles, utiliser des Value Objects : `EmailAddress`, `Money`, `SubmissionDeadline`, `DocumentChecksum`, `TenderReference`, `ConfidenceScore`

---

## 16. Enums et unions

Les unions littérales sont généralement préférées aux enums TypeScript.

```typescript
type TenderStatus =
  | "DISCOVERED"
  | "SHORTLISTED"
  | "QUALIFYING"
  | "GO"
  | "NO_GO"
  | "EXPIRED"
  | "ARCHIVED";
```

Les enums peuvent être utilisés lorsqu'ils améliorent réellement l'interopérabilité ou la lisibilité.

---

## 17. Fonctions

Une fonction doit : avoir une responsabilité claire ; porter un nom exprimant son intention ; limiter les effets de bord ; retourner un résultat explicite ; éviter les paramètres positionnels multiples ; rester raisonnablement courte.

```typescript
// Préférer
createWorkspace({
  tenderId,
  organizationId,
  bidManagerId,
});

// Éviter
createWorkspace(tenderId, organizationId, bidManagerId, true, false);
```

---

## 18. Gestion de null et undefined

Convention : `undefined` représente une valeur non fournie ; `null` représente une absence enregistrée ou explicitement connue.

Ne pas mélanger les deux sans raison.

Les réponses API doivent suivre une convention stable documentée dans `API_GUIDELINES.md`.

---

## 19. Immutabilité

Les objets métier doivent privilégier l'immutabilité.

Exemples : versions documentaires ; décisions Go / No-Go ; approbations ; AI Runs ; packages de soumission ; événements métier.

Une correction doit généralement créer une nouvelle version ou un nouvel enregistrement.

---

## 20. NestJS

NestJS est utilisé comme framework backend, pas comme Domain Model.

**Controllers** — Un contrôleur doit seulement : recevoir la requête ; extraire le contexte d'authentification ; valider les paramètres ; appeler un use case ; transformer le résultat ; retourner la réponse HTTP.

Un contrôleur ne doit pas : contenir de règle métier ; appeler directement Prisma ; choisir lui-même les permissions ; construire un prompt IA ; orchestrer une transaction métier complexe.

---

## 21. Services NestJS

Le suffixe `Service` ne doit pas devenir une catégorie générique.

Préférer des noms explicites : `CreateTenderUseCase`, `ProposalApprovalPolicy`, `PrismaTenderRepository`, `S3DocumentStorage`, `AnthropicModelAdapter`

Éviter : `TenderService`, `CommonService`, `HelperService`, `UtilsService` s'ils regroupent des responsabilités hétérogènes.

---

## 22. Injection de dépendances

Les dépendances d'infrastructure doivent être injectées par interface ou token.

```typescript
export interface TenderRepository {
  findById(input: {
    organizationId: OrganizationId;
    tenderId: TenderId;
  }): Promise<Tender | null>;

  save(tender: Tender): Promise<void>;
}
```

L'implémentation Prisma reste dans Infrastructure.

---

## 23. DTO et validation

Toutes les entrées externes doivent être validées.

Sources concernées : requêtes HTTP ; fichiers ; événements ; connecteurs ; webhooks ; réponses de LLM ; variables d'environnement ; messages de queue.

Le projet doit choisir une solution principale de validation. Recommandation : **Zod**

Éviter de maintenir simultanément plusieurs systèmes de validation sans nécessité.

---

## 24. Configuration

La configuration doit être : typée ; validée au démarrage ; centralisée ; spécifique à l'environnement ; sans secret en valeur par défaut.

```typescript
const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]),
  DATABASE_URL: z.string().min(1),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
});
```

L'application doit refuser de démarrer si une configuration critique est invalide.

---

## 25. Prisma

Prisma est utilisé uniquement dans Infrastructure.

**Autorisé** — repositories ; transactions ; projections de lecture ; migrations ; seeds ; mappers.

**Interdit** — Prisma dans les entités ; Prisma dans les contrôleurs ; types Prisma exposés dans les contrats publics ; modèles Prisma retournés directement par les use cases ; logique métier exprimée seulement dans une requête update.

---

## 26. Repositories

Un repository doit représenter un besoin du Domain ou de l'Application, pas une copie générique de Prisma.

```typescript
// Éviter
interface GenericRepository<T> {
  create(data: unknown): Promise<T>;
  update(id: string, data: unknown): Promise<T>;
  delete(id: string): Promise<void>;
}

// Préférer
interface ProposalRepository {
  findForApproval(input: {
    organizationId: OrganizationId;
    proposalId: ProposalId;
  }): Promise<Proposal | null>;

  save(proposal: Proposal): Promise<void>;
}
```

---

## 27. Transactions

Toute opération modifiant plusieurs ressources cohérentes doit être transactionnelle.

Une transaction peut inclure : modification métier ; audit ; historique ; Outbox Event ; compteur ou projection critique.

Les appels externes ne doivent généralement pas être exécutés dans une transaction de base de données longue.

```text
Transaction métier
→ Outbox Event
→ traitement externe asynchrone
```

---

## 28. Multi-tenancy

Toute opération tenant-scoped doit recevoir explicitement `organizationId`.

Le tenant ne doit jamais être déduit uniquement d'un identifiant de ressource.

```typescript
// Incorrect
findTenderById(tenderId);

// Correct
findTenderById({
  organizationId,
  tenderId,
});
```

Cette règle s'applique à : API ; repositories ; workers ; événements ; logs ; recherche vectorielle ; stockage de fichiers ; caches ; exports ; IA.

---

## 29. Tests multi-tenant

Chaque module manipulant des ressources tenant-scoped doit inclure au minimum un test vérifiant que :

```text
Organization A
ne peut ni lire, ni modifier, ni déduire
une ressource de Organization B
```

Les tests doivent couvrir : accès direct par identifiant ; listes ; recherche ; téléchargement ; workers ; événements ; RAG ; exports.

---

## 30. Next.js et React

Le frontend est organisé par fonctionnalité.

```text
features/
├── tenders/
├── qualification/
├── workspaces/
├── documents/
├── proposals/
└── compliance/
```

Les composants métier doivent rester dans leur feature.

Les composants purement génériques peuvent être déplacés dans `packages/ui`.

---

## 31. Server Components

Les Server Components sont utilisés par défaut lorsque possible.

Les Client Components sont réservés aux besoins tels que : interactions utilisateur ; état local ; effets navigateur ; formulaires interactifs ; drag-and-drop ; éditeurs riches ; WebSocket.

Ne pas ajouter `"use client"` à un arbre complet sans nécessité.

---

## 32. Logique métier côté frontend

Le frontend peut gérer : état d'affichage ; validations ergonomiques ; navigation ; transformations de présentation.

Le frontend ne doit jamais être la seule protection d'une règle métier ou d'une permission.

Toute règle critique doit être appliquée côté serveur.

---

## 33. Gestion de l'état

Priorités :

1. Server state
2. URL state
3. Form state
4. Local component state
5. Global client state uniquement si nécessaire

Ne pas introduire un store global pour des données pouvant rester dans : le serveur ; l'URL ; un formulaire ; un composant local.

---

## 34. Requêtes frontend

Pour les données interactives côté client, la solution recommandée est **TanStack Query**.

Les clés de cache doivent être : structurées ; tenant-aware ; stables ; invalidées explicitement après mutation.

```typescript
["organization", organizationId, "tenders", filters]
```

---

## 35. Formulaires

Recommandation : React Hook Form + Zod

Les formulaires doivent : afficher clairement les erreurs ; empêcher les doubles soumissions ; préserver les données lors d'une erreur récupérable ; gérer les états de chargement ; être accessibles au clavier ; éviter les validations contradictoires avec le backend.

---

## 36. Accessibilité

Le produit doit viser au minimum les bonnes pratiques WCAG 2.1 AA.

Exigences minimales : navigation clavier ; labels de formulaires ; contraste suffisant ; focus visible ; messages d'erreur compréhensibles ; boutons avec noms accessibles ; titres structurés ; absence de dépendance exclusive à la couleur ; support des lecteurs d'écran pour les actions critiques.

---

## 37. Design System

Les composants partagés doivent respecter une API cohérente.

Un composant partagé doit être : accessible ; documenté ; testable ; visuellement cohérent ; sans dépendance métier cachée.

Le Design System ne doit pas contenir : règles Tender ; permissions ; appels API ; logique de Workspace ; logique de Proposal.

---

## 38. API

Les règles détaillées sont définies dans `API_GUIDELINES.md`.

Standards généraux : versionnement ; réponses cohérentes ; erreurs structurées ; pagination ; idempotence lorsque nécessaire ; endpoints exprimant l'intention métier ; absence d'exposition des modèles Prisma.

---

## 39. Événements

Les événements doivent suivre `DOMAIN_EVENTS.md`.

Un événement doit : décrire un fait passé ; être immuable ; être versionné ; contenir le tenant lorsque pertinent ; posséder un identifiant ; posséder un timestamp ; être sérialisable ; éviter les données sensibles inutiles.

```text
Correct    : ProposalApproved, DocumentUploaded, SubmissionRecorded
Incorrect  : ApproveProposal, UploadDocument, SendNotification
```

Les noms incorrects expriment des commandes, pas des événements.

---

## 40. Idempotence

Les consumers et jobs doivent être idempotents.

Techniques possibles : `processed_events` ; clé d'idempotence ; contrainte unique ; statut de traitement ; checksum ; verrou ; upsert contrôlé.

Un retry ne doit pas : créer deux notifications identiques ; générer deux soumissions ; dupliquer un Tender ; doubler une facture ; produire deux versions avec le même numéro.

---

## 41. Traitements asynchrones

Un traitement long ne doit pas bloquer une requête HTTP.

Sont notamment asynchrones : extraction PDF ; OCR ; embeddings ; analyse IA ; import massif ; génération documentaire ; synchronisation BOAMP/TED ; notifications ; export volumineux.

L'API doit retourner un statut approprié, généralement `202 Accepted` avec un identifiant de suivi.

---

## 42. Workers

Un worker doit : valider le message reçu ; vérifier le tenant ; être idempotent ; journaliser le début et la fin ; gérer les retries ; utiliser des timeouts ; classifier les erreurs ; envoyer les échecs définitifs en Dead Letter ; ne jamais masquer un échec.

---

## 43. IA

Toute utilisation d'un modèle IA passe par l'AI Gateway.

Il est interdit : d'appeler directement un fournisseur depuis un contrôleur ; de construire des prompts dispersés dans les modules ; d'accepter une sortie IA sans validation ; d'envoyer des données non autorisées ; de considérer une réponse probabiliste comme une preuve.

Les détails sont définis dans `AI_ARCHITECTURE.md`.

---

## 44. Sorties structurées IA

Toute sortie utilisée par l'application doit être validée.

```typescript
const result = RequirementExtractionSchema.parse(rawOutput);
```

En cas d'échec : ne pas enregistrer la sortie comme valide ; journaliser l'erreur sans fuite de données ; permettre un retry contrôlé ; conserver la traçabilité du Run.

---

## 45. Citations IA

Toute affirmation extraite d'un DCE doit, lorsque pertinent, contenir : le document ; la version ; la page ; la section ; un extrait limité ; un niveau de confiance.

Une analyse sans preuve ne doit pas être présentée comme certaine.

---

## 46. Sécurité

La sécurité est une responsabilité collective et continue.

Exigences : authentification côté serveur ; autorisation côté serveur ; isolation multi-tenant ; validation des entrées ; limitation de débit ; contrôle des uploads ; protection des secrets ; audit des actions sensibles ; dépendances surveillées ; erreurs non bavardes ; chiffrement approprié ; politique de rétention.

---

## 47. Secrets

Les secrets ne doivent jamais apparaître dans : Git ; les logs ; les erreurs API ; les événements ; les prompts ; les fixtures ; les captures d'écran ; la documentation ; les commentaires de code.

Utiliser : variables d'environnement ; Secret Manager ; credentials temporaires ; rotation de secrets.

---

## 48. Données personnelles et confidentielles

Le code doit appliquer le principe de minimisation. Ne collecter, enregistrer ou transmettre que les données nécessaires.

Les logs ne doivent pas contenir par défaut : contenu complet de documents ; mots de passe ; tokens ; emails en masse ; informations bancaires ; réponses IA confidentielles ; documents de soumission.

---

## 49. Uploads

Tout upload doit vérifier : permission ; tenant ; taille ; quota ; MIME type réel ; extension ; checksum ; antivirus ou malware scan ; destination de stockage ; nom de fichier sécurisé.

Le nom fourni par l'utilisateur ne doit pas être utilisé comme clé de stockage brute.

---

## 50. Erreurs

Les erreurs doivent être explicites et classifiées.

Catégories : `DomainError`, `ApplicationError`, `AuthorizationError`, `ValidationError`, `InfrastructureError`, `ExternalServiceError`, `ConcurrencyError`

Une erreur doit contenir : un code stable ; un message utilisateur approprié ; un identifiant de corrélation ; des détails sûrs si nécessaire.

Une erreur ne doit pas exposer : stack trace ; SQL ; prompt interne ; token ; chemin de fichier privé ; configuration ; détail d'une autre organisation.

---

## 51. Gestion des erreurs externes

Les intégrations externes doivent utiliser : timeout ; retry limité ; backoff exponentiel ; circuit breaker si nécessaire ; classification des erreurs ; métriques ; identifiant de corrélation.

Ne jamais appliquer un retry aveugle sur une action non idempotente.

---

## 52. Logging

Les logs sont structurés.

```text
timestamp
level
service
environment
module
operation
requestId
traceId
correlationId
organizationId
actorId
resourceType
resourceId
durationMs
result
errorCode
```

Éviter les messages uniquement textuels sans contexte.

```text
# Incorrect
Something went wrong
```

```json
{
  "level": "error",
  "module": "documents",
  "operation": "extractText",
  "documentVersionId": "…",
  "organizationId": "…",
  "errorCode": "TEXT_EXTRACTION_FAILED"
}
```

---

## 53. Observabilité

Chaque workflow critique doit être observable.

Minimum : logs ; métriques ; health checks ; erreurs traçables ; jobs en attente ; Dead Letters ; temps de traitement ; consommation IA ; taux de succès des connecteurs.

Un comportement impossible à observer est difficile à exploiter en production.

---

## 54. Health Checks

Les services doivent exposer `/liveness` et `/readiness`.

**Liveness** — Vérifie que le processus fonctionne.

**Readiness** — Vérifie que le service peut traiter des requêtes. Peut contrôler : connexion à PostgreSQL ; accès à la queue ; configuration critique ; disponibilité minimale du stockage.

Elle ne doit pas dépendre inutilement de tous les services externes.

---

## 55. Performance

Avant toute optimisation : mesurer ; identifier le goulot ; définir l'objectif ; modifier ; mesurer de nouveau.

Interdictions : optimisation spéculative complexe ; cache sans stratégie d'invalidation ; index sans justification ; chargement complet de collections volumineuses ; requêtes N+1 connues ; traitement lourd synchrone.

---

## 56. Pagination

Toute collection potentiellement volumineuse doit être paginée.

Préférence : cursor-based pagination pour les flux évolutifs et grands volumes.

La pagination par offset peut être utilisée pour : petits écrans administratifs ; listes stables ; cas simples justifiés.

---

## 57. Cache

Le cache n'est jamais la source de vérité.

Tout cache doit préciser : donnée cachée ; clé ; tenant ; durée ; invalidation ; comportement en cas de miss ; comportement en cas d'indisponibilité.

Une clé de cache tenant-scoped doit inclure `organizationId`.

---

## 58. Dépendances

Une nouvelle dépendance doit être justifiée.

Questions obligatoires : le besoin peut-il être couvert sans dépendance ? le package est-il maintenu ? sa licence est-elle compatible ? sa taille est-elle raisonnable ? possède-t-il des vulnérabilités connues ? crée-t-il un verrou fournisseur ? augmente-t-il fortement la complexité ?

Une dépendance majeure exige une validation selon le Skill Engineering Governor.

---

## 59. Versions des dépendances

Les versions doivent être : verrouillées dans le lockfile ; mises à jour régulièrement ; testées ; vérifiées par CI ; suivies pour les vulnérabilités.

Les mises à jour majeures ne doivent pas être fusionnées automatiquement sans analyse.

---

## 60. Monorepo

Les dépendances entre packages doivent rester explicites.

Interdit : imports par chemins relatifs traversant plusieurs packages ; dépendances circulaires ; package shared contenant tout ; import direct d'un code interne non exporté.

Chaque package doit définir clairement son API publique.

---

## 61. Shared Kernel

Le Shared Kernel reste minimal.

**Autorisé** — identifiants ; primitives ; `Money` ; `Clock` ; `Result` ; pagination ; erreurs de base ; contexte d'acteur.

**Interdit** — logique métier propre à Tender ; logique Proposal ; helpers génériques sans propriétaire ; repositories communs ; dépendances de framework.

---

## 62. Nommage

Les noms doivent exprimer l'intention métier.

Préférer : `RecordGoNoGoDecision`, `ApproveProposal`, `TenderSubmissionDeadline`, `ProposalApprovalPolicy`

Éviter : `ProcessData`, `HandleItem`, `DoAction`, `Manager`, `Helper`, `Utils`, `Common` sauf contexte réellement clair.

---

## 63. Commentaires

Le code doit être compréhensible principalement par sa structure et ses noms.

Les commentaires sont utiles pour expliquer : pourquoi une décision non évidente existe ; une contrainte externe ; une optimisation mesurée ; une règle réglementaire ; une dette technique temporaire.

```typescript
// Incorrect
// Increment version
version++;

// Correct
// Optimistic concurrency: the update must fail if another actor
// modified the aggregate since it was loaded.
version++;
```

---

## 64. Dette technique

Toute dette technique volontaire doit être documentée.

Format recommandé : Contexte, Compromis accepté, Risque, Impact, Plan de résolution, Échéance ou condition de réévaluation.

```typescript
// Éviter
// TODO fix later

// Préférer
// TODO(TOS-241): replace polling with event-driven refresh
// once workspace activity volume exceeds the MVP threshold.
```

---

## 65. Tests

Les tests font partie de la fonctionnalité. Une tâche n'est pas terminée lorsque le code fonctionne seulement manuellement.

Types : unitaires ; intégration ; contrat ; end-to-end ; sécurité ; migrations ; performance lorsque nécessaire.

---

## 66. Tests unitaires

Ils doivent couvrir prioritairement : invariants métier ; transitions d'état ; policies ; Value Objects ; calculs ; scénarios limites ; erreurs métier.

Ils doivent être : rapides ; déterministes ; indépendants de PostgreSQL ; indépendants du réseau ; lisibles.

---

## 67. Tests d'intégration

Ils couvrent : repositories Prisma ; transactions ; contraintes PostgreSQL ; Object Storage ; queues ; adapters ; migrations ; sérialisation d'événements.

Ils doivent utiliser des dépendances réelles ou fidèles lorsque cela apporte de la valeur.

---

## 68. Tests end-to-end

Les workflows critiques doivent posséder des tests E2E.

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

---

## 69. Tests de permissions

Toute permission importante doit être testée avec : utilisateur autorisé ; utilisateur non autorisé ; utilisateur d'un autre tenant ; utilisateur suspendu ; membre sans accès au Workspace ; ressource inexistante.

Le système ne doit pas permettre de distinguer inutilement une ressource inaccessible d'une ressource inexistante.

---

## 70. Tests déterministes

Les tests ne doivent pas dépendre directement de : l'heure réelle ; nombres aléatoires non contrôlés ; réseau externe ; ordre d'exécution ; données partagées ; modèle IA réel.

Utiliser : Clock injectée ; IDs contrôlés ; fixtures ; providers simulés ; bases isolées.

---

## 71. Couverture

La couverture de code n'est pas un objectif isolé.

Priorité : règles métier critiques ; permissions ; multi-tenancy ; transactions ; workflows ; erreurs ; intégrations sensibles.

Une couverture élevée ne compense pas des assertions faibles.

---

## 72. Structure des tests

Convention recommandée : Given / When / Then

```typescript
it("refuses approval when blocking comments remain", async () => {
  // Given
  const proposal = proposalFixture.withBlockingComment();

  // When
  const action = () => proposal.approve(approvalInput);

  // Then
  expect(action).toThrow(ProposalHasBlockingCommentsError);
});
```

---

## 73. Fixtures

Les fixtures doivent être : explicites ; faciles à modifier ; tenant-aware ; sans secret ; réalistes sans devenir volumineuses.

Éviter les fixtures globales contenant des dizaines de propriétés non pertinentes.

---

## 74. Mocking

Mocker uniquement les frontières nécessaires.

Préférer : fake repository ; fake clock ; fake event publisher ; fake identity provider.

Éviter de mocker chaque méthode interne d'une classe, ce qui rend les tests dépendants de l'implémentation.

---

## 75. Git

Branches recommandées :

```text
feature/<scope>
fix/<scope>
refactor/<scope>
docs/<scope>
chore/<scope>
```

Exemples : `feature/manual-tender-creation`, `fix/workspace-tenant-filter`, `docs/api-guidelines`

---

## 76. Commits

Convention : `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`, `ci:`, `build:`

Exemples :

```text
feat(tenders): add manual tender creation
fix(auth): enforce organization scope on membership lookup
test(proposals): cover blocking approval comments
```

Un commit doit représenter une intention cohérente.

---

## 77. Pull Requests

Une Pull Request doit contenir : contexte ; objectif ; changements principaux ; impacts métier ; impacts techniques ; stratégie de test ; migrations ; risques ; captures d'écran si UI ; ADR si nécessaire.

Une PR doit rester raisonnablement ciblée.

---

## 78. Taille des Pull Requests

Préférer plusieurs PR cohérentes plutôt qu'une PR massive.

Une PR volumineuse doit être justifiée lorsqu'elle concerne : migration structurelle ; refonte de module ; changement transversal ; génération initiale de plateforme.

Claude doit éviter d'ajouter des modifications non demandées dans la même PR.

---

## 79. Revue de code

La revue doit vérifier au minimum : conformité métier ; permissions ; multi-tenancy ; architecture ; lisibilité ; gestion des erreurs ; tests ; performance ; sécurité ; migrations ; documentation ; compatibilité ascendante.

---

## 80. CI

La CI doit exécuter au minimum :

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

Selon le contexte : Contract Tests ; E2E Tests ; Dependency Review ; Container Scan.

---

## 81. Lint et formatage

Le formatage doit être automatisé. Recommandation : ESLint + Prettier

La CI doit refuser : erreurs ESLint ; formatage incorrect ; imports interdits ; dépendances circulaires détectées ; types non valides.

Les règles importantes ne doivent pas être désactivées localement sans justification.

---

## 82. Imports

Les imports doivent suivre une convention stable.

Ordre recommandé : standard library ; dépendances externes ; packages internes ; imports du module ; types ; styles ou ressources.

Éviter les imports profonds vers les détails privés d'un package.

---

## 83. Code généré

Le code généré doit être identifiable. Il ne doit pas être modifié manuellement sauf procédure documentée.

Exemples : client Prisma ; contrats générés ; types OpenAPI ; migrations générées puis relues.

Le code généré ne dispense pas de revue.

---

## 84. Migrations

Toute migration doit être : versionnée ; relue ; testée ; compatible avec le déploiement ; accompagnée d'un plan pour les données existantes.

Une migration destructive exige une approbation explicite.

---

## 85. Compatibilité des déploiements

Les migrations doivent privilégier :

```text
Expand
→ Backfill
→ Switch
→ Contract
```

Le code applicatif et le schéma doivent pouvoir coexister pendant un déploiement progressif lorsque nécessaire.

---

## 86. Feature Flags

Un feature flag est utilisé pour : isoler une fonctionnalité incomplète ; effectuer un rollout progressif ; limiter un risque ; activer une fonction pour certains tenants.

Un feature flag ne doit pas : remplacer une permission ; cacher indéfiniment du code mort ; modifier silencieusement une règle métier critique ; devenir un système de configuration illisible.

Chaque flag doit avoir : un propriétaire ; une description ; une valeur par défaut ; une stratégie de suppression.

---

## 87. Documentation

Chaque module significatif doit documenter : sa responsabilité ; son périmètre ; ses agrégats ; ses use cases publics ; ses événements ; ses dépendances ; ses règles de sécurité ; sa stratégie de test.

La documentation doit évoluer avec le code.

---

## 88. ADR

Un ADR est obligatoire pour une décision structurante.

Exemples : ajout de Redis ; changement de stratégie d'authentification ; activation de PostgreSQL RLS ; extraction d'un microservice ; ajout d'OpenSearch ; nouveau fournisseur IA principal ; changement de framework ; nouvelle stratégie de stockage.

---

## 89. Définition de Ready

Une tâche est prête à être développée lorsque : l'objectif est clair ; le périmètre est défini ; les règles métier sont identifiées ; les permissions sont identifiées ; les critères d'acceptation existent ; les dépendances sont connues ; les ambiguïtés critiques sont résolues ; les impacts de données sont identifiés.

Claude doit s'arrêter si une ambiguïté empêche une implémentation fiable.

---

## 90. Définition de Done

Une tâche est terminée lorsque : le comportement demandé fonctionne ; les règles métier sont respectées ; les permissions sont appliquées ; l'isolation multi-tenant est vérifiée ; les tests nécessaires existent ; les tests passent ; le lint passe ; le type check passe ; le build passe ; les erreurs sont gérées ; les logs sont appropriés ; les migrations sont validées ; la documentation est mise à jour ; aucun secret n'est exposé ; aucune dette critique n'est introduite ; les critères d'acceptation sont satisfaits.

---

## 91. Critères de blocage

Une contribution ne doit pas être fusionnée si elle contient : faille de sécurité connue ; accès inter-tenant possible ; violation d'une règle métier ; permission non appliquée ; migration destructive non validée ; test critique en échec ; build en échec ; secret exposé ; perte de données potentielle non maîtrisée ; appel IA non autorisé ; modification d'architecture non documentée.

---

## 92. Règles spécifiques à Claude

**Avant de modifier le code**, Claude doit : lire les documents applicables ; identifier les règles métier ; identifier les permissions ; identifier le tenant scope ; identifier les impacts de données ; définir un plan ; classer les décisions selon son niveau d'autonomie.

**Pendant l'implémentation**, Claude doit : rester dans le périmètre ; éviter les refactorings non nécessaires ; écrire ou mettre à jour les tests ; documenter les décisions ; signaler les risques ; arrêter l'exécution si une validation obligatoire est requise.

**Après l'implémentation**, Claude doit : exécuter les vérifications ; relire les changements ; vérifier les permissions ; vérifier le multi-tenant ; résumer les décisions ; signaler ce qui n'a pas pu être validé.

---

## 93. Interdictions pour Claude

Claude ne doit jamais :

- inventer une règle métier ;
- modifier une permission sans approbation ;
- supprimer une donnée métier sans validation ;
- introduire une technologie majeure sans validation ;
- masquer un test en échec ;
- supprimer un test pour faire passer la CI ;
- utiliser `any` pour contourner un problème ;
- désactiver une règle de lint sans justification ;
- ignorer une erreur de migration ;
- déclarer une tâche terminée sans avoir vérifié les résultats ;
- prétendre avoir exécuté une commande non exécutée ;
- créer une dépendance externe inutile ;
- contourner l'AI Gateway ;
- exposer des secrets ou données confidentielles.

---

## 94. Rapport de fin de mission

À la fin d'une mission, Claude doit produire un résumé contenant : Objectif, Travail réalisé, Fichiers modifiés, Décisions techniques, Tests exécutés, Résultats, Migrations, Risques ou limites, Actions restantes, Validation éventuellement requise.

Claude doit distinguer clairement : ce qui a été vérifié ; ce qui a été supposé ; ce qui reste non testé.

---

## 95. Checklist de revue finale

**Produit et métier**

- [ ] La fonctionnalité correspond au besoin.
- [ ] Les Business Rules sont respectées.
- [ ] Le vocabulaire métier est correct.
- [ ] Les transitions d'état sont valides.

**Sécurité**

- [ ] Les permissions sont vérifiées côté serveur.
- [ ] Le tenant est explicitement filtré.
- [ ] Aucun secret n'est exposé.
- [ ] Les entrées sont validées.
- [ ] Les logs ne contiennent pas de données sensibles.

**Architecture**

- [ ] Les couches sont respectées.
- [ ] Le Domain ne dépend pas de l'infrastructure.
- [ ] Les frontières de modules sont respectées.
- [ ] Les appels IA passent par l'AI Gateway.
- [ ] Les traitements longs sont asynchrones.

**Données**

- [ ] Les transactions sont correctes.
- [ ] Les contraintes existent en base.
- [ ] Les migrations sont sûres.
- [ ] Le versionnement est respecté.
- [ ] L'Outbox est utilisée lorsque nécessaire.

**Qualité**

- [ ] Le code est lisible.
- [ ] Les noms expriment l'intention.
- [ ] Aucun `any` injustifié.
- [ ] Pas de duplication majeure.
- [ ] Pas d'abstraction prématurée.

**Tests**

- [ ] Tests unitaires pertinents.
- [ ] Tests d'intégration pertinents.
- [ ] Test de permission.
- [ ] Test multi-tenant.
- [ ] Test du scénario d'erreur principal.
- [ ] Tous les tests passent.

**Livraison**

- [ ] Lint réussi.
- [ ] Type check réussi.
- [ ] Build réussi.
- [ ] Documentation mise à jour.
- [ ] ADR créé si nécessaire.
- [ ] Rapport de mission complet.

---

## 96. Anti-patterns interdits

- logique métier dans un contrôleur ;
- logique métier dans un composant React ;
- accès Prisma depuis le Domain ;
- generic repository universel ;
- module utils sans propriétaire ;
- modification directe d'un statut ;
- requête tenant-scoped sans `organizationId` ;
- appel LLM direct ;
- long traitement HTTP synchrone ;
- événement utilisé comme commande ;
- consumer non idempotent ;
- stockage de fichier binaire en base ;
- cache considéré comme source de vérité ;
- catch vide ;
- erreur silencieuse ;
- `any` généralisé ;
- test supprimé pour résoudre un échec ;
- migration destructive implicite ;
- dépendance majeure non validée ;
- abstraction créée pour un seul cas hypothétique ;
- microservice sans contrainte réelle.

---

## 97. Critères d'acceptation

Les standards sont correctement appliqués lorsque :

- le code respecte les frontières de modules ;
- les use cases expriment les intentions métier ;
- le Domain reste indépendant des frameworks ;
- toutes les entrées externes sont validées ;
- les ressources tenant-scoped sont toujours filtrées ;
- les permissions critiques sont testées ;
- les opérations cohérentes sont transactionnelles ;
- les traitements asynchrones sont idempotents ;
- les sorties IA sont validées et traçables ;
- les tests critiques existent ;
- la CI bloque les erreurs ;
- les décisions structurantes possèdent un ADR ;
- Claude signale toute décision dépassant son autonomie.
