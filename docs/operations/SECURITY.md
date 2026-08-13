# TenderOS — Pratiques de sécurité

> Sprint 21 (hardening). Décrit les mécanismes RÉELLEMENT implémentés et vérifiés par des tests
> réels (cross-tenant, IDOR, ClientAccess révoqué...) — jamais une checklist de conformité
> normative, jamais une certification ISO/SOC2 fictive (mission §102, explicitement hors périmètre).

## 1. Isolation multi-tenant

Toute entité métier porte `organizationId`. Chaque lecture/écriture scope explicitement sur
`(organizationId, id)` — jamais un `findById(id)` seul. Prouvé par des tests réels HTTP + PostgreSQL
dans chaque module (`*-http.integration.spec.ts`, recherche "cross-tenant") : une organisation B ne
peut jamais lire/modifier une ressource de l'organisation A, y compris en devinant un UUID exact
(anti-IDOR).

## 2. Isolation same-org cross-client (ClientAccess)

Au sein d'une même organisation, l'accès à un Tender/Document/Pricing/... passe par
`AssertClientAccessUseCase`, qui vérifie une affectation EXPLICITE de l'acteur à l'entreprise
candidate (`ClientAccount`) portant la ressource — un OWNER/ORGANIZATION_ADMIN a un accès global,
tout autre rôle (CONTRIBUTOR, VIEWER...) doit avoir une affectation réelle. Révoquer un accès
(suppression de l'affectation) bloque IMMÉDIATEMENT toute opération suivante, y compris pour
l'acteur qui a créé la ressource — jamais un accès hérité de la création.

## 3. RBAC (rôles d'organisation)

Chaque module définit sa propre matrice de permissions (`*-permission.ts`,
`assertHasXxxPermission`), jamais une vérification de rôle ad hoc dispersée dans les use cases.
Palier `MEMBER-tier` (CONTRIBUTOR et au-dessus) vs `READ-tier` (VIEWER/REVIEWER/EXTERNAL_CONSULTANT)
appliqué de façon cohérente entre modules.

## 4. Administration plateforme (back-office)

Distincte des rôles d'organisation — table `PlatformAdministrator` séparée, `PlatformAccessGuard`
dédié. Un OWNER/ORGANIZATION_ADMIN d'une organisation cliente n'obtient JAMAIS d'accès plateforme
automatiquement, y compris par manipulation HTTP directe. Capacités graduées
(`PlatformCapability` : `OrganizationsRead`, `OrganizationsSuspend`, `AuditLogsRead`,
`MetricsRead`...), SUPPORT reste en lecture seule.

## 5. Attribution mass-assignment

Chaque schéma Zod de corps de requête utilise `.strict()` (Sprint 21 — les deux derniers modules
sans cette protection, `pricing-schedule`/`response-package`, l'ont désormais) : un champ non
attendu dans le corps (`organizationId`, `status`, `validatedBy`...) fait échouer la requête (400)
plutôt que d'être silencieusement ignoré OU pire, accepté. Les champs réellement résolus par le
serveur (organisation de l'acteur, horodatages, identifiants générés) ne sont jamais lus depuis le
corps de la requête, quelle que soit la présence de `.strict()`.

## 6. IDOR (Insecure Direct Object Reference)

Tout endpoint prenant un identifiant en paramètre d'URL (`:id`, `:documentId`, `:versionId`...)
vérifie que la ressource appartient bien à l'organisation ET au périmètre client de l'acteur avant
toute lecture/écriture — jamais un `404` qui distinguerait "n'existe pas" de "appartient à un
autre tenant" (réponse uniforme, anti-énumération).

## 7. En-têtes de sécurité HTTP

- **API** (`apps/api`, JSON pur) : Helmet avec CSP désactivée explicitement (aucune page HTML
  rendue, une CSP n'a pas de cible utile ici) ; HSTS/X-Content-Type-Options/
  Cross-Origin-Resource-Policy actifs.
- **Web** (`apps/web`, Next.js) : CSP via `next.config.ts` (`default-src 'self'`, pas de script/
  style externe — aucune dépendance externe identifiée dans l'application), X-Frame-Options: DENY,
  Referrer-Policy, Permissions-Policy, HSTS en production uniquement.

## 8. CORS

Politique EXPLICITE (Sprint 21, `main.ts`) : `origin: false` (CORS complètement désactivé, aucun
en-tête `Access-Control-*` renvoyé). Justifié par l'architecture BFF — le navigateur n'appelle
jamais l'API directement, seul le serveur Next.js le fait (server actions), donc aucune requête
cross-origin légitime n'existe. À revisiter EXPLICITEMENT (jamais `origin: true`/`*`, jamais
`credentials: true` combiné à un wildcard) si un client navigateur direct devient un jour légitime.

## 9. Rate limiting

`/auth/login` et `/auth/register` : 10 requêtes/minute par IP (`AuthThrottlerGuard`, Sprint 21).
Le Public API (clés API) a sa propre limite indépendante (`ApiKeyThrottlerGuard`,
100 req/min/clé, Sprint 16). Chaque throttler a son propre stockage isolé (`ThrottlerModule.forRoot`
par module) — jamais un seul limiteur générique appliqué aveuglément à toute l'application.

## 10. Énumération de comptes

`/auth/register` renvoie un 409 distinct sur email déjà utilisé (choix délibéré, UX standard SaaS,
désormais mitigé par le rate limiting) — la seule exception assumée. `UserNotActiveError` (Sprint 21)
ne révèle plus le statut exact du compte (SUSPENDED/DEACTIVATED/INVITED...) dans le message HTTP,
seulement "compte non actif" — un attaquant disposant déjà d'un mot de passe valide pour un compte
inactif n'apprend rien de plus.

## 11. Secrets

- **Stockage** : clés API/credentials OAuth chiffrés en base (AES-GCM), jamais en clair. Une clé
  API brute n'est visible qu'au moment de sa création, jamais récupérable ensuite.
- **Logs** (Sprint 21) : `StructuredLoggerService` rédige automatiquement Authorization/cookies/
  clés API/tokens OAuth/secrets de webhook (voir `log-redaction.ts`) — mécanisme centralisé,
  jamais une discipline "au cas par cas" laissée à chaque appelant.
- **Inventaire** : aucun secret réel (clé API, mot de passe, token) n'est commité dans le dépôt —
  vérifié par recherche de motifs (`sk_`, `whsec_`, `Bearer `, `API_KEY=`, `SECRET=`) à chaque
  sprint touchant la configuration.

## 12. Webhooks sortants

Signature HMAC vérifiable indépendamment côté destinataire. Protection SSRF : `redirect: "manual"`
sur les requêtes sortantes (jamais de suivi de redirection automatique vers une cible interne),
validation de l'URL cible avant tout envoi (`webhook-url-safety.ts`).

## 13. Téléchargements de fichiers

Toute route de téléchargement re-vérifie l'autorisation à CHAQUE requête (jamais un lien
"pré-autorisé" qui resterait valide après une révocation d'accès) — jamais une `storageKey` fournie
par le client acceptée telle quelle sans revalidation côté serveur.

## 14. Exposition des données (DTO/présenteurs)

Chaque module utilise un présenteur explicite (`presentXxx`) qui liste EXPLICITEMENT les champs
exposés — jamais un passe-plat de l'entité complète. Exemple : `PlatformOrganizationResponse`
exclut délibérément `legalName`/`registrationNumber`/`settings` même si l'entité interne les porte.

## 15. Traçabilité (audit)

Toute action sensible (changement de rôle, ClientAccess, clé API, credentials de connexion,
validation finale, suspension d'organisation, suppression de milestone depuis le Sprint 21) écrit
une entrée `AuditLog`. Un utilisateur standard ne peut jamais modifier/supprimer un `AuditLog`
existant (aucune route d'écriture n'existe côté application).

## 16. Ce qui reste explicitement hors périmètre (mission §102)

Billing/Stripe, signature électronique de niveau juridique renforcé, certification SOC2/ISO27001
complète, SIEM/SOC interne, architecture active-active multi-région, Kubernetes non justifié par un
besoin réel. Documenté ici pour éviter toute ambiguïté — TenderOS ne prétend à aucune de ces
garanties à ce stade.
