# TenderOS — Security Patterns

Version : 1.0
Statut : Draft
Rôle concerné : Platform Foundation
Document parent : `skills/platform-foundation/SKILL.md`
Documents associés :

- `bible/03-domain/permissions.md` (règle d'autorité principale — ce document en est la traduction en patterns d'implémentation)
- `docs/04-architecture/ENGINEERING_STANDARDS.md` §46-52
- `docs/04-architecture/API_GUIDELINES.md` §12-14, §60-67, §81-83
- `bible/03-domain/business-rules.md` §20
- `skills/platform-foundation/ARCHITECTURE_RULES.md` §29
- `skills/platform-foundation/API_PATTERNS.md`
- `skills/platform-foundation/DATABASE_PATTERNS.md` §67-70
- `skills/platform-foundation/AI_PATTERNS.md` §33-35

---

## 1. Objectif

Ce document définit les patterns d'implémentation obligatoires pour la sécurité de TenderOS, toutes couches confondues.

Il traduit en patterns concrets (guards, policies, schémas) la doctrine déjà fixée par `bible/03-domain/permissions.md` (modèle d'autorisation) et `ENGINEERING_STANDARDS.md`/`API_GUIDELINES.md` (sécurité technique), qui restent les documents d'autorité sur les décisions de fond. Ce document ne redéfinit aucune règle métier de permission : il montre comment appliquer le modèle d'autorisation, l'authentification, la protection des secrets, la validation des entrées et l'audit dans le code, en cohérence avec `ARCHITECTURE_RULES.md` §29 et les conventions déjà fixées par `API_PATTERNS.md`.

Il précise notamment : le modèle d'autorisation et son implémentation (policies, guards) ; l'authentification et l'authentification renforcée ; l'isolation tenant ; les accès externes (consultants, liens de partage, API Keys, Service Accounts) ; l'audit ; la protection contre l'énumération ; les secrets ; la validation des entrées ; les uploads ; CORS/CSRF/headers ; la gestion des erreurs ; le logging sécurisé ; la minimisation des données personnelles ; les tests de sécurité obligatoires.

---

## 2. Documents d'autorité

Ordre de priorité pour toute question relative à la sécurité :

```text
1. PRODUCT_CONSTITUTION.md
2. bible/03-domain/business-rules.md §20
3. bible/03-domain/permissions.md
4. docs/04-architecture/API_GUIDELINES.md §12-14, §60-67, §81-83
5. docs/04-architecture/ENGINEERING_STANDARDS.md §46-52
6. docs/05-ai/AI_ARCHITECTURE.md §59-65, §89-92
7. skills/platform-foundation/ARCHITECTURE_RULES.md
8. skills/platform-foundation/API_PATTERNS.md
9. skills/platform-foundation/DATABASE_PATTERNS.md
10. skills/platform-foundation/AI_PATTERNS.md
11. skills/platform-foundation/SECURITY_PATTERNS.md   ← ce document
```

`bible/04-architecture/security.md` et le legacy `docs/architecture/security.md` sont **vides** — ils ne font pas autorité et ne doivent pas être consultés comme source.

---

## 3. Principes directeurs

```text
Default = DENY
Server-side authority, always
Least privilege by default
Explicit tenant scope everywhere
Business state matters as much as permission
Traceability for every sensitive action
Fail closed, never fail open
Secrets never leave their vault
Untrusted input everywhere at the boundary
Security is continuous, not a final review
```

Cohérent avec `permissions.md` PERM-001 à PERM-008.

---

## 4. Modèle d'autorisation — vue d'ensemble

```text
users
organizations
organization_memberships
roles
permissions
role_permissions
membership_roles

workspace_memberships
workspace_roles
workspace_role_permissions

resource_access_grants
external_access_grants
api_keys
authorization_audit_logs
```

Rôles d'organisation typiques : `Admin`, `Bid Manager`, `Contributor`, `Reviewer`, `Approver`, `Executive`, `External`, `Read Only` (`permissions.md` §26). Un rôle de Workspace peut restreindre davantage l'accès qu'un rôle d'organisation ne l'accorde — jamais l'inverse (§11).

---

## 5. Authentification

Toute route métier exige une identité authentifiée côté serveur (`API_GUIDELINES.md` §12, `API_PATTERNS.md` §16) :

```typescript
export interface AuthenticatedActor {
  actorId: string;
  sessionId: string;
  organizationId?: string;
  authenticationMethod: string;
  authenticatedAt: Date;
  strongAuthenticationAt?: Date;
}
```

Le token/session identifie l'acteur, jamais ses permissions complètes : les permissions métier ne sont pas encodées dans un token longue durée, elles sont résolues à chaque requête (`API_GUIDELINES.md` §12). Un compte suspendu ou désactivé est refusé même avec un token techniquement valide.

```text
Authentication → Who are you?
Membership → Which organization?
Authorization → What may you do?
Business Rule → Is the action valid now?
```

---

## 6. Chaîne d'autorisation

Chaque endpoint vérifie, dans cet ordre (`API_GUIDELINES.md` §13, repris par `API_PATTERNS.md` §17) :

```text
Authenticated identity
→ Organization membership
→ Role permissions
→ Workspace access
→ Resource policy
→ Business state
```

```typescript
await authorizationService.assertCan({
  actor,
  permission: "proposal:approve",
  resource: proposal,
});
```

Un contrôleur ne contient jamais toute la logique d'autorisation : il délègue à une policy dédiée, appelée depuis le use case (`ARCHITECTURE_RULES.md` §19.3).

---

## 7. Pattern — Policy d'autorisation

```typescript
export function canApproveProposal(
  context: AuthorizationContext,
  proposal: Proposal,
): AuthorizationDecision {
  if (!context.organizationRoles.includes("APPROVER")) {
    return { allowed: false, reasonCode: "PERMISSION_MISSING", matchedPolicies: [] };
  }

  if (proposal.status !== "IN_REVIEW") {
    return { allowed: false, reasonCode: "INVALID_RESOURCE_STATUS", matchedPolicies: [] };
  }

  if (proposal.blockingCommentCount > 0) {
    return { allowed: false, reasonCode: "BLOCKING_ISSUES_PRESENT", matchedPolicies: [] };
  }

  if (proposal.authorId === context.userId && proposal.separationOfDutiesRequired) {
    return { allowed: false, reasonCode: "SEPARATION_OF_DUTIES_REQUIRED", matchedPolicies: [] };
  }

  return {
    allowed: true,
    reasonCode: "AUTHORIZED",
    matchedPolicies: ["proposal:approve", "proposal-status-policy", "separation-of-duties-policy"],
  };
}
```

Une policy retourne toujours une décision explicite (`allowed`, `reasonCode`, `matchedPolicies`), jamais un simple booléen — le `reasonCode` alimente directement le code d'erreur API (§9) et l'audit (§20).

---

## 8. Guards NestJS vs Policies applicatives

Les guards vérifient des conditions génériques et rapides : authentification ; présence du tenant ; membership générale (`ARCHITECTURE_RULES.md` §19.3).

```typescript
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
@Controller("/api/v1/proposals")
export class ProposalCommandController {}
```

Les autorisations dépendant de la ressource, de son état, ou de règles de séparation des responsabilités restent dans une policy appelée par le use case (§7) — jamais entièrement dans un guard, qui n'a généralement pas accès à l'état métier complet de la ressource.

---

## 9. Catalogue des codes de refus

Format canonique (`permissions.md` §31), aligné sur le catalogue d'erreurs de `API_PATTERNS.md` §14 :

```text
AUTHENTICATION_REQUIRED
ORGANIZATION_ACCESS_DENIED
PERMISSION_MISSING
WORKSPACE_ACCESS_DENIED
RESOURCE_CONFIDENTIAL
RESOURCE_RESTRICTED
INVALID_RESOURCE_STATUS
SEPARATION_OF_DUTIES_REQUIRED
EXTERNAL_ACCESS_EXPIRED
STRONG_AUTHENTICATION_REQUIRED
DEADLINE_EXPIRED
BLOCKING_ISSUES_PRESENT
```

Un `reasonCode` de policy se mappe 1:1 vers un code d'erreur API ; aucun code local divergent n'est introduit ad hoc dans un module (`API_PATTERNS.md` §14 — même règle de catalogue centralisé).

---

## 10. Isolation tenant

Une ressource n'est jamais chargée avec son seul identifiant global (`permissions.md` PERM-002) :

```typescript
// Incorrect
findWorkspaceById(workspaceId);

// Correct
findWorkspace({ workspaceId, organizationId });
```

Cette règle s'applique dans toutes les couches — voir le détail complet dans `ARCHITECTURE_RULES.md` §28 et `DATABASE_PATTERNS.md` §14-15. Elle est rappelée ici car une violation de cette règle est systématiquement une faille de sécurité, pas seulement un défaut architectural.

---

## 11. Accès explicite aux Workspaces

L'appartenance à une Organization ne donne pas nécessairement accès à tous ses Workspaces (`permissions.md` PERM-005).

```typescript
await authorizationService.assertCan({
  actor,
  permission: "workspace:read",
  resource: workspace,
});
```

L'accès à un Workspace peut être limité à : toute l'organisation ; certains Workspaces ; certaines ressources ; une durée déterminée. Un rôle d'organisation élevé (`Admin`) n'implique pas automatiquement un accès à tous les Workspaces sans vérification explicite.

---

## 12. Vérification de l'état métier

Une permission accordée ne suffit pas toujours : l'action peut aussi dépendre du statut du Tender, du Workspace, de la Proposal, de l'existence d'une approbation, de la date limite, ou de la présence d'erreurs bloquantes (`permissions.md` PERM-007).

```typescript
if (proposal.status !== "IN_REVIEW") {
  return { allowed: false, reasonCode: "INVALID_RESOURCE_STATUS", matchedPolicies: [] };
}
```

Cette vérification reste dans la policy ou le Domain (`ARCHITECTURE_RULES.md` §6), jamais uniquement dans le frontend.

---

## 13. Moindre privilège et permissions cumulatives

Chaque utilisateur reçoit uniquement les permissions nécessaires à sa fonction (`permissions.md` PERM-004). Un utilisateur peut cumuler des permissions issues de son rôle d'organisation, de son rôle dans un Workspace, ou d'une permission exceptionnelle temporaire (`ResourceAccessGrant`, §14) — mais une interdiction explicite de sécurité prévaut toujours sur une permission générale (PERM-006).

```typescript
export interface ResourceAccessGrant {
  id: string;
  organizationId: string;
  subjectType: "USER" | "MEMBERSHIP" | "GROUP";
  subjectId: string;
  resourceType: string;
  resourceId: string;
  permissions: string[];
  startsAt?: string;
  expiresAt?: string;
  grantedBy: string;
  createdAt: string;
}
```

---

## 14. Consultant externe

Accès par défaut d'un `External Consultant` : **ne peut pas** consulter tous les Workspaces, parcourir tout le Company Brain, voir les paramètres de l'organisation, gérer les membres, voir l'abonnement, consulter les Audit Logs globaux, exporter massivement les données (`permissions.md` §22).

```typescript
export interface ExternalAccessGrant {
  organizationId: string;
  externalUserId: string;
  workspaceIds: string[];
  allowedActions: string[];
  startsAt: string;
  expiresAt: string;
}
```

À expiration : l'accès est automatiquement révoqué ; les sessions actives sont invalidées si nécessaire ; l'événement est audité (§20).

```typescript
export class RevokeExpiredExternalAccessWorker {
  async execute(): Promise<void> {
    const expired = await this.externalAccessRepository.findExpired();

    for (const grant of expired) {
      await this.externalAccessRepository.revoke(grant.id);
      await this.sessionManager.invalidateSessionsFor(grant.externalUserId);
      await this.auditWriter.write({ action: "external-access.expired", ...grant });
    }
  }
}
```

---

## 15. Liens de partage

Un lien de partage précise : la ressource ; les actions autorisées ; la date d'expiration ; le nombre éventuel d'utilisations ; la protection par code ou authentification ; la possibilité de téléchargement ; l'organisation émettrice (`permissions.md` §23).

```typescript
export interface ShareLink {
  id: string;
  organizationId: string;
  resourceType: string;
  resourceId: string;
  allowedActions: string[];
  expiresAt: string;
  maxUses?: number;
  accessCodeHash?: string;
  allowDownload: boolean;
}
```

Les liens publics permanents sont interdits pour les données confidentielles — un lien sans `expiresAt` sur une ressource `CONFIDENTIAL` ou `RESTRICTED` (§28) est une condition bloquante (§42).

---

## 16. Service Accounts

Les intégrations et workers utilisent des identités techniques dédiées, jamais une identité utilisateur partagée (`permissions.md` §28) :

```text
service-discovery-import
service-document-indexer
service-notification
agent-dce-analyzer
```

Chaque service possède : des permissions minimales ; un périmètre défini ; des secrets rotatifs ; une traçabilité propre. Un Service Account n'est jamais partagé entre plusieurs traitements aux responsabilités différentes.

---

## 17. API Keys

```typescript
export interface ApiKey {
  id: string;
  organizationId: string;
  ownerId: string;
  scopes: string[];
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
}
```

Exemples de scopes (`permissions.md` §29) — noter que les scopes d'API Key utilisent une notation **au pluriel**, distincte de la notation singulière des permissions fines (`tender:read`, §9 de `AI_PATTERNS.md` §35) : ils représentent un périmètre plus large, pas une permission unitaire.

```text
tenders:read
tenders:import
workspaces:read
documents:upload
```

Une clé API ne doit jamais disposer de permissions supérieures à celles de son propriétaire, sauf autorisation spécifique explicite. Une clé API sans `expiresAt` doit être une exception documentée, pas la valeur par défaut.

---

## 18. Authentification renforcée (step-up)

Selon la configuration de l'organisation, une authentification récente ou un second facteur peut être exigé pour (`permissions.md` §25) : modifier les paramètres de sécurité ; gérer le SSO ; créer une clé API ; changer les rôles administrateurs ; exporter les données de l'organisation ; consulter des documents `RESTRICTED` ; approuver le dossier final ; supprimer définitivement des données.

```typescript
export function requiresStrongAuthentication(
  action: SensitiveAction,
  actor: AuthenticatedActor,
): boolean {
  if (!STRONG_AUTH_ACTIONS.has(action)) return false;

  const maxAge = 15 * 60 * 1000;
  return (
    !actor.strongAuthenticationAt ||
    Date.now() - actor.strongAuthenticationAt.getTime() > maxAge
  );
}
```

Un refus produit `STRONG_AUTHENTICATION_REQUIRED` (§9) — le frontend redirige vers une ré-authentification plutôt que d'afficher une erreur générique.

---

## 19. Actions nécessitant une confirmation

Retirer un membre ; modifier un rôle ; archiver un Workspace ; supprimer une ressource ; invalider une analyse ; verrouiller/déverrouiller une Proposal ; approuver une dérogation ; générer le package final ; enregistrer une soumission ; exporter des données sensibles ; révoquer une clé API (`permissions.md` §24).

La confirmation décrit les conséquences côté frontend (`FRONTEND_PATTERNS.md` §21, §26) ; côté backend, ces actions restent soumises à la même chaîne d'autorisation que toute autre action — la confirmation est une mesure ergonomique, pas un contrôle de sécurité supplémentaire.

---

## 20. Audit des décisions d'autorisation

Les refus sensibles peuvent être journalisés avec (`permissions.md` §30) :

```typescript
export interface AuthorizationAuditLog {
  userId: string;
  organizationId: string;
  permission: string;
  resourceType: string;
  resourceId: string;
  decision: "ALLOWED" | "DENIED";
  reasonCode: string;
  timestamp: string;
  ipAddress: string;
  userAgent: string;
}
```

Les logs d'autorisation ne contiennent pas de documents ou de données métier — uniquement le fait de la décision.

---

## 21. Audit des actions métier sensibles

Distinct de l'audit d'autorisation (§20) : un Audit Log métier enregistre une action réellement exécutée, pas seulement une tentative. Endpoints concernés (`API_GUIDELINES.md` §60) : changement de rôle ; invitation ; téléchargement confidentiel ; approbation ; dérogation de conformité ; génération de package ; soumission ; accès administratif ; export de données.

```typescript
await this.auditWriter.write(
  {
    organizationId: command.organizationId,
    actorId: command.actorId,
    action: "proposal.approve",
    resourceType: "Proposal",
    resourceId: command.proposalId,
    occurredAt,
    correlationId: command.correlationId,
  },
  transaction,
);
```

L'audit est produit dans la même transaction que l'action métier lorsque cela est nécessaire (`ARCHITECTURE_RULES.md` §22, `MODULE_TEMPLATE.md` §37).

---

## 22. Protection contre l'énumération

Pour une ressource inexistante ou inaccessible, TenderOS retourne la même réponse afin de ne pas révéler son existence lorsque la distinction permettrait de découvrir des ressources d'une autre organisation (`API_GUIDELINES.md` §14, `API_PATTERNS.md` §17) :

```text
Ressource d'un autre tenant       → 404 TENDER_NOT_FOUND
Ressource du tenant, sans droit   → 403 PERMISSION_MISSING
```

Cette règle dépend du contexte et doit être appliquée de manière cohérente au sein d'un même module — ne pas mélanger `403` et `404` pour des cas équivalents entre deux endpoints du même module.

---

## 23. Rate limiting et quotas

Rappel de `API_PATTERNS.md` §27 : rate limiting générique (`RateLimit-*`, `Retry-After`, `RATE_LIMIT_EXCEEDED`) et quotas métier dédiés (`ORGANIZATION_STORAGE_QUOTA_EXCEEDED`, `AI_USAGE_QUOTA_EXCEEDED`).

Le rate limiting protège aussi contre l'énumération et le brute-force : un endpoint d'authentification, de vérification de code, ou de token à usage unique applique une limite plus stricte que les endpoints métier standards, avec verrouillage progressif après échecs répétés.

---

## 24. Secrets

Les secrets ne doivent jamais apparaître dans : Git ; les logs ; les erreurs API ; les événements ; les prompts ; les fixtures ; les captures d'écran ; la documentation ; les commentaires de code (`ENGINEERING_STANDARDS.md` §47).

```typescript
const EnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
});
```

Utiliser : variables d'environnement validées au démarrage (`SKILL.md` §38) ; Secret Manager ; credentials temporaires ; rotation planifiée. Tout secret exposé est considéré compromis et doit être immédiatement révoqué et remplacé, pas seulement supprimé du commit fautif.

---

## 25. Validation des entrées

Toutes les entrées sont non fiables : corps JSON ; paramètres de chemin ; query strings ; headers ; fichiers ; événements ; webhooks ; réponses externes ; sorties IA (`API_GUIDELINES.md` §65). La validation est effectuée avant le use case (`API_PATTERNS.md` §22) ; les règles métier restent ensuite appliquées dans le Domain ou l'Application.

```typescript
export const TenderIdParamSchema = z.object({
  tenderId: z.string().uuid(),
});
```

Un identifiant invalide produit une erreur de validation explicite, jamais transmis tel quel jusqu'à Prisma :

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The provided identifier is invalid.",
    "requestId": "...",
    "details": { "fields": [{ "path": "tenderId", "code": "INVALID_UUID" }] }
  }
}
```

Des limites de taille sont appliquées à : corps JSON ; fichiers ; nombre d'éléments d'une commande batch ; longueur des chaînes ; nombre de filtres ; profondeur JSON ; taille des webhooks (`API_GUIDELINES.md` §67).

---

## 26. Sécurité des uploads

Tout upload vérifie : permission ; tenant ; taille ; quota ; MIME type réel ; extension ; checksum ; antivirus ou malware scan ; destination de stockage ; nom de fichier sécurisé (`ENGINEERING_STANDARDS.md` §49).

```typescript
export async function validateUploadedFile(
  file: UploadedFileHandle,
): Promise<void> {
  const detectedMime = await detectRealMimeType(file.buffer);

  if (!ALLOWED_MIME_TYPES.has(detectedMime)) {
    throw new UnsupportedFileTypeError({ detectedMime });
  }

  if (detectedMime !== file.declaredContentType) {
    throw new MimeTypeMismatchError();
  }

  await this.antivirusScanner.scan(file.buffer);
}
```

Le nom fourni par l'utilisateur n'est jamais utilisé comme clé de stockage brute (`ENGINEERING_STANDARDS.md` §49) — voir le pattern de chemin tenant-scoped de `DATABASE_PATTERNS.md` §61 (`organizations/{organizationId}/documents/{documentId}/versions/{versionId}`).

---

## 27. CORS

La politique CORS est restrictive (`API_GUIDELINES.md` §62, `API_PATTERNS.md` §28) : origines connues uniquement ; méthodes nécessaires uniquement ; headers nécessaires uniquement ; credentials seulement lorsque requis.

```typescript
app.enableCors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE"],
});
```

`Access-Control-Allow-Origin: *` est interdit sur tout endpoint authentifié.

---

## 28. CSRF

Lorsque l'authentification utilise des cookies, les opérations modifiant l'état sont protégées contre le CSRF (`API_GUIDELINES.md` §63) : cookies `SameSite` ; token CSRF ; validation d'origine ; cookies `Secure` et `HttpOnly`.

```typescript
res.cookie("session", token, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
});
```

Avec un token Bearer hors cookie (approche privilégiée pour les clients API/mobile), le risque CSRF diffère mais les règles CORS (§27) restent nécessaires.

---

## 29. Headers de sécurité

```http
Content-Security-Policy: ...
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains
Permissions-Policy: ...
```

Les valeurs précises sont définies au niveau Edge ou application (`API_GUIDELINES.md` §64) et appliquées globalement, pas endpoint par endpoint.

---

## 30. Classification des erreurs

```text
DomainError
ApplicationError
AuthorizationError
ValidationError
InfrastructureError
ExternalServiceError
ConcurrencyError
```

Une erreur contient un code stable, un message utilisateur approprié, un identifiant de corrélation, des détails sûrs si nécessaire (`ENGINEERING_STANDARDS.md` §50). Elle n'expose jamais : stack trace ; SQL ; prompt interne ; token ; chemin de fichier privé ; configuration ; détail d'une autre organisation — cohérent avec `API_PATTERNS.md` §13.

---

## 31. Gestion des erreurs externes

Les intégrations externes utilisent : timeout ; retry limité ; backoff exponentiel ; circuit breaker si nécessaire ; classification des erreurs ; métriques ; identifiant de corrélation (`ENGINEERING_STANDARDS.md` §51).

```text
Ne jamais appliquer un retry aveugle sur une action non idempotente.
```

Un webhook sortant, un appel à un fournisseur IA (`AI_PATTERNS.md` §30), ou un appel à un service de paiement suivent la même discipline de résilience — aucune exception par fournisseur.

---

## 32. Logging sécurisé

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

Ne pas journaliser par défaut : corps complet ; tokens ; cookies ; contenu documentaire ; données personnelles inutiles ; URLs signées ; secrets (`API_GUIDELINES.md` §61, cohérent avec `SKILL.md` §36.1 et `AI_PATTERNS.md` §32).

---

## 33. Données sensibles dans les réponses

Ne pas retourner par défaut : adresses email inutiles ; informations de facturation ; données d'authentification ; clés de stockage ; URLs signées expirées ; prompts ; métadonnées internes ; notes confidentielles ; données d'une autre organisation (`API_GUIDELINES.md` §81).

Le Presenter (`API_PATTERNS.md` §32) contrôle explicitement chaque champ exposé — l'absence de liste blanche explicite est elle-même une faille potentielle, un DTO ne doit jamais être un simple passe-plat de l'entité complète.

---

## 34. APIs administratives

```text
/api/v1/admin/...
```

Nécessitent : une permission dédiée ; un audit renforcé ; une limitation stricte ; une protection contre l'énumération ; une documentation distincte ; aucun accès implicite par un rôle organisationnel standard (`API_GUIDELINES.md` §82). Un rôle `Admin` d'organisation n'accorde jamais automatiquement un accès aux routes `/admin` de la plateforme — ce sont deux périmètres distincts.

---

## 35. Impersonation

Toute fonctionnalité d'impersonation future doit : exiger une permission très restreinte ; afficher clairement l'état d'impersonation à l'écran ; être limitée dans le temps ; conserver l'acteur réel et l'acteur représenté dans chaque log ; créer un Audit Log ; interdire certaines opérations sensibles si nécessaire (`API_GUIDELINES.md` §83).

```typescript
export interface ImpersonationContext {
  realActorId: string;
  impersonatedActorId: string;
  startedAt: string;
  expiresAt: string;
  reason: string;
}
```

Non implémentée sans validation spécifique — décision de niveau 3 (`SKILL.md` §36).

---

## 36. Export de données

Un export volumineux est asynchrone (`API_GUIDELINES.md` §84, `API_PATTERNS.md` §23) :

```text
POST /exports
→ 202 Accepted
→ génération par worker
→ notification
→ téléchargement temporaire sécurisé
```

Applique : permissions ; tenant ; filtrage ; minimisation ; expiration ; audit ; chiffrement lorsque requis.

---

## 37. Chiffrement

Chiffrement en transit : TLS partout, aucune exception pour un environnement de production. Chiffrement au repos : selon la classification de la donnée (§38), géré par l'hébergeur (PostgreSQL, Object Storage) au minimum, chiffrement applicatif colonne par colonne pour les données très sensibles (`DATABASE_PATTERNS.md` §69) — sans inventer de système cryptographique interne.

---

## 38. Classification et confidentialité des données

```text
PUBLIC
INTERNAL
CONFIDENTIAL
RESTRICTED
```

Modèle général à quatre niveaux (`AI_ARCHITECTURE.md` §59), avec pour les documents spécifiquement trois niveaux utilisés en pratique — `Internal`, `Confidential`, `Restricted` (`business-rules.md` BR-DATA-002, `permissions.md` §12). La classification détermine : les permissions requises ; le stockage ; les logs ; le retrieval IA ; le fournisseur IA autorisé ; la région ; l'export ; la durée de conservation.

---

## 39. Résidence des données et IA

Rappel condensé de `AI_PATTERNS.md` §33-35 : un fournisseur IA non autorisé pour un niveau de confidentialité donné n'est jamais sélectionné par le Model Router ; les données ne sont jamais utilisées pour l'entraînement d'un modèle tiers sans accord contractuel explicite (`business-rules.md` BR-DATA-003). Ce document ne redéfinit pas ces règles, il rappelle qu'elles font partie intégrante de la posture de sécurité globale, pas d'un sujet IA isolé.

---

## 40. RGPD et minimisation des données personnelles

Le code applique le principe de minimisation : ne collecter, enregistrer ou transmettre que les données nécessaires (`ENGINEERING_STANDARDS.md` §48).

Droits à prévoir dans la conception (cohérent avec `DATABASE_PATTERNS.md` §102-106) : export des données d'une organisation (BR-DATA-001) ; suppression et droit à l'effacement, y compris pour les artefacts dérivés (chunks, embeddings, caches, résultats IA) ; durée de conservation configurable par type de donnée et exigence contractuelle (BR-DATA-004). Une donnée personnelle inutile à la fonctionnalité n'est jamais collectée « au cas où ».

---

## 41. Tests de sécurité obligatoires

Chaque permission sensible possède, a minima (`permissions.md` §34) :

```text
Test d'autorisation       — l'utilisateur autorisé peut exécuter l'action
Test de refus              — l'utilisateur sans permission reçoit un refus
Test multi-tenant           — aucun accès à une ressource d'une autre organisation
Test de statut               — action autorisée dans un statut, refusée dans un autre
Test de confidentialité       — une ressource RESTRICTED reste inaccessible sans permission explicite
Test externe                   — un consultant externe ne dépasse jamais son périmètre
Test d'expiration                — un accès temporaire expiré est refusé
Test de séparation des responsabilités — un utilisateur ne peut pas approuver sa propre action
Test Agent IA                       — un agent n'agit jamais au-delà des permissions de l'utilisateur
```

Complété par (`API_GUIDELINES.md` §92, `TESTING_PATTERNS.md` §31) : injection basique rejetée sans erreur serveur ; MIME falsifié rejeté ; upload sans antivirus bloqué ; endpoint admin inaccessible à un rôle standard ; secret absent des logs et des réponses d'erreur.

---

## 42. Anti-patterns interdits

```text
Permission vérifiée uniquement côté frontend
Ressource chargée par son seul identifiant global sans organizationId
Guard générique substitué à une policy nécessitant l'état de la ressource
Code de refus inventé hors du catalogue partagé
Distinction incohérente entre 403 et 404 pour des cas équivalents au sein d'un module
Secret en dur dans le code, une fixture, ou un commentaire
Stack trace, requête SQL ou détail d'une autre organisation exposé dans une erreur
Log contenant un token, un cookie, un document complet ou une URL signée
Upload accepté sans vérification du MIME réel ni antivirus
Nom de fichier utilisateur utilisé tel quel comme clé de stockage
CORS ouvert (*) sur une route authentifiée
Clé API sans expiration par défaut
Lien de partage permanent sur une ressource confidentielle ou restreinte
Impersonation implémentée sans validation de niveau 3
Retry aveugle sur une opération non idempotente
Donnée personnelle collectée sans besoin fonctionnel démontré
Audit absent sur une action classée comme sensible
```

---

## 43. Conditions bloquantes

La livraison doit être bloquée lorsque : une permission requise n'existe pas dans `permissions.md` ; une ressource tenant-scoped peut être chargée sans `organizationId` ; un secret apparaît dans le code, un log, ou une fixture ; une erreur expose un détail technique interdit (§30) ; un upload est accepté sans validation MIME/antivirus ; un endpoint admin est accessible sans permission dédiée ; un lien de partage sur une ressource confidentielle n'a pas d'expiration ; un test de sécurité obligatoire (§41) manque ou échoue ; une fonctionnalité d'impersonation est livrée sans approbation de niveau 3.

---

## 44. Definition of Ready

La conception d'une fonctionnalité sensible est prête lorsque : la ou les permissions requises sont identifiées dans `permissions.md` ; le tenant scope est explicite ; le niveau de confidentialité des données concernées est connu ; les codes de refus applicables sont identifiés ; la nécessité d'une authentification renforcée ou d'une confirmation est tranchée ; la stratégie d'audit est définie.

---

## 45. Definition of Done

Une fonctionnalité est sécurisée lorsque :

```text
Authorization chain fully enforced server-side
+
Tenant isolation verified by test
+
Permission denial matrix tested (permissions.md §34)
+
No secret, stack trace or cross-tenant data ever exposed
+
Uploads validated (MIME, checksum, antivirus)
+
Sensitive actions produce an audit trail
+
CORS, CSRF and security headers correctly configured
+
Rate limiting applied where relevant
+
Security tests pass in CI
```

---

## 46. Checklist de sécurité par type de changement

**Nouvel endpoint**

- [ ] Authentification requise et vérifiée.
- [ ] Chaîne d'autorisation complète appliquée côté serveur.
- [ ] Tenant scope explicite.
- [ ] Anti-énumération appliquée si pertinent.
- [ ] Entrées validées à la frontière.
- [ ] Codes d'erreur issus du catalogue partagé.

**Nouvelle permission**

- [ ] Permission documentée dans `permissions.md`.
- [ ] Notation `resource:action` respectée.
- [ ] Matrice de tests §41 complète.
- [ ] Audit prévu si l'action est sensible.

**Upload ou fichier**

- [ ] MIME réel vérifié.
- [ ] Antivirus exécuté.
- [ ] Checksum calculé.
- [ ] Nom de fichier non utilisé comme clé de stockage.
- [ ] URL signée courte, non loggée.

**Accès externe (consultant, lien, clé API)**

- [ ] Périmètre minimal explicite.
- [ ] Expiration définie.
- [ ] Révocation automatique implémentée.
- [ ] Audit de création et d'expiration.

**Données sensibles**

- [ ] Classification de confidentialité connue.
- [ ] Minimisation appliquée.
- [ ] Chiffrement approprié si requis.
- [ ] Politique de rétention définie.

---

## 47. Critères d'acceptation

Ce document est correctement appliqué lorsque :

- toute autorisation repose sur la chaîne complète définie par `permissions.md`, appliquée côté serveur sans exception ;
- aucune ressource tenant-scoped n'est accessible par son seul identifiant global ;
- les accès externes (consultant, lien de partage, clé API, service account) restent minimaux, expirables et audités ;
- aucun secret, stack trace ou donnée d'une autre organisation n'est jamais exposé dans une réponse ou un log ;
- les uploads sont systématiquement validés avant traitement ou indexation ;
- les actions sensibles produisent une piste d'audit exploitable ;
- la matrice de tests de permission (§41) est appliquée à chaque permission sensible ;
- les exemples de ce document restent cohérents avec `permissions.md`, `API_PATTERNS.md`, `DATABASE_PATTERNS.md` et `AI_PATTERNS.md` déjà rédigés.
