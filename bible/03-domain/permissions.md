# TenderOS — Permissions & Access Control

Version : 1.0
Statut : Draft
Propriétaires : Product, Security & Engineering

Ce document définit précisément les droits d'accès dans TenderOS.

Le modèle recommandé combine :

- **RBAC** : permissions selon le rôle ;
- **contrôle contextuel** : permissions selon le Workspace, la ressource et son état ;
- **moindre privilège** : aucun accès inutile ;
- **isolation stricte** entre organisations.

---

## 1. Objectif

Ce document définit :

- les rôles ;
- les permissions ;
- les périmètres d'accès ;
- les règles contextuelles ;
- les actions sensibles ;
- les règles applicables aux utilisateurs externes ;
- les exigences d'audit.

Toute API, interface, Skill ou Agent IA doit appliquer ces règles côté serveur.

L'interface ne constitue jamais une barrière de sécurité suffisante.

---

## 2. Principes fondamentaux

### PERM-001 — Refus par défaut

Toute action est interdite tant qu'elle n'est pas explicitement autorisée.

```text
Default = DENY
```

### PERM-002 — Isolation par organisation

Un utilisateur ne peut accéder qu'aux données des organisations auxquelles il appartient.

Toutes les requêtes métier doivent être filtrées par `organizationId`.

Une ressource ne doit jamais être chargée uniquement avec son identifiant global.

```typescript
// Incorrect
findWorkspaceById(workspaceId);

// Correct
findWorkspace({
  workspaceId,
  organizationId
});
```

### PERM-003 — Contrôle côté serveur

Les permissions doivent être vérifiées dans :

- l'API ;
- les commandes métier ;
- les workers ;
- les consommateurs d'événements ;
- les Agents IA ;
- les exports ;
- les recherches ;
- les téléchargements de fichiers.

Masquer un bouton dans l'interface ne suffit pas.

### PERM-004 — Moindre privilège

Chaque utilisateur reçoit uniquement les permissions nécessaires à sa fonction.

### PERM-005 — Accès explicite aux Workspaces

L'appartenance à une Organization ne donne pas nécessairement accès à tous ses Workspaces.

L'accès peut être limité à : toute l'organisation ; certains Workspaces ; certaines ressources ; une durée déterminée.

### PERM-006 — Permissions cumulatives contrôlées

Un utilisateur peut recevoir des permissions depuis : son rôle d'organisation ; son rôle dans un Workspace ; une permission exceptionnelle temporaire.

Une interdiction explicite de sécurité prévaut sur une permission générale.

### PERM-007 — Vérification de l'état métier

Une permission ne suffit pas toujours. L'action peut aussi dépendre : du statut du Tender ; du statut du Workspace ; du statut de la Proposal ; de l'existence d'une approbation ; de la date limite ; de la présence d'erreurs bloquantes.

### PERM-008 — Traçabilité

Toute action sensible doit enregistrer : l'utilisateur ; l'organisation ; la ressource ; l'action ; la date ; le résultat ; le contexte ; la justification éventuelle.

---

## 3. Modèle d'autorisation

Une autorisation doit être calculée à partir de plusieurs dimensions.

```text
Utilisateur
    +
Organisation
    +
Rôle d'organisation
    +
Rôle dans le Workspace
    +
Permission demandée
    +
Ressource
    +
État métier
    +
Règles de confidentialité
    +
Restrictions temporaires
    =
Décision d'autorisation
```

Forme conceptuelle :

```typescript
interface AuthorizationContext {
  userId: string;
  organizationId: string;

  organizationRoles: string[];
  workspaceRoles?: string[];

  permission: string;

  resourceType: string;
  resourceId?: string;

  workspaceId?: string;
  resourceStatus?: string;
  confidentialityLevel?: string;

  currentTime: string;
}
```

Résultat :

```typescript
interface AuthorizationDecision {
  allowed: boolean;
  reasonCode: string;
  matchedPolicies: string[];
}
```

---

## 4. Rôles d'organisation

### Owner

Propriétaire de l'organisation — exactement un membre actif à la fois (`bible/03-domain/business-rules.md` BR-ORG-002). Dispose de toutes les permissions d'`Organization Admin`, plus des actions réservées : suppression de l'organisation ; transfert de propriété. Le rôle `OWNER` ne peut jamais être attribué par un changement de rôle ordinaire (`organization:role:assign`) — uniquement par le cas d'usage dédié de transfert de propriété (BR-ORG-004).

### Organization Admin

Responsable de l'administration globale. Peut notamment : gérer les membres ; gérer les rôles ; configurer les intégrations ; gérer l'abonnement ; accéder aux paramètres de sécurité ; définir les politiques de l'organisation ; consulter les Audit Logs selon les droits accordés.

Ce rôle ne donne pas automatiquement le droit d'approuver une Proposal.

### Bid Manager

Responsable du pilotage des appels d'offres. Peut notamment : qualifier un Tender ; enregistrer une décision Go / No-Go ; créer un Workspace ; gérer son équipe ; planifier la réponse ; lancer les analyses IA ; préparer le dossier final.

### Contributor

Participe à la production de la réponse. Peut notamment : consulter les ressources autorisées ; rédiger ; modifier des brouillons ; ajouter des documents ; réaliser des tâches ; commenter.

### Reviewer

Responsable de la relecture. Peut notamment : consulter la Proposal ; ajouter des commentaires ; demander des modifications ; terminer une Review.

### Approver

Responsable de l'approbation formelle. Peut notamment : approuver une Proposal ; approuver certaines dérogations ; autoriser la création du Submission Package ; valider le passage à l'étape suivante.

### Executive

Dispose d'une vision stratégique. Peut notamment : consulter les dashboards ; consulter les risques ; participer aux décisions Go / No-Go ; approuver les dérogations importantes ; consulter les résultats financiers autorisés.

### External Consultant

Utilisateur externe avec accès limité. Son accès doit être : explicitement accordé ; limité à un périmètre ; limité dans le temps si possible ; audité ; révocable immédiatement.

### Read Only

Peut consulter les données autorisées sans les modifier.

---

## 5. Rôles de Workspace

Un utilisateur peut avoir un rôle différent dans chaque Workspace.

- **Workspace Owner** — Responsable principal de l'espace. Peut : gérer les membres ; modifier les paramètres ; attribuer les responsabilités ; lancer les workflows ; archiver le Workspace selon les règles.
- **Workspace Bid Manager** — Pilote opérationnel du Workspace.
- **Workspace Contributor** — Produit les contenus et réalise les tâches.
- **Workspace Reviewer** — Effectue les revues.
- **Workspace Approver** — Effectue les approbations.
- **Workspace Observer** — Accès en lecture seule.
- **Workspace External Contributor** — Accès limité aux ressources explicitement partagées.

---

## 6. Convention des permissions

Format :

```text
<resource>:<action>
```

Exemples :

```text
tender:read
tender:qualify
workspace:create
proposal:update
proposal:approve
submission:record
```

Pour une action spécifique :

```text
workspace:member:add
compliance:waiver:approve
organization:settings:update
```

---

## 7. Permissions Organization

**Lecture**

```text
organization:read
organization:profile:read
organization:settings:read
organization:subscription:read
organization:audit-log:read
```

**Modification**

```text
organization:update
organization:profile:update
organization:settings:update
organization:subscription:update
```

**Membres**

```text
organization:member:list
organization:member:invite
organization:member:update
organization:member:suspend
organization:member:remove
organization:role:assign
organization:role:remove
```

**Sécurité**

```text
organization:security:read
organization:security:update
organization:api-key:create
organization:api-key:revoke
organization:sso:configure
```

---

## 8. Permissions Tender

```text
tender:list
tender:read
tender:import
tender:update
tender:shortlist
tender:qualify
tender:go-no-go:record
tender:go-no-go:override
tender:watch
tender:archive
tender:export
```

**Règles contextuelles**

- *Qualification* — `tender:qualify` exige : un Tender actif ; une date limite non dépassée, sauf analyse historique ; l'accès à l'organisation concernée.
- *Décision Go / No-Go* — `tender:go-no-go:record` exige : une qualification ouverte ; un utilisateur autorisé ; une justification lorsque la décision est NO_GO.
- *Dérogation* — `tender:go-no-go:override` exige : une permission spécifique ; une justification ; un audit renforcé.

---

## 9. Permissions Workspace

```text
workspace:list
workspace:read
workspace:create
workspace:update
workspace:archive
workspace:restore
workspace:delete
workspace:export
```

**Membres**

```text
workspace:member:list
workspace:member:add
workspace:member:update
workspace:member:remove
workspace:role:assign
```

**Workflow**

```text
workspace:status:update
workspace:planning:update
workspace:deadline:update
workspace:submit-for-review
workspace:mark-ready-for-submission
```

**Règles**

- *Création* — `workspace:create` exige : une décision GO ; un Tender ou un lot valide ; un Bid Manager ; l'absence de Workspace actif équivalent.
- *Archivage* — `workspace:archive` exige : un rôle autorisé ; une confirmation ; une vérification des actions ouvertes ; une entrée d'audit.
- *Suppression* — La suppression définitive doit être réservée à des procédures administratives exceptionnelles. L'action normale est l'archivage.

---

## 10. Permissions DCE

```text
dce:read
dce:import
dce:update
dce:compare
dce:reanalyze
dce:export
```

**Documents de consultation**

```text
consultation-document:list
consultation-document:read
consultation-document:upload
consultation-document:classify
consultation-document:version:create
consultation-document:download
consultation-document:archive
```

**Règles** — Un utilisateur doit disposer : de l'accès au Workspace ; de l'accès au document ; de la permission correspondant à l'action.

Les documents RESTRICTED exigent une autorisation supplémentaire.

---

## 11. Permissions Company Brain

```text
company-brain:read
company-brain:search
company-brain:update
company-brain:admin
```

**Documents d'entreprise**

```text
company-document:list
company-document:read
company-document:upload
company-document:update
company-document:version:create
company-document:version:activate
company-document:download
company-document:archive
company-document:delete
```

**Références et certifications**

```text
company-reference:read
company-reference:create
company-reference:update
company-reference:approve

certification:read
certification:create
certification:update
certification:approve
```

**Règle essentielle** — Un membre externe ne doit pas accéder à l'ensemble du Company Brain par défaut. Il peut uniquement accéder : aux ressources explicitement partagées ; aux ressources nécessaires à son Workspace ; pendant la durée de son accès.

---

## 12. Niveaux de confidentialité

**INTERNAL** — Accessible aux membres autorisés de l'organisation.

**CONFIDENTIAL** — Accessible uniquement aux rôles et membres explicitement autorisés.

**RESTRICTED** — Accessible à un périmètre nominatif très limité. Téléchargement, export et utilisation par l'IA peuvent nécessiter des permissions distinctes.

**Permissions associées**

```text
document:internal:read
document:confidential:read
document:restricted:read

document:confidential:download
document:restricted:download

document:restricted:share
```

---

## 13. Permissions IA

```text
ai-analysis:read
ai-analysis:run
ai-analysis:invalidate
ai-analysis:delete

ai-copilot:use
ai-agent:execute
ai-output:approve
ai-output:reject

ai-settings:read
ai-settings:update
ai-prompt:manage
ai-model:configure
```

**Règles**

Un Agent IA agit avec les permissions de l'utilisateur à l'origine de la demande.

```text
Permissions Agent ⊆ Permissions Utilisateur
```

L'Agent ne peut jamais élargir son propre périmètre.

- *Actions IA en lecture* (résumer un Tender, rechercher dans les documents autorisés, comparer deux versions, extraire les exigences) — peuvent être exécutées directement si l'utilisateur est autorisé.
- *Actions IA avec modification* (créer des tâches, générer une nouvelle Proposal Version, ajouter des Checklist Items, modifier un planning) — nécessitent une permission d'écriture, une indication claire des changements, une traçabilité.
- *Actions IA sensibles* (approuver une Proposal, accorder une dérogation, supprimer un document, enregistrer une soumission, inviter un utilisateur, modifier des permissions) — nécessitent une confirmation humaine explicite. Certaines actions, comme l'approbation formelle, ne doivent jamais être réalisées automatiquement par l'IA.

---

## 14. Permissions Proposal

```text
proposal:list
proposal:read
proposal:create
proposal:update
proposal:version:create
proposal:generate
proposal:submit-for-review
proposal:review
proposal:request-changes
proposal:approve
proposal:lock
proposal:unlock
proposal:archive
proposal:export
```

**Règles contextuelles**

- *Modification* — `proposal:update` est autorisée uniquement si la Proposal est `DRAFT`, `IN_PROGRESS` ou `CHANGES_REQUESTED`. Une Proposal `APPROVED` ou `LOCKED` ne peut pas être modifiée directement.
- *Relecture* — `proposal:review` exige : le rôle Reviewer ou une permission équivalente ; une Proposal au statut `IN_REVIEW`.
- *Approbation* — `proposal:approve` exige : une Proposal relue ; aucun commentaire bloquant ouvert ; une conformité acceptable ; un utilisateur autorisé ; une éventuelle séparation entre auteur et approbateur.
- *Verrouillage* — `proposal:lock` exige une version approuvée.

---

## 15. Séparation des responsabilités

Selon la politique de l'organisation, TenderOS doit pouvoir interdire qu'une même personne :

- rédige et approuve seule une Proposal ;
- demande et approuve sa propre dérogation ;
- prépare et valide seule un Submission Package ;
- modifie et audite ses propres permissions.

Règle :

```text
Maker ≠ Checker
```

Cette séparation peut être : obligatoire ; recommandée ; désactivée pour les petites structures.

---

## 16. Permissions Tasks

```text
task:list
task:read
task:create
task:update
task:assign
task:status:update
task:complete
task:cancel
task:delete
```

**Règles** — Un utilisateur peut modifier une tâche lorsque : il en est responsable ; il est contributeur ; il gère le Workspace ; il possède une permission administrative.

Un responsable ne doit pas pouvoir supprimer silencieusement une tâche bloquante imposée par la conformité.

---

## 17. Permissions Collaboration

```text
comment:read
comment:create
comment:update-own
comment:delete-own
comment:moderate
comment:resolve

mention:create
activity:read
```

**Règles** — Un commentaire modifié doit conserver son historique lorsque la traçabilité est nécessaire.

Un commentaire bloquant ne peut être résolu que par : son auteur ; un Reviewer ; un Bid Manager ; un utilisateur autorisé.

---

## 18. Permissions Compliance

```text
compliance:read
compliance:run
compliance:update
compliance:issue:resolve
compliance:waiver:request
compliance:waiver:approve
compliance:waiver:reject
compliance:report:export
```

**Règles** — Une erreur bloquante ne peut pas être ignorée sans : permission spécifique ; justification ; approbation ; Audit Log.

La personne demandant une dérogation ne doit pas nécessairement pouvoir l'approuver.

---

## 19. Permissions Submission

```text
submission-package:read
submission-package:prepare
submission-package:generate
submission-package:validate
submission-package:download
submission-package:approve

submission:read
submission:record
submission:evidence:upload
submission:evidence:read
submission:correct
```

- *Préparation du package* — Exige : Proposal approuvée ; conformité acceptable ; accès à tous les documents inclus.
- *Enregistrement de la soumission* — `submission:record` exige : un package final valide ; une date et une heure ; une plateforme ; une preuve ou une justification de son absence ; une confirmation humaine.
- *Correction* — Une soumission enregistrée ne doit pas être modifiée directement. Une correction crée un nouvel enregistrement lié au précédent.

---

## 20. Permissions Outcome et Analytics

```text
outcome:read
outcome:record
outcome:update
award:read
award:record

analytics:workspace:read
analytics:organization:read
analytics:financial:read
analytics:export
```

Les données financières peuvent être restreintes à : Executive ; Organization Admin ; rôles explicitement autorisés.

---

## 21. Permissions d'export

Les exports doivent avoir leurs propres permissions.

```text
tender:export
workspace:export
document:download
proposal:export
submission-package:download
analytics:export
audit-log:export
```

Un utilisateur autorisé à consulter une ressource n'est pas automatiquement autorisé à l'exporter.

---

## 22. Consultant externe

**Accès par défaut** — Un External Consultant ne peut pas : consulter tous les Workspaces ; parcourir tout le Company Brain ; voir les paramètres de l'organisation ; gérer les membres ; voir l'abonnement ; consulter les Audit Logs globaux ; exporter massivement les données.

**Accès autorisable** — Il peut recevoir : l'accès à un ou plusieurs Workspaces ; l'accès à certaines sections ; l'accès à certains documents ; la permission de commenter ; la permission de modifier certains brouillons ; des tâches spécifiques.

**Durée** — Chaque accès externe devrait pouvoir définir `startsAt` / `expiresAt`. À expiration : l'accès est automatiquement révoqué ; les sessions actives sont invalidées si nécessaire ; l'événement est audité.

---

## 23. Liens de partage

TenderOS peut supporter des liens de partage contrôlés.

Un lien doit préciser : la ressource ; les actions autorisées ; la date d'expiration ; le nombre éventuel d'utilisations ; la protection par code ou authentification ; la possibilité de téléchargement ; l'organisation émettrice.

Les liens publics permanents sont interdits pour les données confidentielles.

---

## 24. Actions nécessitant une confirmation

- retirer un membre ;
- modifier un rôle ;
- archiver un Workspace ;
- supprimer une ressource ;
- invalider une analyse ;
- verrouiller ou déverrouiller une Proposal ;
- approuver une dérogation ;
- générer le package final ;
- enregistrer une soumission ;
- exporter des données sensibles ;
- révoquer une clé API.

La confirmation doit décrire les conséquences.

---

## 25. Actions nécessitant une authentification renforcée

Selon la configuration de l'organisation, une authentification récente ou un second facteur peut être exigé pour :

- modifier les paramètres de sécurité ;
- gérer le SSO ;
- créer une clé API ;
- changer les rôles administrateurs ;
- exporter les données de l'organisation ;
- consulter des documents RESTRICTED ;
- approuver le dossier final ;
- supprimer définitivement des données.

---

## 26. Matrice simplifiée des rôles

| Action | Admin | Bid Manager | Contributor | Reviewer | Approver | Executive | External | Read Only |
|---|---|---|---|---|---|---|---|---|
| Consulter Tender | Oui | Oui | Selon accès | Oui | Oui | Oui | Selon accès | Oui |
| Qualifier Tender | Configurable | Oui | Contribuer | Consulter | Consulter | Oui | Non | Non |
| Décider Go / No-Go | Configurable | Oui | Non | Non | Oui | Oui | Non | Non |
| Créer Workspace | Oui | Oui | Non | Non | Non | Non | Non | Non |
| Importer DCE | Oui | Oui | Oui | Non | Non | Non | Selon accès | Non |
| Lancer analyse IA | Oui | Oui | Oui | Oui | Oui | Oui | Selon accès | Non |
| Rédiger Proposal | Configurable | Oui | Oui | Non | Non | Non | Selon accès | Non |
| Relire Proposal | Configurable | Oui | Non | Oui | Oui | Non | Selon accès | Non |
| Approuver Proposal | Non par défaut | Configurable | Non | Configurable | Oui | Configurable | Non | Non |
| Accorder dérogation | Configurable | Configurable | Non | Non | Oui | Oui | Non | Non |
| Générer package | Configurable | Oui | Non | Vérifier | Oui | Non | Non | Non |
| Enregistrer dépôt | Configurable | Oui | Non | Non | Configurable | Non | Non | Non |
| Gérer utilisateurs | Oui | Non | Non | Non | Non | Non | Non | Non |
| Voir données financières | Configurable | Configurable | Non | Non | Configurable | Oui | Non | Non |

Cette matrice est une base et doit rester configurable selon la politique de l'organisation.

---

## 27. Permissions par statut

**Workspace ARCHIVED**

- Autorisé : lecture ; export selon permission ; restauration ; consultation de l'historique.
- Interdit par défaut : modification ; création de tâches ; génération de contenu ; changement de Proposal.

**Workspace SUBMITTED**

- Autorisé : consultation ; ajout du résultat ; capitalisation ; ajout de pièces de preuve.
- Restreint : modification du dossier soumis ; remplacement de la Proposal utilisée ; modification de la preuve de dépôt.

**Proposal LOCKED**

- Autorisé : lecture ; export ; création d'une nouvelle version dérivée.
- Interdit : modification directe ; suppression ; remplacement silencieux.

---

## 28. Service Accounts

Les intégrations et workers utilisent des identités techniques dédiées.

```text
service-discovery-import
service-document-indexer
service-notification
agent-dce-analyzer
```

Chaque service doit posséder : des permissions minimales ; un périmètre défini ; des secrets rotatifs ; une traçabilité ; aucune identité utilisateur partagée.

---

## 29. API Keys

Une clé API doit être associée à : une Organization ; un propriétaire ; des scopes ; une date de création ; une date d'expiration éventuelle ; une dernière utilisation ; un statut.

Exemples de scopes :

```text
tenders:read
tenders:import
workspaces:read
documents:upload
```

Une clé API ne doit jamais disposer de permissions supérieures à son propriétaire sans autorisation spécifique.

---

## 30. Audit des décisions d'autorisation

Les refus sensibles peuvent être journalisés avec :

```text
userId
organizationId
permission
resourceType
resourceId
decision
reasonCode
timestamp
ipAddress
userAgent
```

Les logs ne doivent pas contenir de documents ou de données métier inutiles.

---

## 31. Codes de refus

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

L'API ne doit pas révéler inutilement l'existence d'une ressource inaccessible.

---

## 32. Modèle de données indicatif

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

**Resource Access Grant**

```typescript
interface ResourceAccessGrant {
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

## 33. Exemple de politique

```typescript
function canApproveProposal(
  context: AuthorizationContext,
  proposal: Proposal
): AuthorizationDecision {
  if (!context.organizationRoles.includes("APPROVER")) {
    return {
      allowed: false,
      reasonCode: "PERMISSION_MISSING",
      matchedPolicies: []
    };
  }

  if (proposal.status !== "IN_REVIEW") {
    return {
      allowed: false,
      reasonCode: "INVALID_RESOURCE_STATUS",
      matchedPolicies: []
    };
  }

  if (proposal.blockingCommentCount > 0) {
    return {
      allowed: false,
      reasonCode: "BLOCKING_ISSUES_PRESENT",
      matchedPolicies: []
    };
  }

  if (
    proposal.authorId === context.userId &&
    proposal.separationOfDutiesRequired
  ) {
    return {
      allowed: false,
      reasonCode: "SEPARATION_OF_DUTIES_REQUIRED",
      matchedPolicies: []
    };
  }

  return {
    allowed: true,
    reasonCode: "AUTHORIZED",
    matchedPolicies: [
      "proposal:approve",
      "proposal-status-policy",
      "separation-of-duties-policy"
    ]
  };
}
```

---

## 34. Tests obligatoires

Chaque permission sensible doit posséder :

- **Test d'autorisation** — L'utilisateur autorisé peut exécuter l'action.
- **Test de refus** — L'utilisateur sans permission reçoit un refus.
- **Test multi-tenant** — Un utilisateur ne peut jamais accéder à une ressource d'une autre organisation.
- **Test de statut** — Une action autorisée dans un statut est refusée dans un autre.
- **Test de confidentialité** — Une ressource RESTRICTED reste inaccessible sans permission explicite.
- **Test externe** — Un consultant externe ne dépasse jamais son périmètre.
- **Test d'expiration** — Un accès temporaire expiré est refusé.
- **Test de séparation des responsabilités** — Un utilisateur ne peut pas approuver sa propre action lorsque la politique l'interdit.
- **Test Agent IA** — Un Agent IA ne peut pas agir au-delà des permissions de l'utilisateur.

---

## 35. Critères d'acceptation

Le système de permissions est prêt lorsque :

- le refus par défaut est appliqué ;
- toutes les ressources sont isolées par Organization ;
- les contrôles sont réalisés côté serveur ;
- les permissions sont testées ;
- les accès Workspace sont contextuels ;
- les accès externes sont limités ;
- les actions IA respectent les droits utilisateur ;
- les actions sensibles sont auditées ;
- les statuts métier sont pris en compte ;
- les exports possèdent des permissions distinctes.
