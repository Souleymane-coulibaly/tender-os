# TenderOS — API Patterns

Version : 1.0
Statut : Draft
Rôle concerné : Platform Foundation
Document parent : `skills/platform-foundation/SKILL.md`
Documents associés :

- `docs/04-architecture/API_GUIDELINES.md` (règles d'autorité — ce document en est la traduction en patterns d'implémentation)
- `docs/04-architecture/DATABASE_DESIGN.md`
- `docs/04-architecture/ENGINEERING_STANDARDS.md`
- `bible/02-product/ubiquitous-language.md`
- `bible/03-domain/domain-model.md`
- `bible/03-domain/business-rules.md`
- `bible/03-domain/permissions.md`
- `bible/03-domain/workflow.md`
- `skills/platform-foundation/ARCHITECTURE_RULES.md`
- `skills/platform-foundation/MODULE_TEMPLATE.md`

---

## 1. Objectif

Ce document définit les patterns d'implémentation obligatoires pour concevoir, exposer et faire évoluer les API HTTP de TenderOS.

Il traduit en patterns concrets (schémas, controllers, presenters, exemples) les règles déjà fixées par `API_GUIDELINES.md`, qui reste le document d'autorité sur les décisions de contrat (nommage, format, codes, versioning). Ce document ne redéfinit aucune règle : il montre comment l'appliquer dans le code, en cohérence avec `ARCHITECTURE_RULES.md` (frontières de couches) et `MODULE_TEMPLATE.md` (structure de module).

Il précise notamment : le routing et le versioning ; les conventions de nommage ; les enveloppes de réponse ; la pagination ; le format d'erreur et son catalogue ; les codes HTTP ; l'authentification et l'autorisation ; le multi-tenant ; l'idempotence ; la concurrence ; la sérialisation ; les opérations asynchrones ; les uploads ; les webhooks ; le rate limiting ; la documentation OpenAPI ; les patterns de controller, schéma et presenter ; les anti-patterns interdits.

En cas de divergence apparente entre ce document et `API_GUIDELINES.md`, `API_GUIDELINES.md` fait autorité — cela doit être signalé comme une erreur de ce document, pas résolu silencieusement.

---

## 2. Documents d'autorité

Ordre de priorité pour toute question relative aux API :

```text
1. PRODUCT_CONSTITUTION.md
2. bible/03-domain/business-rules.md
3. bible/03-domain/permissions.md
4. bible/03-domain/domain-model.md
5. bible/03-domain/workflow.md
6. bible/02-product/ubiquitous-language.md
7. bible/04-architecture/system-architecture.md
8. docs/04-architecture/DATABASE_DESIGN.md
9. docs/04-architecture/API_GUIDELINES.md
10. docs/04-architecture/ENGINEERING_STANDARDS.md
11. skills/platform-foundation/ARCHITECTURE_RULES.md
12. skills/platform-foundation/MODULE_TEMPLATE.md
13. skills/platform-foundation/API_PATTERNS.md   ← ce document
```

Le sous-arbre documentaire legacy `docs/architecture/*.md` (non numéroté : `api.md`, `system-design.md`, etc.) est considéré obsolète et ne doit pas être utilisé comme référence — son contenu contredit `API_GUIDELINES.md` et `system-architecture.md` sur des points structurants (style REST, organisation des Skills).

---

## 3. Principes directeurs

```text
Resource-oriented before RPC-style
Business intent before generic CRUD
Explicit contract before implicit convention
Tenant safety before convenience
Server-side authority before client-side trust
Compatibility by default
Predictable errors over clever errors
Idempotent by design for retryable operations
Async for anything slow
Documentation as a build artifact, not an afterthought
```

Toute API doit exprimer une intention métier lisible dans son URL, son verbe et sa réponse — jamais un simple reflet de table SQL.

---

## 4. Style et architecture API

TenderOS expose des API **REST + JSON sur HTTPS**, organisées par ressources métier.

GraphQL n'est pas utilisé. Un endpoint générique de type `POST /ai/prompt` ou `POST /query` est interdit : toute capacité, y compris IA, est une opération métier typée avec un contrat propre.

L'API respecte les frontières définies par `ARCHITECTURE_RULES.md` : un controller appelle un seul use case, ne contient aucune règle métier, ne touche jamais Prisma. Ce document se concentre sur la forme du contrat HTTP lui-même ; la structure interne (controller → command/query → use case → repository) est définie dans `ARCHITECTURE_RULES.md` §19 et `MODULE_TEMPLATE.md` §40-46.

---

## 5. Routing et versioning

Toutes les routes métier sont préfixées par une version majeure explicite :

```text
/api/v1/...
```

Les endpoints techniques (health, liveness, readiness, métriques internes) ne sont pas versionnés :

```text
/health
/liveness
/readiness
```

Une nouvelle version majeure (`/api/v2`) n'est créée qu'en cas de changement incompatible. Est incompatible : la suppression d'un champ ; le changement de type ou de signification d'un champ existant ; l'ajout d'un champ requis à une requête existante ; la suppression d'un endpoint ; le changement du code HTTP nominal d'un endpoint existant.

N'est pas incompatible, et ne justifie donc pas de version majeure : l'ajout d'un champ optionnel en réponse ; l'ajout d'un endpoint ; l'ajout d'un code d'erreur ; l'ajout d'un filtre ou paramètre de tri optionnel.

Une version dépréciée doit annoncer sa fin de vie via headers :

```text
Deprecation: true
Sunset: 2027-01-01
Link: </api/v2/tenders>; rel="successor-version"
```

---

## 6. Convention de nommage des ressources

Les segments d'URL utilisent le `kebab-case`, au pluriel, en anglais, alignés avec l'Ubiquitous Language :

```text
/organizations
/organization-memberships
/tenders
/tender-workspaces
/proposals
/submission-packages
/go-no-go-decisions
/compliance-checklists
```

Interdits :

```text
/getTender
/create_workspace
/ProposalApproval
/tenderList
```

---

## 7. Action métier vs CRUD déguisé

Une action métier significative expose un endpoint explicite plutôt qu'un `PATCH` déguisant un changement de statut.

```text
Préférer :
POST /api/v1/tenders/{tenderId}/shortlist

Éviter :
PATCH /api/v1/tenders/{tenderId}
{ "status": "SHORTLISTED" }
```

Forme générale :

```text
POST /{resources}/{resourceId}/{action}
```

Lorsque l'action produit une donnée riche à conserver dans le temps (une décision, une approbation, une soumission), elle devient une sous-ressource historisée plutôt qu'un simple changement d'état :

```text
POST /api/v1/tenders/{tenderId}/go-no-go-decisions
POST /api/v1/proposals/{proposalId}/approvals
POST /api/v1/submission-packages/{submissionPackageId}/submissions
```

Ce pattern est cohérent avec le Domain Model : `GoNoGoDecision` et `Submission` sont des entités immuables et historisées (`bible/03-domain/domain-model.md`), pas des colonnes de statut réécrites en place.

---

## 8. Identifiants

Toutes les ressources exposent un identifiant UUID (v7 recommandé) opaque.

Un client ne doit jamais pouvoir déduire du seul identifiant : le tenant propriétaire ; le type de ressource ; la date de création ; un niveau de permission ; un ordre métier.

Les références métier lisibles (`Tender.reference`, ex. `AO-2026-001`) sont des attributs de la ressource, jamais un substitut de l'identifiant technique dans les routes.

---

## 9. Enveloppe de réponse — ressource unique

Une ressource unique est retournée **sans enveloppe générique** : l'objet est renvoyé directement.

```json
{
  "id": "7fbad99b-dcd7-4e92-96ca-4594984c1653",
  "title": "Construction d'un centre administratif",
  "reference": "AO-2026-001",
  "status": "DISCOVERED",
  "version": 1,
  "createdAt": "2026-07-25T14:00:00Z",
  "updatedAt": "2026-07-25T14:00:00Z"
}
```

Une enveloppe `{ "data": {...} }` n'apporte pas de valeur ici et n'est pas utilisée. Tout exemple antérieur du projet utilisant ce wrapper (voir `MODULE_TEMPLATE.md`, corrigé en conséquence) doit être aligné sur ce format.

---

## 10. Enveloppe de réponse — collections

Une collection utilise une enveloppe stable :

```json
{
  "items": [],
  "pageInfo": {
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

Une collection vide retourne `"items": []`, jamais `null`.

---

## 11. Pagination

La pagination par curseur est le mode par défaut pour toute collection potentiellement volumineuse :

```text
GET /api/v1/tenders?limit=25&cursor=eyJjcmVhdGVkQXQiOiIyMDI2LTA3LTI1In0
```

```json
{
  "items": [ /* ... */ ],
  "pageInfo": {
    "hasNextPage": true,
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA3LTI0In0"
  }
}
```

- `limit` par défaut : `25`. Maximum : `100`, sauf exception documentée (export, vue admin).
- Le curseur est **opaque** : encodé côté serveur, jamais construit ou interprété côté client.
- Le tri sous-jacent doit rester stable (voir `DATABASE_PATTERNS.md` §55) : typiquement `(organizationId, createdAt DESC, id DESC)`.

La pagination offset (`?page=2&pageSize=25`) est tolérée uniquement pour de petites listes stables à usage administratif, jamais pour une collection tenant-scoped de grande taille.

---

## 12. Tri et filtres

Tri :

```text
GET /api/v1/tenders?sort=-submissionDeadline,title
```

`-` préfixe un tri décroissant. Les champs de tri autorisés sont whitelistés explicitement par endpoint — un champ non whitelisté produit `VALIDATION_FAILED`, pas un tri ignoré silencieusement.

Filtres — paramètres répétés plutôt qu'une liste CSV :

```text
GET /api/v1/tenders?status=DISCOVERED&status=SHORTLISTED
```

```text
Éviter :
GET /api/v1/tenders?status=DISCOVERED,SHORTLISTED
```

---

## 13. Format d'erreur

Toute erreur utilise l'enveloppe suivante, sans exception :

```json
{
  "error": {
    "code": "INVALID_TENDER_STATUS_TRANSITION",
    "message": "The tender cannot be shortlisted from its current status.",
    "requestId": "req_01JABCDEF",
    "details": {
      "currentStatus": "ARCHIVED"
    }
  }
}
```

Règles :

- `code` en `UPPER_SNAKE_CASE`, stable dans le temps — un code déjà publié ne change jamais de signification ;
- `message` compréhensible mais non contractuel (peut évoluer sans casser un client bien écrit, qui doit se fier à `code`) ;
- `requestId` toujours présent, traçable dans les logs ;
- `details` minimal, utile au client, jamais de fuite technique.

Erreurs de validation — chaque champ en défaut est listé :

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request contains invalid fields.",
    "requestId": "req_01JABCDEF",
    "details": {
      "fields": [
        {
          "path": "title",
          "code": "TOO_SHORT",
          "message": "Title must contain at least 3 characters."
        }
      ]
    }
  }
}
```

Une erreur interne (`500`) ne doit jamais exposer : stack trace ; requête SQL ; nom de table ; chemin de fichier ; secret ; prompt interne.

---

## 14. Catalogue des codes d'erreur canoniques

Ce catalogue est un sous-ensemble illustratif ; le catalogue complet et versionné vit dans `packages/contracts` (voir §29). Il doit rester cohérent avec les `reasonCode` d'autorisation définis par `bible/03-domain/permissions.md` §31.

| Code | HTTP | Origine |
|---|---:|---|
| `VALIDATION_FAILED` | 422 | Frontière API — schéma respecté mais règle de validation violée |
| `AUTHENTICATION_REQUIRED` | 401 | Absence ou expiration d'identité |
| `ORGANIZATION_ACCESS_DENIED` | 403 | Acteur sans membership sur l'organisation ciblée |
| `PERMISSION_MISSING` | 403 | Permission `resource:action` non accordée par le rôle |
| `WORKSPACE_ACCESS_DENIED` | 403 | Acteur membre de l'organisation mais sans accès au Workspace |
| `RESOURCE_CONFIDENTIAL` | 403 | Ressource au-delà du niveau de confidentialité de l'acteur |
| `TENDER_NOT_FOUND` | 404 | Ressource introuvable ou hors tenant (anti-énumération, §17) |
| `INVALID_TENDER_STATUS_TRANSITION` | 409 | Transition refusée par les Business Rules du Tender |
| `INVALID_RESOURCE_STATUS` | 409 | Forme générique de conflit d'état métier |
| `PROPOSAL_HAS_BLOCKING_COMMENTS` | 409 | Précondition métier non satisfaite (Proposal) |
| `BLOCKING_ISSUES_PRESENT` | 409 | Précondition de checklist/compliance non satisfaite |
| `CONCURRENT_MODIFICATION` | 409 | Conflit de version optimiste (§20) |
| `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` | 409 | Rejeu d'une `Idempotency-Key` avec un payload différent |
| `DOCUMENT_PROCESSING_FAILED` | 422 | Échec d'un traitement asynchrone documentaire |
| `DEADLINE_EXPIRED` | 409 | Action tentée après une échéance métier bloquante |
| `SEPARATION_OF_DUTIES_REQUIRED` | 403 | Règle de séparation des rôles violée (ex. auto-approbation) |
| `ORGANIZATION_STORAGE_QUOTA_EXCEEDED` | 422 | Quota de stockage dépassé |
| `AI_USAGE_QUOTA_EXCEEDED` | 429 | Quota d'usage IA dépassé |
| `RATE_LIMIT_EXCEEDED` | 429 | Limite de débit dépassée |

Un code d'erreur n'est jamais inventé au fil de l'implémentation d'un endpoint : il est ajouté au catalogue partagé avant utilisation, avec sa signification et son code HTTP figés.

---

## 15. Codes HTTP

| Code | Usage |
|---:|---|
| 200 | Lecture ou modification réussie avec contenu |
| 201 | Création réussie (avec header `Location`) |
| 202 | Traitement asynchrone accepté |
| 204 | Succès sans contenu (ex. archivage) |
| 400 | Requête structurellement malformée (JSON invalide, type incorrect) |
| 401 | Non authentifié |
| 403 | Authentifié mais non autorisé |
| 404 | Introuvable, ou existant mais non visible pour ce tenant/acteur |
| 409 | Conflit métier ou conflit de concurrence |
| 412 | Précondition (`If-Match`) non satisfaite |
| 413 | Payload trop volumineux |
| 415 | Content-Type non supporté |
| 422 | Structure valide, règle de validation ou précondition métier violée |
| 429 | Rate limit ou quota dépassé |
| 500 | Erreur interne |
| 502/503/504 | Dépendance externe indisponible, timeout, ou service en dégradation |

Distinction clé : `400` = la requête ne peut pas être interprétée ; `422` = la requête est comprise mais invalide sémantiquement ; `409` = la requête est valide mais incompatible avec l'état actuel de la ressource ou d'une autre requête concurrente.

---

## 16. Authentification

Toute route métier exige :

```text
Authorization: Bearer {accessToken}
```

Un token expiré, révoqué, ou absent produit `401 AUTHENTICATION_REQUIRED`.

L'authentification ne détermine que l'identité de l'acteur. Elle ne préjuge d'aucune autorisation — voir §17.

---

## 17. Autorisation — chaîne de vérification

Chaque endpoint applique, dans cet ordre, la chaîne définie par `permissions.md` et `system-architecture.md` §15 :

```text
Authenticated identity
→ Organization membership
→ Role permissions
→ Workspace access
→ Resource policy
→ Business state
```

Cette chaîne est exécutée dans le use case (ou une policy qu'il appelle), jamais uniquement dans un guard de route ou côté frontend — voir `ARCHITECTURE_RULES.md` §19.3.

Anti-énumération : lorsque révéler `403` distinguerait "la ressource existe mais n'est pas accessible" de "la ressource n'existe pas", et que cette distinction constitue une fuite d'information inter-tenant, l'API répond `404` plutôt que `403`.

```text
Ressource d'un autre tenant       → 404 TENDER_NOT_FOUND
Ressource du tenant, sans droit   → 403 PERMISSION_MISSING
```

---

## 18. Multi-tenant au niveau API

`organizationId` est systématiquement revérifié côté serveur ; il n'est jamais déduit du seul identifiant de ressource dans l'URL.

Un header `X-Organization-Id` peut accompagner la requête à titre indicatif (sélection du tenant actif côté client), mais ne constitue jamais une preuve d'autorisation — le serveur retrouve l'appartenance réelle via la session/le token et la membership, conformément à `ARCHITECTURE_RULES.md` §28 et `DATABASE_PATTERNS.md` §14-15.

`Workspace` est un périmètre d'accès **additionnel** à l'intérieur d'un tenant, pas une seconde frontière de tenant : un acteur membre de l'organisation n'a pas nécessairement accès à tous ses Workspaces (`permissions.md` PERM-005). Un endpoint scoped à un Workspace vérifie donc successivement l'appartenance à l'organisation *et* l'accès au Workspace.

---

## 19. Idempotence

Toute opération rejouable côté client accepte un header :

```text
Idempotency-Key: 3f29b1d2-8f0a-4e9a-9c7e-6a1f9d2b7c31
```

Concerné notamment : création de Workspace ; génération d'un package de soumission ; import d'un Tender ; déclenchement d'une analyse IA ; enregistrement d'une soumission.

La clé est scoped par organisation, acteur, endpoint, et une fenêtre de rétention définie. Rejouer la même clé avec un payload strictement identique retourne le résultat déjà produit. Rejouer la même clé avec un payload différent produit :

```json
{
  "error": {
    "code": "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
    "message": "This idempotency key was already used with a different request payload."
  }
}
```

Voir `DATABASE_PATTERNS.md` §41 et `MODULE_TEMPLATE.md` §35 pour l'implémentation.

---

## 20. Concurrence optimiste

Les ressources sensibles exposent un champ `version` (entier, défaut `1` à la création — voir `DATABASE_DESIGN.md` §8.3).

Le client transmet la version attendue via `If-Match` ou un champ contractuel :

```text
If-Match: "1"
```

```json
{
  "expectedVersion": 1
}
```

En cas de conflit :

```json
{
  "error": {
    "code": "CONCURRENT_MODIFICATION",
    "message": "The resource was modified by another request.",
    "details": {
      "expectedVersion": 1,
      "currentVersion": 2
    }
  }
}
```

`412 Precondition Failed` est utilisé lorsque `If-Match` est employé comme précondition HTTP stricte ; `409 CONCURRENT_MODIFICATION` est utilisé lorsque `expectedVersion` est un champ métier du body. Les deux mécanismes ne doivent pas être mélangés sur un même endpoint.

`ETag` / `If-None-Match` peuvent être utilisés séparément pour les lectures coûteuses (`304 Not Modified`) — c'est un mécanisme de cache HTTP, distinct du versionnement métier.

---

## 21. Sérialisation

**Casing** — propriétés JSON en `camelCase` (`organizationId`, `submissionDeadline`) ; valeurs d'énumération en `UPPER_SNAKE_CASE` (`SHORTLISTED`, `IN_PROGRESS`).

**Dates** — ISO 8601 en UTC :

```json
{ "createdAt": "2026-07-25T14:00:00Z" }
```

Une date sans heure :

```json
{ "expiresOn": "2026-10-15" }
```

Une échéance officielle conserve en plus son fuseau d'origine :

```json
{
  "officialDeadline": "2026-10-15T15:00:00Z",
  "officialTimezone": "Europe/Paris"
}
```

**Montants** — toujours sérialisés en chaîne, avec devise explicite, jamais en nombre flottant :

```json
{
  "amount": "150000.0000",
  "currency": "EUR"
}
```

**Booléens** — noms explicites et positifs (`isManual`, `hasBlockingIssues`), jamais de double négation (`isNotDisabled`).

**Champs absents vs `null`** — un champ structurellement non applicable est omis ; un champ applicable mais sans valeur est `null` explicite. La convention par endpoint doit être documentée dans l'OpenAPI (§29) et rester stable.

---

## 22. Validation d'entrée

Toute frontière (path params, query params, body, headers applicatifs) est validée par un schéma explicite avant d'atteindre le use case, conformément à `ARCHITECTURE_RULES.md` §15 et `MODULE_TEMPLATE.md` §40.

```typescript
export const ShortlistTenderBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();
```

- `.strict()` : un champ non déclaré est rejeté (`VALIDATION_FAILED`), jamais silencieusement ignoré.
- Path params et query params sont validés séparément du body.
- Une violation de schéma produit `422 VALIDATION_FAILED` avec `details.fields[]` (§13) ; un JSON syntaxiquement invalide produit `400`.

---

## 23. Opérations asynchrones

Une opération dont le traitement dépasse un budget de latence interactif (traitement documentaire, analyse IA, génération de package) est acceptée immédiatement et exécutée en tâche de fond.

```text
POST /api/v1/workspaces/{workspaceId}/dce-analyses
→ 202 Accepted

{
  "operationId": "op_01JABCDEF",
  "status": "QUEUED",
  "statusUrl": "/api/v1/operations/op_01JABCDEF"
}
```

Suivi :

```text
GET /api/v1/operations/{operationId}
```

```json
{
  "id": "op_01JABCDEF",
  "status": "RUNNING",
  "progress": {
    "currentStep": "EXTRACTING_REQUIREMENTS",
    "completedUnits": 4,
    "totalUnits": 10
  },
  "createdAt": "2026-07-25T14:00:00Z",
  "updatedAt": "2026-07-25T14:00:05Z"
}
```

Statuts possibles : `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`.

Annulation, best-effort :

```text
POST /api/v1/operations/{operationId}/cancel
```

L'implémentation backend (worker, Outbox, idempotence) suit `DATABASE_PATTERNS.md` §24, §38-41 et `MODULE_TEMPLATE.md` §47-48.

---

## 24. Upload et téléchargement de fichiers

Flux d'upload en huit étapes, conforme à `API_GUIDELINES.md` §48 et `DATABASE_PATTERNS.md` §61-64 :

```text
1. Request upload
2. Validate permission and quota
3. Register temporary upload session
4. Issue short-lived signed URL
5. Client uploads directly to storage
6. Client confirms completion
7. Server verifies checksum
8. Server queues async processing
```

```text
POST /api/v1/workspaces/{workspaceId}/document-uploads
```

```json
{
  "uploadId": "upl_01JABCDEF",
  "uploadUrl": "https://storage.example/signed...",
  "expiresAt": "2026-07-25T14:15:00Z",
  "requiredHeaders": {
    "Content-Type": "application/pdf"
  }
}
```

Finalisation, idempotente :

```text
POST /api/v1/document-uploads/{uploadId}/complete
```

Téléchargement :

```text
GET /api/v1/documents/{documentId}/versions/{versionId}/download
```

retourne une URL signée de courte durée. Elle n'est jamais loggée ni persistée durablement (`SECURITY_PATTERNS.md`, `DATABASE_PATTERNS.md` §62 pour le checksum).

---

## 25. Webhooks entrants

Un webhook entrant : vérifie la signature du fournisseur ; vérifie un timestamp anti-replay ; répond rapidement (`2xx`) puis traite en asynchrone ; est idempotent sur l'identifiant de livraison du fournisseur ; résout le tenant de façon sûre (jamais uniquement depuis un champ non signé du payload) ; est audité.

---

## 26. Webhooks sortants

Un événement TenderOS notifié à un système externe utilise l'enveloppe :

```json
{
  "id": "evt_01JABCDEF",
  "type": "tender.shortlisted",
  "version": 1,
  "occurredAt": "2026-07-25T14:00:00Z",
  "data": {
    "tenderId": "7fbad99b-dcd7-4e92-96ca-4594984c1653",
    "organizationId": "..."
  }
}
```

La livraison est signée, versionnée, retentée avec backoff exponentiel borné, et alimente une Dead Letter en cas d'échec définitif — voir `DATABASE_PATTERNS.md` §38-40 et `ARCHITECTURE_RULES.md` §23-24 pour le pattern Outbox sous-jacent.

Il n'existe pas aujourd'hui de catalogue central versionné des événements métier (`DOMAIN_EVENTS.md` / `bible/03-domain/events.md` sont vides) : les noms d'événements référencés dans ce document (`tender.shortlisted`, etc.) sont illustratifs et alignés sur le vocabulaire de `bible/03-domain/workflow.md`. La création de ce catalogue est un chantier documentaire distinct, hors périmètre de ce document.

---

## 27. Rate limiting et quotas

Rate limiting générique :

```text
RateLimit-Limit: 100
RateLimit-Remaining: 42
RateLimit-Reset: 1753452000
Retry-After: 30
```

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests."
  }
}
```

Les quotas métier (stockage, usage IA, membres) produisent des codes dédiés plutôt que le code générique de rate limiting :

```text
ORGANIZATION_STORAGE_QUOTA_EXCEEDED
AI_USAGE_QUOTA_EXCEEDED
```

---

## 28. Corrélation, traçabilité et sécurité transport

Chaque requête propage `X-Request-Id` (généré si absent), présent dans les logs, les erreurs et les traces. Un `correlationId` distinct identifie un workflow métier étalé sur plusieurs requêtes, jobs ou services (voir `DATABASE_PATTERNS.md` §97).

CORS est restrictif par domaine autorisé ; `Access-Control-Allow-Origin: *` est interdit sur toute route authentifiée. Les headers de sécurité standards (`Content-Security-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security`) sont appliqués globalement — détail dans `SECURITY_PATTERNS.md`.

---

## 29. Documentation OpenAPI et contrats partagés

Chaque endpoint est documenté en OpenAPI avec : résumé métier ; permission requise ; schéma de requête ; schéma de réponse ; erreurs possibles ; comportement asynchrone le cas échéant ; support de l'idempotence le cas échéant ; statut de dépréciation le cas échéant.

La génération OpenAPI est validée en CI (`ENGINEERING_STANDARDS.md`, `DEPLOYMENT_PATTERNS.md` à venir) : un endpoint non documenté ou une divergence entre le schéma Zod et la documentation bloque la livraison.

Les contrats (schémas Zod, DTO, catalogue de codes d'erreur, forme de pagination, contrats d'événements) vivent dans un package partagé, typiquement `packages/contracts`, consommé par le backend et le frontend. Aucun modèle Prisma n'y est jamais exposé (`ARCHITECTURE_RULES.md` §7, §17.2).

---

## 30. Compatibilité et dépréciation

Un changement compatible peut être livré sans nouvelle version majeure : champ optionnel ajouté ; nouvel endpoint ; nouveau code d'erreur ; nouveau filtre optionnel.

Un changement incompatible impose soit une nouvelle version majeure, soit — si le volume de consommateurs le permet et que c'est explicitement décidé — un changement direct accompagné d'une communication et d'une fenêtre de compatibilité. Cette dernière option reste une décision de niveau 3 au sens de l'Engineering Governor.

Un endpoint déprécié continue de fonctionner jusqu'à la date de `Sunset` annoncée ; il n'est jamais retiré silencieusement.

---

## 31. Pattern — Controller NestJS

Le controller reste fin : authentifier, parser, valider, construire la Command/Query, appeler un seul use case, présenter le résultat. Détail des règles dans `ARCHITECTURE_RULES.md` §19.2 et `MODULE_TEMPLATE.md` §41-42 ; ce pattern en est l'application au contrat HTTP défini par ce document (enveloppe nue, codes canoniques).

```typescript
@Controller("/api/v1/tenders")
export class TenderCommandController {
  constructor(
    private readonly shortlistTender: ShortlistTenderUseCase,
  ) {}

  @Post(":tenderId/shortlist")
  async shortlist(
    @AuthenticatedActor() actor: HttpActorContext,
    @Param("tenderId", UuidPipe) tenderId: string,
    @Body(ShortlistTenderBodyPipe) body: ShortlistTenderBody,
    @Headers("if-match") ifMatch: string | undefined,
    @RequestContext() requestContext: HttpRequestContext,
  ): Promise<TenderResponse> {
    const result = await this.shortlistTender.execute({
      organizationId: actor.organizationId,
      actorId: actor.actorId,
      tenderId,
      reason: body.reason,
      expectedVersion: parseIfMatch(ifMatch),
      requestId: requestContext.requestId,
      correlationId: requestContext.correlationId,
    });

    return TenderPresenter.present(result);
  }
}
```

---

## 32. Pattern — Presenter (enveloppe nue)

```typescript
export class TenderPresenter {
  static present(tender: TenderResult): TenderResponse {
    return {
      id: tender.tenderId,
      title: tender.title,
      reference: tender.reference,
      status: tender.status,
      version: tender.version,
      officialDeadline: tender.officialDeadline ?? undefined,
      officialTimezone: tender.officialTimezone ?? undefined,
      createdAt: tender.createdAt,
      updatedAt: tender.updatedAt,
    };
  }
}
```

Le Presenter retourne l'objet directement — aucun wrapper `data` (§9). Il applique la sérialisation définie au §21 (dates, montants, casing) et n'expose que les champs autorisés par le contrat public.

---

## 33. Pattern — mapping des erreurs applicatives vers HTTP

```typescript
export function mapDomainErrorToHttp(
  error: DomainError | ApplicationError,
): ApiErrorResponse {
  switch (error.code) {
    case "TENDER_NOT_FOUND":
      return apiError(404, error.code, error.message);
    case "PERMISSION_MISSING":
      return apiError(403, error.code, error.message);
    case "ORGANIZATION_ACCESS_DENIED":
    case "WORKSPACE_ACCESS_DENIED":
      return apiError(403, error.code, error.message);
    case "INVALID_TENDER_STATUS_TRANSITION":
    case "INVALID_RESOURCE_STATUS":
    case "BLOCKING_ISSUES_PRESENT":
      return apiError(409, error.code, error.message);
    case "CONCURRENT_MODIFICATION":
      return apiError(409, error.code, error.message, {
        expectedVersion: error.details.expectedVersion,
        currentVersion: error.details.currentVersion,
      });
    case "VALIDATION_FAILED":
      return apiError(422, error.code, error.message, {
        fields: error.details.fields,
      });
    default:
      return apiError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
  }
}
```

Ce mapping est centralisé (typiquement un `ExceptionFilter` NestJS dans l'Infrastructure/Interfaces), jamais dupliqué controller par controller. Le Domain ne connaît aucun de ces codes HTTP — voir `ARCHITECTURE_RULES.md` §30.

---

## 34. Pattern — endpoint d'action métier

```text
POST /api/v1/tenders/{tenderId}/shortlist   → 200, ressource nue mise à jour
POST /api/v1/tender-workspaces/{workspaceId}/archive → 204
```

Une action sans corps de requête significatif n'exige pas de body ; une action avec justification ou paramètres optionnels accepte un body validé (§22).

---

## 35. Pattern — sous-ressource historisée

Exemple aligné sur le Domain Model réel : `GoNoGoDecision` est une entité immuable liée au Tender, avec correction par `supersedes_decision_id` plutôt que par update en place (`bible/03-domain/domain-model.md`).

```text
POST /api/v1/tenders/{tenderId}/go-no-go-decisions
```

```json
{
  "decision": "GO",
  "rationale": "Projet aligné avec notre expertise et capacité de réponse."
}
```

Réponse `201`, header `Location: /api/v1/tenders/{tenderId}/go-no-go-decisions/{decisionId}` :

```json
{
  "id": "gnd_01JABCDEF",
  "tenderId": "7fbad99b-dcd7-4e92-96ca-4594984c1653",
  "decision": "GO",
  "rationale": "Projet aligné avec notre expertise et capacité de réponse.",
  "decidedBy": "usr_...",
  "createdAt": "2026-07-25T14:00:00Z"
}
```

Une correction d'une décision existante crée un nouvel enregistrement référençant `supersedesDecisionId`, jamais un `PATCH` de la décision précédente.

---

## 36. Pattern — collection paginée

```text
GET /api/v1/tenders?status=SHORTLISTED&sort=-createdAt&limit=25
```

```json
{
  "items": [
    {
      "id": "7fbad99b-dcd7-4e92-96ca-4594984c1653",
      "title": "Construction d'un centre administratif",
      "reference": "AO-2026-001",
      "status": "SHORTLISTED",
      "createdAt": "2026-07-25T14:00:00Z"
    }
  ],
  "pageInfo": {
    "hasNextPage": true,
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA3LTI0In0"
  }
}
```

Un item de liste expose un sous-ensemble stable de champs (`TenderListItem`), distinct du contrat de détail (`TenderDetails`) — voir `MODULE_TEMPLATE.md` §33 pour le pattern de Query dédiée.

---

## 37. Exemple complet — Shortlist d'un Tender (aligné Domain Model)

### 37.1 Contexte métier

Transition Domain réelle (`bible/03-domain/business-rules.md` §7) :

```text
DISCOVERED → SHORTLISTED
```

Permission requise (`bible/03-domain/permissions.md`) : `tender:shortlist`

### 37.2 Requête

```text
POST /api/v1/tenders/7fbad99b-dcd7-4e92-96ca-4594984c1653/shortlist
Authorization: Bearer ...
Content-Type: application/json
```

```json
{
  "reason": "Correspond à notre expertise en bâtiments publics."
}
```

### 37.3 Réponse — succès

```text
200 OK
```

```json
{
  "id": "7fbad99b-dcd7-4e92-96ca-4594984c1653",
  "title": "Construction d'un centre administratif",
  "reference": "AO-2026-001",
  "status": "SHORTLISTED",
  "version": 2,
  "createdAt": "2026-07-20T09:00:00Z",
  "updatedAt": "2026-07-25T14:00:00Z"
}
```

### 37.4 Réponse — transition refusée

```text
409 Conflict
```

```json
{
  "error": {
    "code": "INVALID_TENDER_STATUS_TRANSITION",
    "message": "The tender cannot be shortlisted from its current status.",
    "requestId": "req_01JABCDEF",
    "details": {
      "currentStatus": "ARCHIVED"
    }
  }
}
```

### 37.5 Réponse — permission manquante

```text
403 Forbidden
```

```json
{
  "error": {
    "code": "PERMISSION_MISSING",
    "message": "You do not have the tender:shortlist permission.",
    "requestId": "req_01JABCDEF"
  }
}
```

### 37.6 Réponse — autre tenant

```text
404 Not Found
```

```json
{
  "error": {
    "code": "TENDER_NOT_FOUND",
    "message": "Tender not found.",
    "requestId": "req_01JABCDEF"
  }
}
```

---

## 38. Tests d'API

Les tests de contrat et E2E couvrent, pour chaque endpoint : authentification ; validation ; permission (`PERMISSION_MISSING`) ; tenant (`404` anti-énumération) ; Workspace (`WORKSPACE_ACCESS_DENIED` le cas échéant) ; cas nominal ; transition métier refusée ; conflit de concurrence ; idempotence si applicable ; forme exacte de la réponse (enveloppe, casing, sérialisation).

Le détail de la stratégie et des priorités de test est défini dans `TESTING_PATTERNS.md` (à venir) et `MODULE_TEMPLATE.md` §56.

---

## 39. Anti-patterns interdits

```text
Enveloppe data générique injustifiée sur une ressource unique
Endpoint générique POST /ai/prompt ou POST /query
PATCH déguisant un changement de statut métier
Code d'erreur inventé hors du catalogue partagé
Statut HTTP 200 pour une erreur métier
Statut HTTP 500 pour une erreur de validation ou de permission
Pagination offset non bornée sur une collection tenant-scoped volumineuse
Curseur de pagination construit ou interprété côté client
Identifiant de ressource révélant le tenant, le type ou l'ordre de création
Retour d'un modèle Prisma comme réponse API
Permission vérifiée uniquement côté frontend
Header X-Organization-Id utilisé comme preuve d'autorisation
Montant sérialisé en nombre flottant
Date sans fuseau explicite pour une échéance officielle
Traitement long exécuté de façon synchrone dans la requête HTTP
Upload de fichier transitant par le serveur applicatif plutôt qu'une URL signée
Webhook sortant non signé ou non versionné
403 utilisé là où une fuite d'existence inter-tenant impose un 404
Documentation OpenAPI absente ou non alignée avec le schéma réel
```

---

## 40. Conditions bloquantes

La livraison d'un endpoint doit être bloquée lorsque : la permission requise n'est pas définie dans `permissions.md` ; le tenant scope n'est pas explicite ; un code d'erreur utilisé n'existe pas dans le catalogue partagé ; une transition métier n'est pas définie dans `business-rules.md` ; un contrat rompt la compatibilité sans stratégie de version ; une opération longue est exposée de façon synchrone sans justification ; l'OpenAPI n'est pas généré ou diverge du schéma ; un test de tenant isolation ou de permission manque.

---

## 41. Definition of Ready

La conception d'un endpoint est prête lorsque : l'intention métier est identifiée ; la ressource et l'action sont nommées conformément aux conventions ; la permission requise est connue ; le tenant scope est explicite ; les transitions ou préconditions métier sont connues ; les codes d'erreur nécessaires existent ou sont proposés au catalogue ; la nécessité d'un traitement asynchrone est tranchée ; la stratégie d'idempotence et de concurrence est définie si pertinente.

---

## 42. Definition of Done

Un endpoint est terminé lorsque :

```text
Contract matches API_GUIDELINES.md conventions
+
Controller stays thin and calls a single use case
+
Input validated at the boundary
+
Permission enforced server-side
+
Tenant isolation verified by test
+
Errors use canonical codes and correct HTTP status
+
Response envelope and serialization match this document
+
Pagination, sorting and filtering implemented where applicable
+
Idempotency and concurrency handled where applicable
+
OpenAPI documented and validated in CI
+
Contract, permission, tenant and negative tests pass
```

---

## 43. Checklist de conception d'un endpoint

**Intention**

- [ ] L'intention métier est explicite dans l'URL et le verbe.
- [ ] L'action n'est pas un `PATCH` de statut déguisé.
- [ ] La ressource utilise le vocabulaire de l'Ubiquitous Language.

**Contrat**

- [ ] Version API correcte (`/api/v1`).
- [ ] Enveloppe nue pour une ressource unique.
- [ ] Enveloppe `{ items, pageInfo }` pour une collection.
- [ ] Casing camelCase / enums UPPER_SNAKE_CASE respecté.
- [ ] Dates ISO 8601 UTC, `officialTimezone` si échéance officielle.
- [ ] Montants sérialisés en chaîne avec devise.

**Sécurité**

- [ ] Authentification requise et vérifiée.
- [ ] Chaîne d'autorisation complète appliquée côté serveur.
- [ ] Tenant scope explicite et revérifié.
- [ ] Workspace scope vérifié si applicable.
- [ ] Anti-énumération appliquée (404 vs 403) si pertinent.

**Robustesse**

- [ ] Idempotence définie si l'opération est rejouable.
- [ ] Concurrence optimiste définie si la ressource est sensible.
- [ ] Pagination par curseur si collection volumineuse.
- [ ] Traitement asynchrone si opération longue.

**Erreurs**

- [ ] Tous les codes d'erreur utilisés existent dans le catalogue partagé.
- [ ] Codes HTTP conformes à la table du §15.
- [ ] Aucune fuite technique dans les messages d'erreur.

**Documentation et tests**

- [ ] OpenAPI généré et validé en CI.
- [ ] Test du cas nominal.
- [ ] Test de validation.
- [ ] Test de permission refusée.
- [ ] Test tenant isolation.
- [ ] Test de conflit métier ou de concurrence si applicable.

---

## 44. Critères d'acceptation

Ce document est correctement appliqué lorsque :

- chaque endpoint respecte les conventions de `API_GUIDELINES.md` sans réinterprétation locale ;
- les réponses de ressource unique sont nues, les collections utilisent `{ items, pageInfo }` ;
- les erreurs utilisent l'enveloppe et les codes du catalogue partagé, jamais un code inventé localement ;
- l'autorisation est vérifiée côté serveur selon la chaîne complète, jamais côté frontend seul ;
- le tenant est explicite et revérifié à chaque couche, sans exception ;
- les opérations rejouables sont idempotentes, les ressources sensibles protégées par version ;
- les traitements longs sont exposés en asynchrone avec suivi d'opération ;
- les exemples illustrant ce document restent cohérents avec le Domain Model réel (`bible/03-domain/domain-model.md`, `business-rules.md`) et non un exemple générique inventé ;
- l'OpenAPI est généré, documenté et validé en CI ;
- les tests de contrat couvrent nominal, validation, permission, tenant et conflit.
