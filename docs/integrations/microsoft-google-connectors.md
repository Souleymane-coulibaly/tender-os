# Connecteurs Microsoft 365 & Google Workspace

Statut : Sprint 19 (construction) + Sprint 20 (stabilisation). Module `apps/api/src/modules/connectors/`.

Ce document couvre l'architecture, la configuration requise, le comportement opérationnel (retry,
idempotence, statuts) et les limites connues des connecteurs OAuth vers Microsoft 365 (SharePoint /
OneDrive / Calendar) et Google Workspace (Drive / Calendar). Il ne couvre pas l'Integration Hub
(API Keys / Webhooks sortants, Sprint 16 — voir `integration-hub-openapi.yaml`), qui est un module
distinct et indépendant.

## 1. Architecture

- Modèle générique unique `ExternalConnection` (jamais `MicrosoftConnection`/`GoogleConnection`
  séparés) — un `provider` (`MICROSOFT_365` | `GOOGLE_WORKSPACE`) sélectionne l'adapter via
  `CONNECTOR_PROVIDER_ADAPTERS` (une `Map`, jamais un `if/else` dispersé).
- OAuth 2.0 Authorization Code + PKCE, `state` signé/à usage unique (`OAuthFlowState`), Redirect URI
  dérivée exclusivement de `API_BASE_URL` côté serveur (jamais fournie par le frontend).
- Credentials (access/refresh token) chiffrés réversiblement (AES-256-GCM, `AesGcmCredentialCipher`)
  — jamais en clair en base, jamais loggés, jamais renvoyés dans une réponse HTTP.
- Toutes les opérations connecteur (navigation, import, export, calendrier, test de connexion) sont
  **synchrones** (requête/réponse HTTP directe) — il n'existe volontairement aucune file de jobs
  asynchrone pour ce module (décision Sprint 19 reconfirmée Sprint 20) : une synchronisation
  automatique/planifiée n'est pas implémentée, seules les actions manuelles le sont.
- Import : fichier distant → `Document`/`DocumentVersion` via les use-cases `documents` existants
  (`CreateDocumentWithFirstVersionUseCase`/`AddDocumentVersionUseCase`) — jamais un second système
  de stockage documentaire.
- Export : toujours une `DocumentVersion` précise (jamais "la dernière version" résolue tardivement).

## 2. Variables d'environnement requises

**Aucune valeur réelle ne doit jamais figurer dans ce document ou dans le dépôt.** Ci-dessous, les
noms de variables uniquement.

| Variable | Provider | Usage |
|---|---|---|
| `MICROSOFT_OAUTH_CLIENT_ID` | Microsoft | Client ID de l'app enregistrée dans Entra ID (Azure AD) |
| `MICROSOFT_OAUTH_CLIENT_SECRET` | Microsoft | Client Secret correspondant |
| `GOOGLE_OAUTH_CLIENT_ID` | Google | Client ID OAuth (Google Cloud Console) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google | Client Secret correspondant |
| `API_BASE_URL` | Commun | Base publique de l'API — sert à dériver les Redirect URIs (voir §3) |
| `CONNECTOR_CREDENTIAL_ENCRYPTION_KEY` | Commun | Clé AES-256-GCM (base64) pour le chiffrement des tokens stockés |
| `DOCUMENT_MAX_FILE_SIZE_MB` | Commun | Réutilisée du module `documents` — limite appliquée aux imports |

Ces variables sont lues **paresseusement** (à l'intérieur de getters, au moment précis où un appel
provider a réellement lieu) — un provider mal configuré ne fait jamais planter le démarrage de
l'API ni les opérations de l'AUTRE provider ou des autres modules TenderOS ; seule une tentative
d'usage de CE provider échoue (actuellement une erreur 500 non typée — voir §8 limites connues).

## 3. Callbacks OAuth

Dérivés exclusivement de `API_BASE_URL`, jamais paramétrables par le frontend (mission §9) :

```
{API_BASE_URL}/api/v1/connectors/oauth/microsoft-365/callback
{API_BASE_URL}/api/v1/connectors/oauth/google-workspace/callback
```

Ce sont exactement les Redirect URIs à déclarer côté Entra ID / Google Cloud Console.

## 4. Scopes demandés (least privilege)

**Microsoft 365** (`MICROSOFT_SCOPES`) :
`offline_access`, `User.Read`, `Sites.ReadWrite.All`, `Files.ReadWrite.All`, `Calendars.ReadWrite`.

**Google Workspace** (`GOOGLE_SCOPES`) :
`https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/calendar.events`,
`https://www.googleapis.com/auth/userinfo.email`.

Hors périmètre (non demandés, mission §120) : Outlook Mail (envoi), Gmail Send, Teams.

## 5. Statuts de connexion

`ExternalConnection.status` — 4 valeurs, volontairement pas davantage (mission §5) :

| Statut | Signification |
|---|---|
| `PENDING` | Flow OAuth initié, callback pas encore reçu |
| `ACTIVE` | Connexion opérationnelle |
| `REAUTH_REQUIRED` | Refresh token invalide/révoqué — reconnexion utilisateur nécessaire |
| `REVOKED` | Déconnectée explicitement — credentials réellement effacés (pas juste un flag) |

Un `DEGRADED` séparé a été délibérément écarté (Sprint 20) : `status=ACTIVE` + `lastError` renseigné
communique déjà "actif mais a récemment eu un problème" sans complexifier les transitions d'état.

## 6. Health check (Sprint 20)

`POST /api/v1/connectors/:id/test` — vérifie qu'une connexion est réellement exploitable (token
valide/rafraîchissable + un appel provider léger, `fetchAccountInfo` / `/me` ou userinfo) sans
effectuer d'import/export. Ne lève jamais d'erreur HTTP 5xx inattendue : renvoie toujours l'état réel
de la connexion (`ACTIVE` ou `REAUTH_REQUIRED`), déjà persisté. Met à jour `lastSuccessfulSyncAt` en
cas de succès.

## 7. Résilience réseau (Sprint 20)

Tout appel Microsoft Graph / Google API passe par un point d'entrée HTTP unique et partagé
(`infrastructure/provider-http-client.ts`) :

- **Timeout** : 15 secondes par tentative (`AbortController`).
- **Retry** : borné à 3 tentatives, **uniquement** pour les erreurs transitoires
  (`RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `TIMEOUT`) — jamais pour une erreur permanente
  (401/403/404/409/400/422).
- **Backoff** : exponentiel (500ms de base), ou la valeur du header `Retry-After` si présent —
  plafonné à 5 secondes dans tous les cas (aucune file de jobs n'existe pour différer une attente
  plus longue ; au-delà, l'appel échoue avec une erreur `RATE_LIMITED` marquée `retryable`, jamais un
  blocage silencieux de la requête HTTP de l'utilisateur).
- **Modèle d'erreur commun** (`ProviderErrorCode`) : `AUTH_ERROR`, `PERMISSION_DENIED`, `NOT_FOUND`,
  `CONFLICT`, `RATE_LIMITED`, `TIMEOUT`, `PROVIDER_UNAVAILABLE`, `INVALID_REQUEST`, `UNKNOWN` — le
  statut HTTP brut du provider n'est jamais propagé tel quel ; le corps de réponse brut du provider
  n'est **jamais** inclus dans le message d'erreur renvoyé au frontend (uniquement dans
  `technicalDetail`, réservé à un futur logging serveur, jamais sérialisé en HTTP).
- **401 réactif** (`call-with-reactive-reauth.ts`) : sur un premier échec `AUTH_ERROR` (token jugé
  frais localement mais rejeté par le provider), un refresh est forcé puis l'opération est rejouée
  **une seule fois** — jamais de boucle. Si le refresh forcé échoue, `REAUTH_REQUIRED` est persisté.
- **Concurrence de refresh** : verrou consultatif Postgres (`pg_advisory_xact_lock`) scopé à la
  connexion, avec double vérification de fraîcheur une fois le verrou obtenu — deux requêtes
  concurrentes sur la même connexion expirée ne déclenchent jamais deux appels
  `refreshAccessToken` avec le même refresh token (destructeur si le provider fait tourner le
  refresh token à chaque usage).

## 8. Idempotence

- **Import** (`ExternalFileImportRecord`) : le même fichier distant
  (`connectionId`+`containerId`+`fileId`+`targetDocumentId`) réimporté avec un contenu
  **strictement identique** (checksum SHA-256) réutilise le Document/DocumentVersion déjà produits
  — aucune requête dupliquée automatique/retentée ne crée de doublon. Un contenu réellement modifié
  côté provider produit une nouvelle version du **même** document (jamais un second Document).
- **Export** (`ExternalFileExportRecord`) : le même
  (`DocumentVersion`+connexion+container+dossier+nom de fichier) réexporté vers la destination
  exacte réutilise le fichier distant déjà obtenu, sans second upload — utile en particulier après
  un timeout réseau côté TenderOS alors que l'upload provider avait en réalité réussi.
- **Calendrier** (`CalendarSyncedEvent`, Sprint 19) : un second appel pour la même échéance renvoie
  l'événement déjà créé (`alreadyExisted: true`), jamais un doublon distant.

## 9. Autorisations

- `ConnectorPermission` : `Manage` (connecter/réautoriser/déconnecter, OWNER/ORGANIZATION_ADMIN
  uniquement), `Read` (lister/naviguer/tester, Contributor+), `DocumentImport`/`DocumentExport`
  (Contributor+).
- `allowedClientAccountIds` sur `ExternalConnection` : narrowing **strict**, jamais un
  élargissement — vide = pas de restriction, non-vide = la connexion ne peut servir que pour ces
  clients précis, y compris pour la simple navigation (pas seulement import/export).
- La cible métier (Tender/Document/ClientAccess) reste entièrement vérifiée par les modules
  `documents`/`tenders` existants (jamais dupliqué dans `connectors`).

## 10. Limites connues (résiduelles, documentées volontairement plutôt que masquées)

- Un provider mal configuré (variable d'environnement manquante) échoue avec une erreur 500 non
  typée au moment de la première tentative d'usage — jamais un crash global ni un impact sur
  l'autre provider, mais pas encore un message métier "provider non configuré" dédié.
- Upload simple limité à 20 Mo (`MAX_SIMPLE_UPLOAD_BYTES`) — les sessions d'upload par chunks
  (fichiers plus volumineux) ne sont pas implémentées ce sprint.
- Aucun logging technique structuré (provider/operation/connectionId/duration/status) n'existe
  encore — volontairement différé (mission Sprint 21, observabilité globale). Absence de logs
  signifie aussi absence de risque de fuite de token via un logger, vérifié explicitement.
- Outlook Mail (envoi), Gmail Send, Teams, connexions personnelles (`PERSONAL`), synchronisation
  bidirectionnelle complexe : hors périmètre, non implémentés (mission §120).
- Pas de résolution automatique de conflit (modification simultanée locale/distante) — au-delà de
  la détection de base (checksum), l'arbitrage reste manuel.

## 11. Dépannage rapide

| Symptôme | Cause probable |
|---|---|
| `REAUTH_REQUIRED` après un test de connexion | Refresh token révoqué côté admin M365/Google, ou expiré | 
| Import bloqué en 404 `EXTERNAL_CONNECTION_CLIENT_NOT_ALLOWED` | Connexion restreinte (`allowedClientAccountIds`) à un autre client que celui du Tender ciblé |
| Réponse 429 côté TenderOS après un appel provider | Provider en rate-limiting — nouvel essai après quelques secondes (le `Retry-After` est déjà propagé en header HTTP) |
| Export retenté ne crée aucun nouveau fichier distant | Comportement attendu — idempotence (§8), pas une erreur |
