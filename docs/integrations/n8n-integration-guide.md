# Utiliser TenderOS avec n8n

V2 Sprint 16 (Integration Hub). Ce guide décrit comment brancher n8n sur TenderOS **aujourd'hui**,
avec les deux nodes génériques n8n (**Webhook** et **HTTP Request**) — aucun node TenderOS dédié
n'existe encore dans le catalogue n8n (voir la proposition en fin de document).

TenderOS n'a **aucune dépendance vers n8n** : n8n est un simple *consommateur* de l'API publique et
des webhooks TenderOS, jamais l'inverse. Tout ce qui suit fonctionne identiquement avec Zapier,
Make, ou un script `curl` — n8n est seulement l'exemple retenu par la mission Sprint 16.

## Scénario A — recevoir un événement TenderOS dans n8n (Webhook)

But : déclencher un workflow n8n dès qu'un événement métier TenderOS survient (ex. un appel
d'offres est créé, un dossier de réponse est validé).

### 1. Créer le trigger côté n8n

Ajoutez un node **Webhook** (méthode `POST`), copiez l'URL de test/production qu'il affiche.

### 2. Enregistrer ce webhook côté TenderOS

Dans TenderOS : **Intégrations → Webhooks → Nouveau webhook**.

- **URL de destination** : collez l'URL du node Webhook n8n. Doit être en `https://` en
  production (HTTP est refusé hors développement) et ne peut pas cibler un réseau privé/interne/
  un service de métadonnées cloud (protection SSRF, mission §31).
- **Événements** : cochez au moins un type dans le catalogue gouverné (`tender.created`,
  `task.created`, `task.completed`, `opportunity.go_decided`, `opportunity.no_go_decided`,
  `response_package.validated`, `response_package.generated`).
- **Restriction client** (facultatif) : limitez ce webhook aux événements d'un ou plusieurs clients
  précis. Laissé vide, il reçoit les événements de toute l'organisation. *Limite connue* :
  `task.*`/`opportunity.*` ne portent que `tenderId` dans leur charge utile — une restriction
  client sur ces types-là ne filtrera jamais rien (voir "Limites connues" ci-dessous).

Cliquez **Créer**. Le **secret de signature** (`whsec_...`) s'affiche **une seule fois** — copiez-le
immédiatement dans une variable d'environnement n8n (jamais en dur dans le workflow).

### 3. Vérifier la signature côté n8n

Chaque livraison porte quatre en-têtes :

| En-tête | Contenu |
|---|---|
| `X-TenderOS-Event` | type d'événement public, ex. `tender.created` |
| `X-TenderOS-Delivery` | identifiant unique de cette livraison |
| `X-TenderOS-Timestamp` | epoch secondes au moment de l'envoi |
| `X-TenderOS-Signature` | HMAC-SHA256 hex de `"<timestamp>.<corps brut>"`, clé = le secret `whsec_...` |

Ajoutez un node **Code** (JavaScript) juste après le Webhook pour vérifier la signature avant de
laisser le workflow continuer :

```js
const crypto = require('crypto');

const secret = $env.TENDEROS_WEBHOOK_SECRET; // whsec_...
const timestamp = $input.first().headers['x-tenderos-timestamp'];
const signature = $input.first().headers['x-tenderos-signature'];
const rawBody = JSON.stringify($input.first().json); // le corps EXACT reçu

const expected = crypto
  .createHmac('sha256', secret)
  .update(`${timestamp}.${rawBody}`, 'utf8')
  .digest('hex');

if (expected !== signature) {
  throw new Error('Signature TenderOS invalide — livraison rejetée.');
}

// Rejet du replay (mission §29) : tolérance recommandée 300s.
const ageSeconds = Math.floor(Date.now() / 1000) - Number(timestamp);
if (Math.abs(ageSeconds) > 300) {
  throw new Error('Timestamp TenderOS hors tolérance — livraison rejetée.');
}

return $input.all();
```

### 4. Charge utile reçue

```json
{
  "id": "evt_...",
  "type": "tender.created",
  "version": 1,
  "occurredAt": "2026-08-11T14:52:16.208Z",
  "organizationId": "...",
  "data": { "tenderId": "...", "clientAccountId": "..." }
}
```

`data` varie selon `type` — récupérez les détails complets via le Scénario B (API publique) si le
contenu de l'événement ne suffit pas.

### Comportement de livraison à connaître

- **Asynchrone** : la livraison ne bloque jamais l'action TenderOS qui l'a déclenchée (transaction
  Outbox → worker séparé → HTTP réel).
- **Au moins une fois, jamais garanti exactement une fois** : en cas de timeout/5xx, TenderOS
  retente avec un backoff croissant (1 min / 5 min / 30 min / 2 h / 6 h, 8 tentatives maximum avant
  passage définitif en `DEAD`). Un workflow n8n idempotent (déduplication sur `X-TenderOS-Delivery`)
  est recommandé.
- **Aucun ordre garanti** entre deux événements différents.
- Une réponse HTTP `4xx` (hors 429) est considérée définitive et n'est **jamais** retentée.
- Un webhook désactivé ou supprimé ne reçoit plus aucune nouvelle livraison, immédiatement.

## Scénario B — interroger TenderOS depuis n8n (HTTP Request)

But : un node **HTTP Request** n8n lit des données TenderOS à la demande (ex. lister les appels
d'offres d'un client avant de générer un rapport).

### 1. Créer la clé API

Dans TenderOS : **Intégrations → Clés API → Nouvelle clé API**.

- **Nom** : un nom reconnaissable (ex. "n8n — reporting hebdomadaire").
- **Scopes** : cochez uniquement ce dont le workflow a besoin (ex. `tenders:read`). Une clé n'est
  jamais omnipotente par défaut.
- **Restriction client** (facultatif) : narrowing strict, jamais un élargissement — voir la
  documentation OpenAPI pour la sémantique exacte.

La **clé complète** (`tos_live_...`) s'affiche **une seule fois** — copiez-la dans une identifiant
n8n de type *Credential* (Header Auth, `Authorization: Bearer tos_live_...`), jamais en dur dans un
node.

### 2. Configurer le node HTTP Request

- **Méthode** : `GET`
- **URL** : `https://<votre-domaine>/api/v1/public/tenders`
- **Authentication** : Generic Credential Type → Header Auth → `Authorization: Bearer <clé>`
- **Query Parameters** (tous facultatifs) : `status`, `clientId`, `updatedSince`, `cursor`, `limit`
  (max 100)

Réponse :

```json
{ "items": [ { "id": "...", "title": "...", "status": "IN_ANALYSIS", "...": "..." } ], "nextCursor": null }
```

Pour un Tender précis : `GET /api/v1/public/tenders/{id}`. Pour un dossier de réponse (métadonnées
uniquement, jamais le ZIP) : `GET /api/v1/public/response-packages/{id}`.

Le détail complet des routes, codes d'erreur et schémas est dans
[`integration-hub-openapi.yaml`](./integration-hub-openapi.yaml).

### Limites à connaître

- **Débit** : 100 requêtes / 60 secondes par clé API (`429` au-delà, avec le même format d'erreur
  que toute autre erreur TenderOS).
- **Pagination obligatoire** : `limit` plafonné à 100, jamais de liste non paginée.
- **Anti-énumération** : une ressource hors du périmètre de la clé (autre organisation, ou hors
  restriction client) renvoie exactement le même `404` qu'une ressource inexistante — jamais un
  `403` qui confirmerait son existence.

## Limites connues (V2 Sprint 16)

- Catalogue d'événements volontairement restreint aux événements réellement démontrables
  aujourd'hui : `document.uploaded`, `checklist.updated`, `technical_memo.validated`,
  `pricing.validated`, `deadline.approaching` sont différés à un sprint ultérieur.
- La restriction client d'un webhook ne s'applique qu'aux événements dont la charge utile porte
  directement `clientAccountId` (`tender.created`, `response_package.validated`,
  `response_package.generated`). Les événements `task.*`/`opportunity.*` ne portent que `tenderId`
  et ne sont jamais livrés à un webhook restreint par client (exclusion par défaut, jamais un
  élargissement silencieux).
- Le téléchargement du fichier ZIP d'un dossier de réponse via l'API publique n'existe pas encore
  (métadonnées uniquement).

## Proposition — futur node TenderOS natif pour n8n

Hors périmètre du Sprint 16 (mission — un vrai node publié dans le catalogue n8n serait une couche
de distribution supplémentaire, à traiter séparément). Si développé, il envelopperait exactement
les mêmes endpoints déjà stables ci-dessus :

**Triggers** (webhook n8n pré-câblé + vérification de signature intégrée) :
- On Tender Created
- On GO Decision
- On Document Uploaded *(nécessite d'abord l'ajout de `document.uploaded` au catalogue gouverné)*
- On Task Completed
- On Package Ready
- On Package Validated

**Actions** (enveloppent l'API publique, gestion de pagination/auth automatique) :
- List Tenders
- Get Tender
- List Lots
- Get Documents
- Create Task
- Get Response Package
