# TenderOS — API Guidelines

Version : 1.0
Statut : Draft
Propriétaires : Engineering Governor, Platform & Security

---

## 1. Objectif

Ce document définit les règles de conception, d'implémentation et d'évolution des API de TenderOS.

Il s'applique à : l'API HTTP utilisée par l'application web ; les futures API publiques ; les intégrations partenaires ; les webhooks ; les contrats entre l'API et les workers ; les endpoints techniques ; les exports et téléchargements sécurisés.

Les objectifs sont : exprimer clairement les intentions métier ; garantir une interface cohérente ; protéger l'isolation multi-tenant ; maintenir la compatibilité ; permettre une évolution contrôlée ; faciliter les intégrations ; rendre les erreurs compréhensibles ; assurer la traçabilité.

---

## 2. Principes fondamentaux

```text
Business intent over generic CRUD
Server-side authorization
Tenant scope is explicit
Stable contracts
Predictable errors
Backward compatibility by default
Idempotency for retryable operations
Asynchronous processing for long-running work
No direct exposure of persistence models
Secure defaults
```

Une API n'est pas une simple représentation des tables PostgreSQL. Elle représente les capacités métier offertes par TenderOS.

---

## 3. Architecture API initiale

```text
REST
JSON
HTTPS
Versioned endpoints
OpenAPI documentation
```

Chemin de base : `/api/v1`

```text
GET  /api/v1/tenders
POST /api/v1/tenders
GET  /api/v1/tenders/{tenderId}
```

Les endpoints techniques peuvent utiliser un espace distinct : `/health`, `/liveness`, `/readiness`

---

## 4. REST et intention métier

Les lectures simples peuvent suivre une organisation REST classique.

```text
GET /api/v1/tenders
GET /api/v1/tenders/{tenderId}
GET /api/v1/workspaces/{workspaceId}/tasks
```

Les actions métier importantes doivent utiliser des endpoints explicites.

```text
# Préférer
POST /api/v1/tenders/{tenderId}/shortlist
POST /api/v1/tenders/{tenderId}/go-no-go-decisions
POST /api/v1/proposals/{proposalId}/approve
POST /api/v1/workspaces/{workspaceId}/submission-packages
```

```http
# Éviter
PATCH /api/v1/tenders/{tenderId}
{ "status": "SHORTLISTED" }
```

Le changement de statut doit exprimer l'intention et appliquer les invariants correspondants.

---

## 5. Versionnement

Les API publiques sont versionnées dans l'URL : `/api/v1`

Une nouvelle version majeure est nécessaire lorsque le changement est incompatible.

**Changements incompatibles** — suppression d'un champ ; changement de signification d'un champ ; changement de type ; modification d'une structure de réponse ; remplacement d'un code d'erreur ; modification du comportement d'un endpoint ; ajout d'un champ obligatoire dans une requête existante.

**Changements compatibles** — ajout d'un champ optionnel ; ajout d'un endpoint ; ajout d'une nouvelle valeur d'état lorsque les clients sont conçus pour la tolérer ; ajout de métadonnées facultatives.

---

## 6. Politique de compatibilité

TenderOS applique une compatibilité ascendante par défaut.

Avant de modifier un contrat existant, Claude doit vérifier : les usages frontend ; les intégrations ; les tests de contrat ; la documentation OpenAPI ; les événements liés ; les éventuels clients externes.

Une rupture de compatibilité exige : une justification ; une stratégie de migration ; une période de dépréciation lorsque possible ; un ADR si l'impact est structurant ; une validation explicite si l'API est publique.

---

## 7. Dépréciation

Un endpoint ou un champ déprécié doit être : marqué comme déprécié dans OpenAPI ; accompagné d'une alternative ; observable dans les logs ; maintenu pendant une période définie ; supprimé uniquement dans une version majeure ou selon une procédure validée.

```http
Deprecation: true
Sunset: Wed, 31 Dec 2027 23:59:59 GMT
Link: </api/v2/...>; rel="successor-version"
```

Aucune date de suppression ne doit être annoncée sans plan de migration réaliste.

---

## 8. Nommage des ressources

Les chemins utilisent : lowercase, kebab-case si plusieurs mots, noms au pluriel.

```text
/organizations
/organization-memberships
/submission-packages
/go-no-go-decisions
```

Éviter : `/getTender`, `/create_workspace`, `/ProposalApproval`

---

## 9. Identifiants

Les identifiants sont transmis sous forme de chaînes UUID.

```text
0195f250-9e4d-7d52-9152-d75092fa37aa
```

Les identifiants doivent être opaques pour les clients. Un client ne doit jamais déduire : le tenant ; le type de ressource ; la date de création ; une permission ; un ordre métier.

---

## 10. Tenant scope

Toute requête tenant-scoped doit être exécutée dans le contexte d'une organisation.

Le contexte peut provenir : du token d'accès ; de la session ; d'un header validé ; du chemin lorsque l'API publique le requiert.

Recommandation pour l'application interne :

```http
X-Organization-Id: {organizationId}
```

Ce header ne constitue jamais une preuve d'autorisation. Le serveur doit vérifier que l'acteur appartient à l'organisation demandée.

---

## 11. Organisation dans les chemins

Éviter de répéter systématiquement l'organisation dans tous les chemins internes lorsque le contexte tenant est déjà établi.

```http
# Acceptable
GET /api/v1/tenders
X-Organization-Id: ...
```

Pour une API externe ou administrative, un chemin explicite peut être préférable :

```text
GET /api/v1/organizations/{organizationId}/tenders
```

Le choix doit rester cohérent à l'intérieur d'une même surface API.

---

## 12. Authentification

Toutes les API métier sont authentifiées sauf indication contraire.

```http
Authorization: Bearer {accessToken}
```

Le token doit permettre d'identifier au minimum : l'identité ; la session ; les informations nécessaires à la validation ; éventuellement le fournisseur d'identité.

Les permissions métier ne doivent pas être entièrement encodées dans un token longue durée. Elles doivent être vérifiées côté serveur.

---

## 13. Autorisation

Chaque endpoint doit vérifier :

```text
Authenticated identity
→ Organization membership
→ Role permissions
→ Workspace access
→ Resource policy
→ Business state
```

Les contrôleurs ne doivent pas contenir toute la logique d'autorisation. Ils appellent un use case ou une policy dédiée.

```typescript
authorizationService.assertCan({
  actor,
  permission: "proposal:approve",
  resource: proposal,
});
```

---

## 14. Protection contre l'énumération

Pour une ressource inexistante ou inaccessible, TenderOS peut retourner la même réponse afin de ne pas révéler son existence.

```text
404 NOT_FOUND
```

plutôt que `403 FORBIDDEN` lorsque la distinction permettrait de découvrir des ressources appartenant à une autre organisation.

Cette règle dépend du contexte et doit être appliquée de manière cohérente.

---

## 15. Content types

```http
Content-Type: application/json
Accept: application/json
```

Encodage : `UTF-8`

Pour les fichiers : `multipart/form-data`, ou upload direct vers l'Object Storage à l'aide d'une URL signée.

Les téléchargements utilisent le MIME type réel du fichier.

---

## 16. Structure des réponses

Une ressource unique peut être retournée directement.

```json
{
  "id": "0195f250-9e4d-7d52-9152-d75092fa37aa",
  "title": "Maintenance des infrastructures",
  "status": "SHORTLISTED",
  "submissionDeadline": "2027-02-15T11:00:00Z"
}
```

Les collections utilisent une enveloppe stable.

```json
{
  "items": [],
  "pageInfo": {
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

Une enveloppe générique `data` n'est pas obligatoire si elle n'apporte pas de valeur.

---

## 17. Convention de nommage JSON

Les propriétés JSON utilisent `camelCase` : `organizationId`, `submissionDeadline`, `createdAt`, `blockingIssueCount`

Les valeurs d'état utilisent `UPPER_SNAKE_CASE` : `IN_PROGRESS`, `READY_FOR_SUBMISSION`, `NO_GO`

---

## 18. Dates

Toutes les dates avec heure sont retournées en ISO 8601 UTC : `2027-02-15T11:00:00Z`

Les dates sans heure utilisent `YYYY-MM-DD` : `2027-02-15`

Pour une échéance officielle, l'API peut également fournir :

```json
{
  "submissionDeadline": "2027-02-15T11:00:00Z",
  "officialTimezone": "Europe/Paris"
}
```

---

## 19. Montants monétaires

Un montant doit inclure sa devise.

```json
{
  "amount": "150000.0000",
  "currency": "EUR"
}
```

Les montants monétaires sont sérialisés sous forme de chaîne afin d'éviter les erreurs de précision JavaScript.

```json
// Éviter pour les montants contractuels ou financiers
{ "amount": 150000.0000 }
```

---

## 20. Valeurs nulles

Convention : un champ absent signifie qu'il n'est pas inclus dans cette représentation ; `null` signifie que la valeur est explicitement absente ou inconnue ; une chaîne vide ne doit pas remplacer `null`.

```json
{ "estimatedAmount": null }
```

Les collections vides sont retournées sous forme de tableau vide (`{ "items": [] }`), jamais `null`.

---

## 21. Booléens

Préférer : `isManual`, `hasBlockingIssues`, `canApprove`

Éviter les doubles négations : `isNotUnavailable`, `notDisabled`

Les permissions ne doivent pas être calculées uniquement côté client à partir de ces champs.

---

## 22. Création d'une ressource

Une création réussie retourne `201 Created` avec la représentation créée et le header :

```http
Location: /api/v1/tenders/{tenderId}
```

```json
{
  "id": "0195f250-9e4d-7d52-9152-d75092fa37aa",
  "title": "Maintenance des infrastructures",
  "status": "DISCOVERED",
  "createdAt": "2027-01-10T09:30:00Z"
}
```

---

## 23. Mise à jour

Une mise à jour réussie peut retourner `200 OK` avec la ressource mise à jour, ou `204 No Content` sans corps.

La convention choisie doit rester stable pour une famille d'endpoints. TenderOS privilégie généralement `200 OK` avec représentation lorsque le client a besoin de l'état final.

---

## 24. Suppression

Une suppression logique réussie peut retourner `204 No Content`.

Les suppressions physiques ne doivent pas être exposées comme opérations ordinaires.

Une action métier telle qu'un archivage doit utiliser un endpoint explicite : `POST /api/v1/tenders/{tenderId}/archive`, plutôt qu'un `DELETE` ambigu.

---

## 25. PATCH et PUT

`PUT` représente le remplacement complet d'une ressource lorsque ce comportement existe réellement.

`PATCH` représente une mise à jour partielle de propriétés éditables.

Les deux ne doivent pas servir à contourner des actions métier.

```http
# Acceptable
PATCH /api/v1/company-profile
```

```http
# Non recommandé
PATCH /api/v1/proposals/{proposalId}
{ "status": "APPROVED" }
```

---

## 26. Actions métier

Format recommandé : `POST /resources/{resourceId}/{action}`

```text
POST /tenders/{tenderId}/shortlist
POST /workspaces/{workspaceId}/archive
POST /comments/{commentId}/resolve
POST /proposals/{proposalId}/submit-for-review
POST /proposals/{proposalId}/approve
```

Une action avec des données importantes peut être modélisée comme une sous-ressource : `POST /tenders/{tenderId}/go-no-go-decisions`, car une décision est conservée comme entité historique.

---

## 27. Codes HTTP

| Code | Usage |
|---|---|
| 200 | Lecture ou modification réussie |
| 201 | Ressource créée |
| 202 | Traitement asynchrone accepté |
| 204 | Succès sans contenu |
| 400 | Requête mal formée |
| 401 | Authentification absente ou invalide |
| 403 | Action interdite |
| 404 | Ressource inexistante ou non visible |
| 409 | Conflit métier ou de concurrence |
| 412 | Précondition non satisfaite |
| 413 | Fichier ou requête trop volumineuse |
| 415 | Type de contenu non supporté |
| 422 | Données syntaxiquement valides mais invalides |
| 429 | Limite de débit dépassée |
| 500 | Erreur interne |
| 502 | Dépendance externe invalide |
| 503 | Service temporairement indisponible |
| 504 | Dépendance externe en timeout |

---

## 28. 400 et 422

Utiliser `400 Bad Request` lorsque : le JSON est invalide ; un paramètre ne peut pas être interprété ; la structure générale de la requête est incorrecte.

Utiliser `422 Unprocessable Entity` lorsque : la structure est valide ; les champs ne satisfont pas les règles de validation ; une donnée est incohérente dans le contexte de la commande.

Une violation métier liée à l'état courant peut utiliser `409 Conflict`.

---

## 29. Format des erreurs

```json
{
  "error": {
    "code": "PROPOSAL_HAS_BLOCKING_COMMENTS",
    "message": "La proposition ne peut pas être approuvée.",
    "requestId": "req_01JABCDEF",
    "details": {
      "blockingCommentCount": 3
    }
  }
}
```

| Champ | Description |
|---|---|
| code | Code stable exploitable par le client |
| message | Message sûr et compréhensible |
| requestId | Identifiant de corrélation |
| details | Informations structurées facultatives |

---

## 30. Codes d'erreur

Les codes d'erreur utilisent `UPPER_SNAKE_CASE` :

```text
VALIDATION_FAILED
AUTHENTICATION_REQUIRED
ORGANIZATION_ACCESS_DENIED
TENDER_NOT_FOUND
INVALID_TENDER_STATUS_TRANSITION
PROPOSAL_HAS_BLOCKING_COMMENTS
DOCUMENT_PROCESSING_FAILED
CONCURRENT_MODIFICATION
RATE_LIMIT_EXCEEDED
```

Un code existant ne doit pas changer de signification.

---

## 31. Erreurs de validation

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Certains champs sont invalides.",
    "requestId": "req_01JABCDEF",
    "details": {
      "fields": [
        {
          "path": "submissionDeadline",
          "code": "INVALID_DATE",
          "message": "La date doit être au format ISO 8601."
        },
        {
          "path": "title",
          "code": "TOO_SHORT",
          "message": "Le titre est trop court."
        }
      ]
    }
  }
}
```

Les messages ne doivent pas exposer de détails internes de validation.

---

## 32. Erreurs métier

```json
{
  "error": {
    "code": "INVALID_TENDER_STATUS_TRANSITION",
    "message": "Le Tender ne peut pas passer de NO_GO à SHORTLISTED.",
    "requestId": "req_01JABCDEF",
    "details": {
      "currentStatus": "NO_GO",
      "requestedStatus": "SHORTLISTED"
    }
  }
}
```

Les détails ne doivent jamais inclure des données d'un autre tenant.

---

## 33. Erreurs internes

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Une erreur inattendue est survenue.",
    "requestId": "req_01JABCDEF",
    "details": {}
  }
}
```

Ne jamais exposer : stack trace ; SQL ; nom de table ; chemin de fichier ; secrets ; configuration ; prompt interne ; réponse brute d'un fournisseur.

---

## 34. Pagination

Les collections volumineuses utilisent une pagination par curseur.

```text
GET /api/v1/tenders?limit=25&cursor=...
```

```json
{
  "items": [],
  "pageInfo": {
    "hasNextPage": true,
    "nextCursor": "eyJjcmVhdGVkQXQiOi..."
  }
}
```

Le curseur est opaque. Le client ne doit pas le construire ou l'interpréter.

---

## 35. Taille de page

Convention initiale : `limit` par défaut = 25, `limit` maximum = 100

Des limites différentes peuvent être définies pour : exports ; endpoints administratifs ; recherches vectorielles ; logs ; activités.

Toute exception doit être documentée.

---

## 36. Tri

```text
?sort=-submissionDeadline,title
```

Convention : préfixe `-` : décroissant ; absence de préfixe : croissant.

Les champs de tri doivent être explicitement autorisés. Une valeur inconnue doit produire une erreur de validation.

---

## 37. Filtres

```text
GET /api/v1/tenders?status=SHORTLISTED
GET /api/v1/tenders?buyerId=...
GET /api/v1/tenders?deadlineFrom=2027-01-01T00:00:00Z
GET /api/v1/tenders?deadlineTo=2027-03-01T00:00:00Z
```

Pour plusieurs valeurs : `?status=DISCOVERED&status=SHORTLISTED` — ou une convention CSV unique, mais pas les deux simultanément.

TenderOS privilégie les paramètres répétés.

---

## 38. Recherche

```text
?q=maintenance informatique
```

La recherche doit : respecter le tenant ; respecter les permissions ; limiter les données explorées ; éviter les informations confidentielles dans les suggestions ; définir les champs recherchés.

La présence d'un résultat ne doit pas révéler une ressource inaccessible.

---

## 39. Champs sélectionnés

L'API initiale ne doit pas introduire un système complexe de sélection arbitraire de champs sans besoin confirmé.

Des représentations dédiées sont préférables : `TenderListItem`, `TenderDetail`, `TenderSummary`

Cela permet : des contrats stables ; des contrôles de sécurité explicites ; une meilleure performance ; une documentation claire.

---

## 40. Expansion des relations

Éviter les paramètres génériques tels que `?include=everything`.

Une expansion limitée peut être proposée : `?include=buyer,lots`

Les relations autorisées doivent être définies par endpoint. Les données sensibles ne doivent pas devenir accessibles par expansion implicite.

---

## 41. Idempotence

Les opérations pouvant être rejouées doivent supporter une clé d'idempotence.

```http
Idempotency-Key: 7e203bd2-...
```

Cas concernés : création de Workspace ; génération de package ; import de Tender ; déclenchement d'analyse IA ; enregistrement de soumission via intégration ; création de paiement future ; actions externes sensibles.

---

## 42. Comportement idempotent

Pour une même clé et une même opération : le serveur ne doit exécuter l'effet métier qu'une fois ; il doit retourner le résultat original ou un statut cohérent ; une clé réutilisée avec un payload différent doit être refusée.

```text
IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD
```

Les clés doivent être scoped par : organisation ; acteur ou client ; endpoint ; période de rétention.

---

## 43. Concurrence optimiste

Les ressources sensibles utilisent une version.

```json
{
  "id": "...",
  "status": "IN_REVIEW",
  "version": 7
}
```

La modification peut envoyer `If-Match: "7"` ou inclure `{ "expectedVersion": 7 }`.

En cas de conflit : `409 Conflict` / `CONCURRENT_MODIFICATION`

---

## 44. ETags

Les lectures peuvent utiliser `ETag` / `If-None-Match` pour les ressources ou représentations coûteuses.

Réponse possible : `304 Not Modified`

Les ETags ne doivent pas servir à contourner le versionnement métier lorsque celui-ci est requis.

---

## 45. Traitements asynchrones

Une opération longue retourne `202 Accepted`.

```json
{
  "operationId": "0195f250-...",
  "status": "QUEUED",
  "statusUrl": "/api/v1/operations/0195f250-..."
}
```

Sont notamment asynchrones : OCR ; extraction de texte ; embeddings ; analyse DCE ; génération de proposition ; génération de package ; import massif ; export volumineux.

---

## 46. Suivi d'une opération

```text
GET /api/v1/operations/{operationId}
```

```json
{
  "id": "0195f250-...",
  "type": "DCE_ANALYSIS",
  "status": "RUNNING",
  "progress": {
    "currentStep": "EXTRACTING_REQUIREMENTS",
    "completedUnits": 4,
    "totalUnits": 8
  },
  "createdAt": "2027-01-10T09:30:00Z",
  "startedAt": "2027-01-10T09:30:02Z",
  "completedAt": null,
  "error": null
}
```

Statuts possibles : `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`

---

## 47. Annulation d'une opération

```text
POST /api/v1/operations/{operationId}/cancel
```

L'annulation est une demande. Elle ne garantit pas que le traitement sera immédiatement interrompu. Le statut final doit indiquer le résultat réel.

---

## 48. Upload de fichiers

Pour les fichiers volumineux, privilégier un upload direct vers l'Object Storage.

```text
1. POST upload request
2. Permission and quota validation
3. Temporary upload record
4. Signed upload URL
5. Direct client upload
6. Upload completion confirmation
7. Checksum verification
8. Asynchronous processing
```

---

## 49. Demande d'upload

```text
POST /api/v1/workspaces/{workspaceId}/document-uploads
```

```json
{
  "filename": "cctp.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 2489201,
  "checksumSha256": "..."
}
```

```json
{
  "uploadId": "...",
  "uploadUrl": "...",
  "expiresAt": "2027-01-10T09:45:00Z",
  "requiredHeaders": {}
}
```

Une URL signée doit expirer rapidement.

---

## 50. Finalisation d'un upload

```text
POST /api/v1/document-uploads/{uploadId}/complete
```

La finalisation doit vérifier : l'organisation ; le propriétaire ; l'expiration ; le fichier présent ; la taille ; le checksum ; le MIME type ; le statut précédent.

Un upload finalisé ne doit pas pouvoir être finalisé deux fois avec des effets dupliqués.

---

## 51. Téléchargement

```text
GET /api/v1/documents/{documentId}/versions/{versionId}/download
```

L'API vérifie les permissions puis retourne une URL signée courte, ou transmet le fichier lorsque nécessaire.

```json
{
  "downloadUrl": "...",
  "expiresAt": "2027-01-10T09:40:00Z"
}
```

L'URL ne doit pas être enregistrée durablement.

---

## 52. Webhooks entrants

Les webhooks entrants doivent : vérifier leur signature ; utiliser un timestamp ; prévenir les replays ; conserver l'identifiant externe ; être idempotents ; répondre rapidement ; traiter le métier de manière asynchrone.

La payload brute peut être conservée de façon contrôlée pour audit et débogage.

---

## 53. Webhooks sortants

Les webhooks sortants doivent contenir : un identifiant d'événement ; un type ; une version ; un timestamp ; l'organisation concernée si le contrat le permet ; une payload minimale ; une signature.

```json
{
  "id": "evt_...",
  "type": "submission.recorded",
  "version": 1,
  "occurredAt": "2027-01-10T09:30:00Z",
  "data": {}
}
```

---

## 54. Livraison des webhooks

La livraison doit utiliser : retries limités ; backoff exponentiel ; timeout ; journalisation ; Dead Letter ; possibilité de relance ; désactivation après échecs prolongés.

Les réponses 2xx sont considérées comme réussies. Les redirections ne doivent pas être suivies aveuglément.

---

## 55. Rate limiting

Les limites doivent protéger : authentification ; recherche ; génération IA ; uploads ; exports ; endpoints publics ; webhooks ; opérations coûteuses.

```http
RateLimit-Limit
RateLimit-Remaining
RateLimit-Reset
Retry-After
```

Réponse : `429 Too Many Requests` / `RATE_LIMIT_EXCEEDED`

---

## 56. Quotas

Les quotas métier sont distincts du rate limiting.

Exemples : volume de stockage ; nombre d'analyses IA ; nombre de documents ; volume d'exports ; nombre de membres ; consommation contractuelle.

Une erreur de quota doit être explicite : `ORGANIZATION_STORAGE_QUOTA_EXCEEDED`, `AI_USAGE_QUOTA_EXCEEDED`

---

## 57. Timeouts

Tout appel externe doit avoir un timeout.

L'API ne doit pas attendre indéfiniment : un fournisseur IA ; un connecteur ; un service email ; un stockage objet ; un webhook.

Les traitements longs doivent être déplacés vers des workers.

---

## 58. Request IDs

Chaque requête reçoit un identifiant.

```http
X-Request-Id
```

L'identifiant doit apparaître : dans les logs ; dans les erreurs ; dans les traces ; dans les appels externes lorsque possible.

Un identifiant fourni par le client doit être validé et limité en taille.

---

## 59. Correlation IDs

Un workflow réparti sur plusieurs services ou jobs utilise un `correlationId`.

Le `requestId` identifie une requête HTTP. Le `correlationId` identifie un workflow métier plus large.

Les événements doivent propager : `correlationId` ; `causationId` lorsque pertinent.

---

## 60. Audit

Les endpoints sensibles doivent produire un Audit Log.

Exemples : changement de rôle ; invitation ; téléchargement confidentiel ; approbation ; dérogation de conformité ; génération de package ; soumission ; accès administratif ; export de données.

L'audit doit être produit dans la même transaction que l'action métier lorsque cela est nécessaire.

---

## 61. Logging API

```text
requestId
traceId
organizationId
actorId
method
route
statusCode
durationMs
result
errorCode
```

Ne pas journaliser par défaut : corps complet ; tokens ; cookies ; contenu documentaire ; données personnelles inutiles ; URLs signées ; secrets.

---

## 62. CORS

La politique CORS doit être restrictive.

Autoriser uniquement : les origines connues ; les méthodes nécessaires ; les headers nécessaires ; les credentials lorsque requis.

Éviter `Access-Control-Allow-Origin: *` pour les endpoints authentifiés.

---

## 63. CSRF

Lorsque l'authentification utilise des cookies, les opérations modifiant l'état doivent être protégées contre le CSRF.

Mécanismes possibles : cookies `SameSite` ; token CSRF ; validation d'origine ; cookies sécurisés et HTTP-only.

Avec un token Bearer hors cookie, le risque diffère mais les règles CORS restent nécessaires.

---

## 64. Headers de sécurité

```http
Content-Security-Policy
X-Content-Type-Options: nosniff
Referrer-Policy
Strict-Transport-Security
Permissions-Policy
```

Les valeurs sont définies au niveau Edge ou application.

---

## 65. Validation des entrées

Toutes les entrées sont non fiables : corps JSON ; paramètres de chemin ; query strings ; headers ; fichiers ; événements ; webhooks ; réponses externes ; sorties IA.

La validation doit être effectuée avant le use case. Les règles métier restent ensuite appliquées dans le Domain ou l'Application.

---

## 66. Validation des paramètres de chemin

Un identifiant invalide doit produire une erreur de validation.

```json
{
  "error": {
    "code": "INVALID_RESOURCE_ID",
    "message": "L'identifiant fourni est invalide.",
    "requestId": "...",
    "details": {
      "parameter": "tenderId"
    }
  }
}
```

Ne pas transmettre une valeur invalide jusqu'à Prisma.

---

## 67. Taille des requêtes

Des limites doivent être appliquées à : corps JSON ; fichiers ; nombre d'éléments d'une commande batch ; longueur des chaînes ; nombre de filtres ; profondeur JSON ; taille des webhooks.

Une requête trop volumineuse retourne `413 Payload Too Large`.

---

## 68. Endpoints batch

Un endpoint batch doit définir clairement : la taille maximale ; l'ordre de traitement ; l'atomicité ; le comportement en cas d'échec partiel ; l'idempotence ; la structure des résultats.

```json
{
  "results": [
    { "inputId": "1", "status": "SUCCEEDED", "resourceId": "..." },
    { "inputId": "2", "status": "FAILED", "error": { "code": "TENDER_NOT_FOUND" } }
  ]
}
```

Ne pas créer un endpoint batch sans besoin réel.

---

## 69. Transactions et API

Une requête HTTP ne constitue pas automatiquement une transaction métier unique.

Une transaction doit couvrir uniquement les écritures cohérentes nécessaires.

Ne pas maintenir une transaction ouverte pendant : un appel IA ; un upload ; un email ; un webhook ; une opération utilisateur longue ; un traitement PDF.

Utiliser l'Outbox pour déclencher les effets externes.

---

## 70. OpenAPI

Chaque endpoint doit être documenté dans OpenAPI, incluant : résumé ; description ; permissions requises ; paramètres ; schéma de requête ; schémas de réponse ; erreurs principales ; exemples ; dépréciation ; idempotence ; comportement asynchrone.

La documentation générée doit être validée en CI.

---

## 71. Contrats partagés

Les schémas partagés sont placés dans `packages/contracts` : schémas Zod ; types de requête ; types de réponse ; codes d'erreur ; pagination ; événements exposés ; types OpenAPI.

Ils ne doivent pas exposer : modèles Prisma ; entités Domain ; types internes de fournisseur ; détails de stockage ; secrets.

---

## 72. DTO

Un DTO est un contrat de transport. Il ne doit pas contenir de comportement métier.

```typescript
export const CreateManualTenderRequestSchema = z.object({
  title: z.string().min(3).max(500),
  reference: z.string().max(255).optional(),
  submissionDeadline: z.string().datetime().optional(),
});
```

Le DTO est transformé vers une commande applicative.

---

## 73. Presenters

Les use cases ne doivent pas retourner directement des modèles Prisma.

```text
Domain/Application result
→ API Presenter
→ Public response
```

Le Presenter doit notamment : sérialiser les montants ; formater les dates ; masquer les champs internes ; inclure uniquement les permissions ou actions utiles ; éviter les données sensibles.

---

## 74. Représentations métier

Une même ressource peut avoir plusieurs représentations : `TenderListItemResponse`, `TenderDetailResponse`, `TenderExportRow`, `TenderEventPayload`

Ces représentations ne doivent pas être fusionnées artificiellement dans un objet universel comportant de nombreux champs conditionnels.

---

## 75. Permissions exposées au frontend

```json
{
  "capabilities": {
    "canEdit": true,
    "canArchive": false,
    "canCreateWorkspace": true
  }
}
```

Ces capacités servent à l'expérience utilisateur. Elles ne remplacent jamais les contrôles côté serveur.

---

## 76. Localisation

Les codes d'erreur sont indépendants de la langue.

Le champ `message` peut être localisé côté serveur, ou traduit côté client à partir du code.

Pour le MVP, une stratégie unique doit être choisie afin d'éviter les incohérences.

Les données métier ne doivent pas être automatiquement traduites par l'API.

---

## 77. Fuseaux horaires

Les timestamps sont en UTC. L'API conserve le fuseau officiel lorsque la notion métier l'exige.

Le frontend est responsable de l'affichage local selon : le fuseau utilisateur ; le fuseau officiel ; le contexte produit.

Une échéance de soumission doit toujours permettre d'afficher le fuseau officiel.

---

## 78. Recherche vectorielle et RAG

Les endpoints de recherche sémantique doivent exiger : `organizationId` dans le contexte ; permissions documentaires ; filtres Workspace ; filtres de confidentialité ; version documentaire valide ; limite du nombre de résultats.

Ils ne doivent jamais retourner un chunk appartenant à une autre organisation.

---

## 79. API IA

Une action IA doit être représentée comme une capacité métier ou une opération.

```text
POST /api/v1/workspaces/{workspaceId}/dce-analyses
POST /api/v1/proposals/{proposalId}/generation-runs
POST /api/v1/proposal-sections/{sectionId}/rewrite-runs
```

Éviter `POST /api/v1/ai/prompt` — une API générique de prompt exposerait trop de pouvoir et contournerait les Skills métier.

---

## 80. Réponses IA

```json
{
  "analysisId": "...",
  "status": "COMPLETED",
  "confidence": "MEDIUM",
  "citations": [],
  "generatedAt": "...",
  "requiresHumanReview": true
}
```

Le modèle, le fournisseur et le prompt interne ne doivent pas forcément être exposés aux utilisateurs standards. Ils restent disponibles pour l'audit technique selon les permissions.

---

## 81. Données sensibles dans les réponses

Ne pas retourner par défaut : adresses email inutiles ; informations de facturation ; données d'authentification ; clés de stockage ; URLs signées expirées ; prompts ; métadonnées internes ; notes confidentielles ; données d'une autre organisation.

---

## 82. APIs administratives

```text
/api/v1/admin/...
```

Nécessitent : une permission dédiée ; un audit renforcé ; une limitation stricte ; une protection contre l'énumération ; une documentation distincte ; aucun accès implicite par un rôle organisationnel standard.

---

## 83. Impersonation

Toute fonctionnalité d'impersonation future doit : exiger une permission très restreinte ; afficher clairement l'état d'impersonation ; être limitée dans le temps ; conserver l'acteur réel et l'acteur représenté ; créer un Audit Log ; interdire certaines opérations sensibles si nécessaire.

Elle ne doit pas être implémentée sans validation spécifique.

---

## 84. Export de données

Un export volumineux doit être asynchrone.

```text
POST /exports
→ 202 Accepted
→ génération par worker
→ notification
→ téléchargement temporaire sécurisé
```

Les exports doivent appliquer : permissions ; tenant ; filtrage ; minimisation ; expiration ; audit ; chiffrement lorsque requis.

---

## 85. Cache HTTP

Les réponses privées doivent généralement utiliser `Cache-Control: private`.

Les données sensibles peuvent utiliser `Cache-Control: no-store`.

Les ressources publiques stables peuvent utiliser un cache partagé lorsque cela est explicitement validé.

Le cache ne doit jamais exposer les données d'un tenant à un autre.

---

## 86. Retries clients

Les clients peuvent rejouer automatiquement : certaines lectures ; des commandes idempotentes ; des opérations avec `Idempotency-Key`.

Ils ne doivent pas rejouer automatiquement une action sensible non idempotente sans contrat explicite.

Les erreurs temporaires doivent être identifiables.

---

## 87. Circuit breakers

Un circuit breaker peut être introduit pour les intégrations instables lorsque : les échecs sont fréquents ; les timeouts affectent l'API ; le service externe peut être temporairement isolé ; un fallback existe.

Son ajout doit être mesuré et documenté.

---

## 88. Health endpoints

```text
GET /liveness
GET /readiness
```

`/liveness` vérifie que le processus répond. `/readiness` vérifie que le service peut traiter les requêtes principales.

Les réponses ne doivent pas exposer : credentials ; chaînes de connexion ; topologie interne détaillée ; versions sensibles ; noms de ressources privées.

---

## 89. API de métriques

Les métriques ne doivent pas être publiquement accessibles.

Un endpoint tel que `/metrics` doit être : privé ; filtré par réseau ; protégé par authentification technique ; exclu des surfaces publiques.

---

## 90. Tests d'API

Minimum pour une commande métier : succès ; validation invalide ; non authentifié ; non autorisé ; autre tenant ; ressource inexistante ; état métier incompatible ; conflit de concurrence ; effet transactionnel ; événement Outbox si requis.

---

## 91. Tests de contrat

Les contrats doivent vérifier : schéma de requête ; schéma de réponse ; codes HTTP ; codes d'erreur ; champs obligatoires ; sérialisation des montants ; sérialisation des dates ; compatibilité OpenAPI.

Les snapshots ne doivent pas masquer des changements non compris.

---

## 92. Tests de sécurité API

Les tests doivent notamment vérifier : accès inter-tenant ; IDOR ; contournement de permissions ; injection ; paramètres inattendus ; upload malveillant ; fichiers trop volumineux ; rate limiting ; fuite dans les erreurs ; cache incorrect ; accès aux URLs signées.

---

## 93. Tests d'idempotence

Pour une commande idempotente : envoyer une requête avec une clé ; répéter la même requête ; vérifier qu'un seul effet métier existe ; vérifier que le résultat reste cohérent ; modifier le payload avec la même clé ; vérifier que la requête est refusée.

---

## 94. Tests de pagination

Les tests doivent vérifier : ordre stable ; absence de doublon ; absence d'élément manquant ; changement de page ; limite maximum ; curseur invalide ; filtres combinés ; tenant scope.

---

## 95. Première API verticale

La première tranche doit exposer uniquement les endpoints nécessaires.

**Organization**

```text
POST /api/v1/organizations
GET  /api/v1/organizations/current
```

**Tender**

```text
POST /api/v1/tenders
GET  /api/v1/tenders
GET  /api/v1/tenders/{tenderId}
PATCH /api/v1/tenders/{tenderId}
POST /api/v1/tenders/{tenderId}/shortlist
POST /api/v1/tenders/{tenderId}/archive
```

Le `PATCH` initial est limité aux propriétés éditables : titre ; référence ; description ; échéance ; montant estimé ; devise.

Il ne permet pas de modifier directement le statut.

---

## 96. Exemple — création manuelle d'un Tender

**Requête**

```http
POST /api/v1/tenders
Authorization: Bearer …
X-Organization-Id: 0195f250-…
Content-Type: application/json

{
  "title": "Maintenance applicative et support",
  "reference": "AO-2027-014",
  "description": "Prestations de maintenance applicative.",
  "submissionDeadline": "2027-02-15T11:00:00Z",
  "officialTimezone": "Europe/Paris",
  "estimatedAmount": {
    "amount": "150000.0000",
    "currency": "EUR"
  }
}
```

**Réponse**

```http
201 Created
Location: /api/v1/tenders/0195f250-…
```

```json
{
  "id": "0195f250-…",
  "title": "Maintenance applicative et support",
  "reference": "AO-2027-014",
  "description": "Prestations de maintenance applicative.",
  "status": "DISCOVERED",
  "isManual": true,
  "submissionDeadline": "2027-02-15T11:00:00Z",
  "officialTimezone": "Europe/Paris",
  "estimatedAmount": {
    "amount": "150000.0000",
    "currency": "EUR"
  },
  "version": 1,
  "createdAt": "2027-01-10T09:30:00Z",
  "updatedAt": "2027-01-10T09:30:00Z"
}
```

---

## 97. Exemple — shortlist

**Requête**

```http
POST /api/v1/tenders/{tenderId}/shortlist
Authorization: Bearer …
X-Organization-Id: …
Idempotency-Key: shortlist-0195f250-…
Content-Type: application/json

{
  "expectedVersion": 1,
  "reason": "Correspond à nos expertises principales."
}
```

**Réponse**

```http
200 OK
```

```json
{
  "id": "0195f250-…",
  "status": "SHORTLISTED",
  "version": 2,
  "updatedAt": "2027-01-10T09:35:00Z"
}
```

---

## 98. Exemple — conflit de concurrence

```http
409 Conflict
```

```json
{
  "error": {
    "code": "CONCURRENT_MODIFICATION",
    "message": "La ressource a été modifiée depuis votre dernière lecture.",
    "requestId": "req_01JABCDEF",
    "details": {
      "expectedVersion": 1,
      "currentVersion": 2
    }
  }
}
```

---

## 99. Anti-patterns interdits

- API reflétant directement les tables ;
- endpoint générique permettant de modifier tous les statuts ;
- modèle Prisma retourné au client ;
- tenant uniquement déduit de l'identifiant ;
- permission vérifiée uniquement dans le frontend ;
- corps complet journalisé ;
- erreur contenant une stack trace ;
- opération longue synchrone ;
- pagination absente ;
- curseur interprétable et modifiable ;
- URL signée persistée ;
- endpoint IA générique acceptant un prompt libre ;
- webhook sans signature ;
- commande non idempotente rejouée automatiquement ;
- suppression physique exposée par défaut ;
- utilisation incohérente des codes HTTP ;
- changement de contrat silencieux ;
- champ monétaire sérialisé avec une précision flottante ;
- endpoint administratif mélangé aux endpoints métier.

---

## 100. Checklist de conception d'un endpoint

**Métier**

- [ ] L'intention métier est explicite.
- [ ] L'action ne contourne pas un use case.
- [ ] Les règles métier applicables sont identifiées.
- [ ] Le comportement en cas d'état incompatible est défini.

**Sécurité**

- [ ] L'authentification est définie.
- [ ] La permission requise est définie.
- [ ] Le tenant scope est explicite.
- [ ] Le comportement pour une ressource inaccessible est défini.
- [ ] Les données sensibles sont minimisées.

**Contrat**

- [ ] La requête est validée.
- [ ] La réponse est documentée.
- [ ] Les erreurs sont documentées.
- [ ] Les dates et montants respectent les conventions.
- [ ] La compatibilité est analysée.

**Résilience**

- [ ] L'idempotence est définie.
- [ ] Les timeouts sont définis.
- [ ] Le traitement asynchrone est utilisé si nécessaire.
- [ ] Les retries sont sûrs.
- [ ] La concurrence est gérée.

**Exploitation**

- [ ] Le Request ID est propagé.
- [ ] L'audit est ajouté si nécessaire.
- [ ] Les logs sont structurés.
- [ ] Les métriques utiles sont identifiées.
- [ ] Les tests couvrent permissions et multi-tenancy.

---

## 101. Critères d'acceptation

Les API de TenderOS respectent ce document lorsque :

- les endpoints expriment des capacités métier ;
- les contrats sont versionnés ;
- les réponses sont cohérentes ;
- les erreurs possèdent des codes stables ;
- les permissions sont contrôlées côté serveur ;
- le tenant est explicitement vérifié ;
- les traitements longs sont asynchrones ;
- les commandes rejouables sont idempotentes ;
- les collections sont paginées ;
- les montants ne perdent pas de précision ;
- les modèles Prisma ne sont jamais exposés ;
- les uploads et téléchargements sont sécurisés ;
- OpenAPI est maintenu ;
- les tests de contrat, permission et multi-tenancy passent ;
- toute rupture de compatibilité est documentée et validée.
