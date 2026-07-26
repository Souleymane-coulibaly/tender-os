# TenderOS — Database Patterns

Version : 1.0
Statut : Draft
Rôle concerné : Platform Foundation
Document parent : `skills/platform-foundation/SKILL.md`
Documents associés :

- `bible/04-architecture/system-architecture.md`
- `docs/04-architecture/DATABASE_DESIGN.md`
- `docs/04-architecture/ENGINEERING_STANDARDS.md`
- `skills/platform-foundation/ARCHITECTURE_RULES.md`
- `skills/platform-foundation/MODULE_TEMPLATE.md`

---

## 1. Objectif

Ce document définit les patterns obligatoires pour la conception, l'évolution et l'exploitation de la base de données TenderOS.

Il précise notamment : PostgreSQL ; Prisma ; le multi-tenancy ; la propriété des données ; les identifiants ; les contraintes ; les relations ; les transactions ; la concurrence ; l'idempotence ; l'Outbox ; l'audit ; les suppressions ; les index ; les migrations ; les performances ; les sauvegardes ; les tests ; les pratiques interdites.

La base de données est une garantie de cohérence supplémentaire.

Elle ne remplace pas : le Domain ; les règles métier ; les permissions applicatives ; l'isolation des modules ; la validation des entrées.

---

## 2. Technologie de référence

La base relationnelle principale de TenderOS est :

```text
PostgreSQL
```

L'ORM de référence est :

```text
Prisma
```

Prisma reste un détail d'Infrastructure.

Il ne doit jamais apparaître dans : le Domain ; les Commands ; les Queries publiques ; les résultats applicatifs ; les contrats API ; les événements publics ; les composants frontend.

---

## 3. Principes fondamentaux

Toute conception de données doit respecter :

```text
Explicit ownership
+
Tenant isolation
+
Database-enforced constraints
+
Safe migrations
+
Short transactions
+
Deterministic writes
+
Observable operations
+
Recoverable failures
+
Minimal data exposure
```

La base doit empêcher autant que possible : les références orphelines ; les doublons interdits ; les états structurellement impossibles ; les écritures inter-tenant ; les pertes silencieuses de données ; les mises à jour concurrentes non contrôlées.

---

## 4. Autorité des données

Chaque table possède un module propriétaire unique.

Exemple :

| Table | Module propriétaire |
|---|---|
| `organizations` | Organizations |
| `organization_memberships` | Memberships |
| `tenders` | Tenders |
| `documents` | Documents |
| `document_versions` | Documents |
| `proposals` | Proposals |
| `submissions` | Submissions |
| `audit_entries` | Audit |
| `outbox_events` | Platform |
| `ai_runs` | AI |

Seul le module propriétaire peut : créer les enregistrements ; modifier les enregistrements ; appliquer leurs transitions métier ; définir leur cycle de vie ; exécuter leurs suppressions métier.

Un autre module peut obtenir ces données par : un use case public ; une query publique ; une projection ; un événement ; un contrat autorisé.

Il ne doit pas écrire directement dans les tables d'un autre module.

---

## 5. Convention de nommage PostgreSQL

Les noms SQL utilisent : `snake_case`

Exemples :

```text
organizations
organization_memberships
tender_documents
document_versions
official_deadline
created_at
organization_id
```

Les noms doivent : exprimer le métier ; rester stables ; éviter les abréviations ambiguës ; être cohérents avec l'Ubiquitous Language.

Éviter :

```text
tbl_tender
tndr
data
items
objects
records
misc
```

---

## 6. Convention Prisma

Les modèles Prisma peuvent utiliser le PascalCase tout en mappant vers des tables SQL en snake_case.

Exemple :

```prisma
model Tender {
  id             String   @id @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  title          String
  reference      String
  status         String
  version        Int      @default(1)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  organization Organization @relation(
    fields: [organizationId],
    references: [id]
  )

  @@unique([organizationId, reference])
  @@index([organizationId, status])
  @@map("tenders")
}
```

Les mappings explicites facilitent : la lisibilité SQL ; les migrations ; l'exploitation ; les requêtes manuelles ; les changements futurs d'ORM.

---

## 7. Identifiants

Les entités principales utilisent par défaut des UUID.

Exemple :

```prisma
id String @id @db.Uuid
```

L'identifiant doit être généré côté application ou base selon une convention globale unique.

Recommandation initiale :

```text
UUID v7 ou UUID compatible avec l'infrastructure retenue
```

À défaut :

```text
UUID v4
```

Les identifiants : ne portent pas de signification métier ; ne sont pas recyclés ; ne changent pas ; ne sont pas séquentiels publiquement ; restent distincts des références métier.

Exemple :

```text
id = 7fbad99b-dcd7-4e92-96ca-4594984c1653
reference = AO-2026-001
```

---

## 8. Références métier

Une référence métier ne remplace pas l'identifiant technique.

Exemples :

```text
Tender.reference
Proposal.reference
Submission.reference
```

Les références peuvent être : saisies par l'utilisateur ; importées ; générées ; uniques dans un tenant ; uniques dans un périmètre spécifique.

Exemple de contrainte :

```prisma
@@unique([organizationId, reference])
```

La portée de l'unicité doit toujours être explicite.

---

## 9. Multi-tenancy

TenderOS utilise un multi-tenancy logique par organisation.

Les tables tenant-scoped doivent contenir `organization_id`.

Exemple :

```prisma
organizationId String @map("organization_id") @db.Uuid
```

Le tenant doit être propagé dans : les Commands ; les Queries ; les repositories ; les index ; les contraintes uniques ; les relations ; les événements ; les caches ; les objets stockés ; l'audit ; les logs.

---

## 10. Tables tenant-scoped

Une table tenant-scoped doit généralement respecter :

```text
id
organization_id
created_at
updated_at
```

et, selon le besoin :

```text
deleted_at
created_by
updated_by
version
```

Exemple :

```prisma
model Tender {
  id             String    @id @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  title          String
  status         String
  version        Int       @default(1)
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  @@index([organizationId])
  @@map("tenders")
}
```

---

## 11. Exceptions au tenant scope

Certaines tables peuvent être globales : configurations système ; catalogue de pays ; catalogue de devises ; définitions publiques ; migrations ; feature flags globales ; métadonnées techniques.

Toute table sans `organization_id` doit être justifiée.

Une table globale ne doit pas contenir silencieusement des données client.

---

## 12. Clés étrangères tenant-aware

Une clé étrangère simple garantit une relation technique, mais pas toujours l'égalité des tenants.

Exemple dangereux :

```text
proposal.organization_id = organisation A
proposal.tender_id = tender de l'organisation B
```

La prévention doit être assurée par une combinaison de : validation applicative ; repositories tenant-scoped ; contraintes composites lorsque possible ; tests d'isolation ; éventuellement triggers approuvés si aucune autre solution fiable n'existe.

Pattern recommandé lorsque pertinent :

```sql
UNIQUE (organization_id, id)
```

puis :

```sql
FOREIGN KEY (organization_id, tender_id)
REFERENCES tenders (organization_id, id)
```

Cela empêche une relation inter-tenant au niveau de PostgreSQL.

---

## 13. Relations composites

Exemple conceptuel SQL :

```sql
ALTER TABLE tenders
ADD CONSTRAINT tenders_organization_id_id_unique
UNIQUE (organization_id, id);

ALTER TABLE proposals
ADD CONSTRAINT proposals_tender_tenant_fk
FOREIGN KEY (organization_id, tender_id)
REFERENCES tenders (organization_id, id);
```

L'utilisation de relations composites doit être évaluée selon : les capacités Prisma ; la lisibilité ; la criticité ; le coût de migration ; le niveau de protection recherché.

Pour les relations critiques, la protection DB est privilégiée.

---

## 14. Repositories tenant-scoped

Pattern obligatoire :

```typescript
findById({
  organizationId,
  tenderId,
})
```

Pattern interdit :

```typescript
findById(tenderId)
```

Requête correcte :

```typescript
await prisma.tender.findFirst({
  where: {
    id: tenderId,
    organizationId,
    deletedAt: null,
  },
});
```

Requête à éviter :

```typescript
await prisma.tender.findUnique({
  where: {
    id: tenderId,
  },
});
```

sauf dans un composant technique strictement privé et immédiatement revalidé par tenant.

---

## 15. Absence de tenant implicite

Le tenant ne doit pas être obtenu silencieusement depuis : une variable globale ; un singleton mutable ; un `AsyncLocalStorage` non contrôlé ; le dernier utilisateur authentifié ; un contexte caché dans Prisma ; une valeur par défaut.

Un contexte de requête peut transporter le tenant, mais les signatures métier et repositories doivent rester explicites.

---

## 16. Contraintes de base de données

Les invariants structurels doivent être protégés par PostgreSQL lorsque possible.

Exemples : `NOT NULL` ; `UNIQUE` ; `FOREIGN KEY` ; `CHECK` ; type adapté ; taille raisonnable ; valeur par défaut sûre.

Exemple :

```sql
CHECK (version >= 0)
```

Exemple :

```sql
CHECK (official_deadline IS NULL OR official_deadline > created_at)
```

Une contrainte DB ne remplace pas un message métier clair.

L'application doit traduire l'erreur technique.

---

## 17. Champs obligatoires

Un champ est `NOT NULL` lorsqu'un enregistrement ne peut pas exister correctement sans lui.

Ne pas utiliser `NULL` pour représenter : une chaîne vide ; zéro ; `false` ; une valeur inconnue mais requise ; un état non encore traité lorsque cet état possède un sens métier.

Utiliser `NULL` lorsque : la valeur est réellement absente ; son absence est autorisée ; son absence est distincte d'une valeur vide.

---

## 18. Booléens

Les booléens sont réservés aux propriétés réellement binaires.

Bon exemple :

```text
is_active
is_confidential
```

Mauvais exemple :

```text
is_processed
```

si le traitement peut être :

```text
PENDING
RUNNING
SUCCEEDED
FAILED
CANCELLED
```

Dans ce cas, utiliser un statut explicite.

---

## 19. Statuts

Les statuts métier doivent être définis dans le Domain.

En base, ils peuvent être stockés comme texte contrôlé.

Exemple :

```text
NEW
QUALIFYING
SHORTLISTED
REJECTED
ARCHIVED
```

Privilégier :

```prisma
status String
```

avec validation Domain et contrainte DB éventuelle, plutôt qu'un enum PostgreSQL difficile à faire évoluer, sauf justification claire.

Une migration de statut doit définir : les anciennes valeurs ; les nouvelles valeurs ; la compatibilité ; le backfill ; le rollback.

---

## 20. Dates et heures

Toutes les dates techniques sont stockées en UTC.

Utiliser un type compatible timezone.

Exemples :

```text
created_at
updated_at
deleted_at
occurred_at
processed_at
```

Les échéances officielles doivent également conserver les informations nécessaires à leur interprétation métier.

Au niveau API :

```text
ISO 8601 avec offset explicite
```

Exemple :

```text
2026-10-15T15:00:00+02:00
```

La base peut stocker l'instant UTC et, lorsque nécessaire, `official_timezone` afin de préserver la signification légale ou métier.

---

## 21. Dates techniques

Chaque table importante doit généralement contenir `created_at` et `updated_at`.

Pattern recommandé :

```prisma
createdAt DateTime @default(now()) @map("created_at")
updatedAt DateTime @updatedAt @map("updated_at")
```

Il faut néanmoins connaître les limites de `@updatedAt`.

Pour les opérations critiques, le timestamp applicatif ou SQL peut être contrôlé explicitement afin que l'agrégat, l'audit, l'événement et la persistance partagent le même instant logique.

---

## 22. Montants

Les montants ne doivent jamais utiliser un type flottant binaire.

Utiliser `NUMERIC` ou `DECIMAL` avec une devise explicite.

Exemple :

```prisma
estimatedValue Decimal? @map("estimated_value") @db.Decimal(19, 4)
currency       String?  @db.Char(3)
```

Règles : précision explicite ; arrondi défini ; devise ISO ; calculs métier dans un Value Object ; aucune comparaison flottante approximative.

---

## 23. Pourcentages et scores

Un score doit définir : son intervalle ; sa précision ; son interprétation ; son origine.

Exemple :

```sql
qualification_score NUMERIC(5,2)
CHECK qualification_score BETWEEN 0 AND 100
```

Un score IA doit aussi indiquer : la version du modèle ; le Skill ; l'AI Run ; la date ; la méthode ; le statut de validation humaine.

---

## 24. Texte

Choisir le type selon le besoin réel.

Utiliser `VARCHAR(n)` pour une limite métier ou protocolaire claire.

Utiliser `TEXT` pour un contenu variable important.

Les limites doivent aussi être validées à la frontière API.

Exemples :

| Champ | Type possible |
|---|---|
| titre | `VARCHAR(500)` |
| référence | `VARCHAR(100)` |
| email | `VARCHAR(320)` |
| description | `TEXT` |
| contenu extrait | `TEXT` |
| code pays | `CHAR(2)` |
| devise | `CHAR(3)` |

---

## 25. JSON

`JSONB` est acceptable pour : métadonnées externes variables ; payloads d'événements ; résultats IA versionnés ; données d'intégration non autoritatives ; configuration structurée ; snapshots techniques.

`JSONB` ne doit pas devenir le stockage par défaut du Domain.

Éviter de stocker en JSON : les relations principales ; les statuts critiques ; les permissions ; les champs fréquemment filtrés ; les données devant recevoir des contraintes fortes.

Tout champ JSON important doit disposer : d'un schéma ; d'une version ; d'une validation ; d'une stratégie de migration.

---

## 26. Tableaux PostgreSQL

Les tableaux PostgreSQL doivent être utilisés avec prudence.

Ils sont acceptables pour : petites listes atomiques ; données sans relation ; valeurs peu modifiées.

Pour les relations métier, préférer une table dédiée.

Exemple : `tender_tags` plutôt qu'un tableau si les tags nécessitent : filtrage ; permissions ; statistiques ; métadonnées ; historique.

---

## 27. Relations un-à-plusieurs

Une relation doit appartenir clairement à un agrégat ou à une frontière métier.

Exemple :

```text
Tender
└── TenderSource
```

Définir : le propriétaire ; la cardinalité ; la suppression ; l'ordre éventuel ; les contraintes ; la taille maximale.

Ne pas charger automatiquement toutes les relations dans chaque requête.

---

## 28. Relations plusieurs-à-plusieurs

Une relation plusieurs-à-plusieurs métier doit utiliser une table explicite.

Exemple : `workspace_members` plutôt qu'une relation implicite Prisma si la relation contient : un rôle ; une date ; un créateur ; un statut ; des permissions ; un historique.

Exemple :

```prisma
model WorkspaceMember {
  organizationId String   @map("organization_id") @db.Uuid
  workspaceId    String   @map("workspace_id") @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  role           String
  joinedAt       DateTime @default(now()) @map("joined_at")

  @@id([workspaceId, userId])
  @@index([organizationId, userId])
  @@map("workspace_members")
}
```

---

## 29. Suppression physique

La suppression physique est adaptée aux données : temporaires ; reconstructibles ; sans obligation d'audit ; arrivées à expiration ; explicitement autorisées.

Exemples possibles : sessions d'upload expirées ; caches ; jobs techniques anciens ; tokens révoqués expirés ; données de preview temporaires.

Elle doit respecter : les dépendances ; la rétention ; l'audit ; la conformité ; les sauvegardes.

---

## 30. Soft delete

Le soft delete peut utiliser `deleted_at`, `deleted_by`, `deletion_reason`.

Il est utile lorsque : une restauration est nécessaire ; l'historique doit être conservé ; une suppression immédiate serait dangereuse ; des références historiques doivent subsister.

Il ne doit pas être appliqué automatiquement à toutes les tables.

---

## 31. Requêtes avec soft delete

Toute lecture courante doit filtrer `deleted_at IS NULL`.

Exemple :

```typescript
where: {
  organizationId,
  deletedAt: null,
}
```

Les accès aux données supprimées doivent passer par un use case explicite.

Éviter les middlewares Prisma cachés qui ajoutent automatiquement le filtre sans visibilité.

---

## 32. Unicité et soft delete

Une contrainte unique classique peut empêcher la réutilisation d'une valeur supprimée.

Exemple : `organization_id + reference`

Deux politiques possibles :

### 32.1 Politique A — La référence reste réservée

La contrainte unique inclut aussi les éléments supprimés.

### 32.2 Politique B — La référence peut être réutilisée

Utiliser un index unique partiel PostgreSQL :

```sql
CREATE UNIQUE INDEX tenders_active_reference_unique
ON tenders (organization_id, reference)
WHERE deleted_at IS NULL;
```

Ce type d'index peut nécessiter une migration SQL manuelle avec Prisma.

Le choix doit être documenté.

---

## 33. Suppression en cascade

`ON DELETE CASCADE` est accepté uniquement pour les données totalement subordonnées.

Exemples possibles : `upload_session_parts`, `temporary_processing_chunks`.

Éviter la cascade automatique sur : les données métier principales ; les audits ; les soumissions ; les décisions ; les documents légaux ; les événements.

La suppression d'une entité métier doit généralement passer par un workflow explicite.

---

## 34. Archivage

L'archivage est un état métier.

Il ne doit pas être confondu avec : soft delete ; suppression physique ; désactivation technique.

Exemple :

```text
status = ARCHIVED
```

Un Tender archivé peut rester : consultable ; auditable ; indexé différemment ; exclu des vues actives.

---

## 35. Historique

Les données nécessitant un historique peuvent utiliser : événements métier ; audit entries ; tables de versions ; snapshots ; append-only records.

Le choix dépend de l'objectif.

**Audit** répond à : *Qui a fait quoi, quand et sur quelle ressource ?*

**Version métier** répond à : *Quel était le contenu à cette version ?*

**Domain Event** répond à : *Quel fait métier s'est produit ?*

Ces concepts ne sont pas interchangeables.

---

## 36. Tables append-only

Certaines tables doivent être append-only : audit ; Outbox ; historique de statut ; AI Runs ; événements reçus ; tentatives de webhook ; enregistrements d'idempotence.

Les mises à jour doivent être limitées aux champs techniques nécessaires : statut de traitement ; nombre de tentatives ; date de publication ; erreur résumée.

Le contenu métier historique ne doit pas être réécrit silencieusement.

---

## 37. Audit

Structure conceptuelle :

```text
audit_entries
├── id
├── organization_id
├── actor_id
├── action
├── resource_type
├── resource_id
├── occurred_at
├── correlation_id
├── request_id
├── metadata
└── created_at
```

L'audit doit être : tenant-scoped ; immuable ; minimal ; consultable ; sécurisé ; lié à une action métier ; écrit dans la transaction lorsque nécessaire.

Ne pas stocker dans l'audit : mots de passe ; tokens ; contenu confidentiel complet ; clés API ; données personnelles inutiles ; documents entiers.

---

## 38. Outbox

Structure conceptuelle :

```text
outbox_events
├── id
├── organization_id
├── event_type
├── event_version
├── aggregate_type
├── aggregate_id
├── payload
├── occurred_at
├── correlation_id
├── status
├── attempt_count
├── available_at
├── published_at
├── last_error
└── created_at
```

États possibles :

```text
PENDING
PROCESSING
PUBLISHED
FAILED
DEAD_LETTER
```

---

## 39. Écriture Outbox

L'Outbox doit être écrite dans la même transaction que la modification métier.

```text
BEGIN
  Update aggregate
  Insert audit
  Insert Outbox event
COMMIT
```

Il est interdit de :

```text
Commit business data
→ Publish message directly
→ Hope publication succeeds
```

---

## 40. Lecture Outbox

Le publisher doit sélectionner les événements disponibles.

Pattern PostgreSQL recommandé :

```sql
SELECT *
FROM outbox_events
WHERE status = 'PENDING'
  AND available_at <= NOW()
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 100;
```

Cela permet plusieurs workers concurrents.

Le traitement doit rester : idempotent ; observable ; limité ; récupérable.

---

## 41. Idempotence

Structure conceptuelle :

```text
idempotency_records
├── id
├── organization_id
├── operation
├── idempotency_key
├── request_hash
├── status
├── result
├── resource_id
├── expires_at
├── created_at
└── completed_at
```

Contrainte :

```sql
UNIQUE (
  organization_id,
  operation,
  idempotency_key
)
```

Une clé déjà utilisée avec un autre `request_hash` produit un conflit.

---

## 42. Transactions

Une transaction protège une unité de cohérence.

Elle peut contenir : lecture verrouillée nécessaire ; modification d'agrégat ; audit ; Outbox ; idempotence ; projections transactionnelles locales.

Elle ne doit pas contenir : appel LLM ; email ; webhook ; upload objet ; appel HTTP ; traitement de fichier long ; attente utilisateur ; boucle non bornée.

---

## 43. Transaction courte

Une transaction doit : démarrer au plus tard ; terminer au plus tôt ; exécuter un nombre limité de requêtes ; éviter les appels distants ; verrouiller le moins possible ; posséder un timeout.

Un use case ne doit pas ouvrir une transaction avant une opération lente indépendante.

---

## 44. Transaction Manager

Le use case dépend d'un port abstrait.

```typescript
export interface TransactionManager {
  execute<T>(
    operation: (
      transaction: TransactionContext,
    ) => Promise<T>,
  ): Promise<T>;
}
```

Prisma reste dans l'adapter.

```typescript
export class PrismaTransactionManager
  implements TransactionManager
{
  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: TransactionRegistry,
  ) {}

  async execute<T>(
    operation: (
      transaction: TransactionContext,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (client) => {
      const context = this.registry.register(client);

      try {
        return await operation(context);
      } finally {
        this.registry.release(context);
      }
    });
  }
}
```

Le Domain et l'Application ne connaissent pas `Prisma.TransactionClient`.

---

## 45. Niveaux d'isolation

Le niveau d'isolation doit être choisi selon le problème.

Par défaut : `READ COMMITTED`

Peut convenir à la majorité des workflows avec : contraintes ; optimistic locking ; écritures atomiques.

Utiliser un niveau plus strict uniquement lorsqu'un risque réel existe.

Exemples : double allocation ; quota strict ; séquence métier critique ; réservation de ressource rare.

Toute utilisation de `SERIALIZABLE` doit gérer les retries de transaction.

---

## 46. Concurrence optimiste

Les agrégats fréquemment modifiés utilisent `version`.

Exemple :

```prisma
version Int @default(1)
```

Écriture :

```typescript
const result = await tx.tender.updateMany({
  where: {
    id: tenderId,
    organizationId,
    version: expectedVersion,
  },
  data: {
    status: nextStatus,
    version: {
      increment: 1,
    },
    updatedAt: occurredAt,
  },
});

if (result.count !== 1) {
  throw new PersistenceConcurrencyError();
}
```

Aucun dernier-write-wins silencieux pour les décisions critiques.

---

## 47. Verrouillage pessimiste

Un verrou pessimiste peut être utilisé lorsque : une ressource ne peut pas être modifiée simultanément ; l'opération est courte ; le risque de conflit est élevé ; l'optimistic locking entraînerait trop de retries.

Exemple :

```sql
SELECT *
FROM resources
WHERE organization_id = $1
  AND id = $2
FOR UPDATE;
```

Il doit être utilisé avec prudence pour éviter : deadlocks ; attente excessive ; réduction du débit ; transactions longues.

---

## 48. Deadlocks

Les opérations modifiant plusieurs ressources doivent les verrouiller dans un ordre stable.

Exemple : toujours trier les IDs avant les mises à jour.

En cas de deadlock PostgreSQL : rollback ; classification ; retry limité ; métrique ; log structuré.

Le retry ne doit pas masquer un défaut de conception récurrent.

---

## 49. Séquences métier

Une référence séquentielle métier ne doit pas dépendre de `COUNT(*) + 1`.

Pattern dangereux en concurrence.

Solutions possibles : séquence PostgreSQL ; table de compteurs verrouillée ; identifiant aléatoire ; service de génération dédié.

Exemple de compteur tenant-aware :

```text
organization_counters
├── organization_id
├── counter_type
├── current_value
└── updated_at
```

La génération doit être atomique.

---

## 50. Index

Un index doit correspondre à un besoin réel.

Créer un index pour : clés étrangères fréquemment jointes ; filtres réguliers ; tri de pagination ; unicité ; jobs ; Outbox ; recherches tenant-scoped.

Exemple :

```prisma
@@index([organizationId, status, createdAt])
```

Éviter : index sur chaque colonne ; index redondants ; index inutilisés ; index très larges sans justification.

---

## 51. Ordre des colonnes d'index

L'ordre dépend des requêtes.

Pour :

```sql
WHERE organization_id = ?
  AND status = ?
ORDER BY created_at DESC
```

index possible :

```text
(organization_id, status, created_at DESC)
```

Le tenant apparaît souvent en première position.

---

## 52. Index partiels

Les index partiels sont utiles pour les ensembles actifs.

Exemple :

```sql
CREATE INDEX tenders_active_by_status
ON tenders (
  organization_id,
  status,
  created_at DESC
)
WHERE deleted_at IS NULL;
```

Ils doivent être créés par migration SQL explicite lorsque Prisma ne les exprime pas correctement.

---

## 53. Index JSONB

Un index GIN sur JSONB est acceptable si des requêtes précises le justifient.

Exemple :

```sql
CREATE INDEX imported_sources_metadata_gin
ON imported_sources
USING GIN (metadata);
```

Ne pas indexer automatiquement tous les payloads JSON.

---

## 54. Recherche textuelle

La recherche simple peut initialement utiliser PostgreSQL.

Options : `ILIKE` pour des volumes faibles ; `pg_trgm` ; full-text search ; colonnes `tsvector` ; index GIN.

Exemple :

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX tenders_title_trgm
ON tenders
USING GIN (title gin_trgm_ops);
```

Le moteur externe ne doit être introduit qu'après démonstration d'un besoin.

---

## 55. Pagination

La pagination par curseur est préférée pour les grandes collections.

Exemple de tri stable :

```text
created_at DESC, id DESC
```

Condition de page suivante :

```sql
WHERE
  created_at < $cursor_created_at
  OR (
    created_at = $cursor_created_at
    AND id < $cursor_id
  )
```

Index correspondant :

```text
(organization_id, created_at DESC, id DESC)
```

---

## 56. Pagination offset

La pagination offset peut être utilisée pour : petites listes ; interfaces administratives simples ; données peu volumineuses ; besoins de navigation vers une page précise.

Elle devient coûteuse avec de grands offsets.

Toute API doit définir : limite par défaut ; limite maximale ; tri stable ; format du curseur ou numéro de page.

---

## 57. Requêtes N+1

Les requêtes N+1 doivent être détectées et éliminées.

Solutions : jointures ciblées ; requêtes batch ; `IN` ; DataLoader ; read models ; projections ; préchargement explicite.

Éviter les `include` Prisma massifs et non bornés.

---

## 58. Sélection minimale

Les queries doivent sélectionner uniquement les champs nécessaires.

Bon exemple :

```typescript
select: {
  id: true,
  title: true,
  status: true,
  officialDeadline: true,
}
```

Éviter :

```typescript
include: {
  organization: true,
  documents: true,
  proposals: true,
  auditEntries: true,
}
```

sans justification.

---

## 59. Taille des collections

Toute relation potentiellement grande doit être : paginée ; filtrée ; triée ; limitée.

Un agrégat ne doit pas charger des milliers d'enfants pour une modification locale.

Une relation volumineuse peut constituer : un agrégat séparé ; une projection ; une collection paginée.

---

## 60. Bulk operations

Les opérations de masse doivent : définir une limite ; être tenant-scoped ; être idempotentes ; éviter une transaction géante ; produire une progression ; gérer les échecs partiels ; être exécutées par batch.

Exemple : 500 enregistrements par batch.

La taille réelle doit être mesurée.

---

## 61. Données de fichiers

Le contenu binaire des documents ne doit pas être stocké dans PostgreSQL par défaut.

PostgreSQL conserve : l'identifiant ; l'`organization_id` ; la clé de stockage ; le nom ; le MIME type ; la taille ; le checksum ; la version ; le statut ; les métadonnées.

Le fichier est placé dans un stockage objet compatible S3.

---

## 62. Checksums

Chaque objet important doit pouvoir stocker `checksum_algorithm` et `checksum_value`.

Exemple : `SHA-256`

Le checksum aide à : détecter les doublons ; vérifier l'intégrité ; identifier une version ; sécuriser le processing ; éviter certains traitements répétés.

Il ne remplace pas l'antivirus.

---

## 63. Documents et versions

Pattern recommandé :

```text
documents
└── document_versions
```

`documents` représente l'identité logique.

`document_versions` représente les fichiers et contenus successifs.

Exemple :

```text
documents
├── id
├── organization_id
├── workspace_id
├── title
├── status
└── current_version_id

document_versions
├── id
├── organization_id
├── document_id
├── version_number
├── storage_key
├── checksum
├── processing_status
└── created_at
```

Contrainte :

```sql
UNIQUE (organization_id, document_id, version_number)
```

---

## 64. Traitements documentaires

Les extractions doivent être séparées du document autoritatif.

Exemples :

```text
document_processing_runs
document_pages
document_chunks
document_embeddings
```

Chaque traitement doit contenir : l'entrée ; la version ; le statut ; le modèle ; les erreurs ; les dates ; l'idempotency key ; le nombre de tentatives.

---

## 65. Embeddings

Les embeddings doivent être liés à : l'organisation ; la ressource ; la version du document ; le chunk ; le modèle d'embedding ; la dimension ; la date ; le statut.

Exemple conceptuel :

```text
document_embeddings
├── id
├── organization_id
├── document_chunk_id
├── embedding_model
├── embedding_version
├── vector
└── created_at
```

Une modification de modèle ne doit pas écraser silencieusement les embeddings précédents.

---

## 66. Données IA

Une sortie IA importante doit être persistée avec : `ai_run_id` ; Skill ; version du Skill ; modèle ; paramètres ; schéma de sortie ; statut de validation ; citations ; coût ; latence ; acteur ; tenant ; timestamps.

Le résultat IA ne devient pas automatiquement une vérité métier.

---

## 67. Données sensibles

Les tables et colonnes doivent être classées.

Catégories possibles :

```text
PUBLIC
INTERNAL
CONFIDENTIAL
RESTRICTED
```

Exemples :

| Donnée | Classification possible |
|---|---|
| titre d'un Tender | Internal |
| document de proposition | Confidential |
| token OAuth | Restricted |
| clé API | Restricted |
| audit d'action | Confidential |
| métrique agrégée anonyme | Internal |

La classification influence : accès ; logs ; sauvegardes ; rétention ; chiffrement ; export ; suppression.

---

## 68. Secrets

Les secrets ne doivent pas être stockés en clair dans les tables métier.

Utiliser : un gestionnaire de secrets ; des références ; un chiffrement applicatif approuvé ; une rotation.

Exemples : tokens OAuth ; secrets webhook ; credentials d'intégration ; clés privées.

Les mots de passe sont hashés avec un algorithme adapté.

Ils ne sont jamais déchiffrables.

---

## 69. Chiffrement applicatif

Le chiffrement colonne par colonne peut être utilisé pour les données très sensibles.

Il doit définir : l'algorithme ; la gestion des clés ; la rotation ; la recherche ; le format versionné ; la récupération ; les sauvegardes ; les droits d'accès.

Éviter d'inventer un système cryptographique interne.

---

## 70. Row-Level Security

PostgreSQL Row-Level Security peut renforcer l'isolation tenant.

Elle n'est pas obligatoire pour la première version.

Son introduction exige : une stratégie de connexion ; une définition fiable du tenant courant ; des tests complets ; la gestion des migrations ; la compatibilité Prisma ; une analyse opérationnelle ; un ADR approuvé.

L'application doit rester tenant-safe même sans RLS.

RLS est une défense supplémentaire, pas la seule défense.

---

## 71. Prisma Client

Le client Prisma doit être centralisé dans l'Infrastructure.

Il ne doit pas être instancié dans chaque repository.

Le module de base de données gère : la connexion ; la fermeture ; les logs ; les métriques ; les transactions ; la configuration ; les health checks.

---

## 72. Prisma middleware

Les middlewares Prisma doivent être utilisés avec prudence.

Éviter les middlewares cachant : le tenant ; le soft delete ; l'audit ; les permissions ; les événements.

Ils peuvent être utilisés pour des préoccupations techniques limitées si : leur comportement est explicite ; ils sont testés ; ils ne modifient pas la sémantique métier ; ils ne créent pas d'effets cachés.

---

## 73. Accès Prisma

L'accès direct au client Prisma est limité à : repositories ; query adapters ; migrations ; scripts de maintenance approuvés ; composants de persistance techniques.

Il est interdit dans : controllers ; workers ; consumers ; use cases ; Domain ; frontend ; Server Actions.

---

## 74. Query adapters

Une lecture complexe peut utiliser Prisma directement dans un adapter de Query.

Exemple :

```typescript
export class PrismaTenderQueries
  implements TenderQueries
{
  constructor(
    private readonly prisma: PrismaClient,
  ) {}

  async findDetails(input: {
    organizationId: string;
    tenderId: string;
  }): Promise<TenderDetails | null> {
    return this.prisma.tender.findFirst({
      where: {
        id: input.tenderId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        reference: true,
        status: true,
        officialDeadline: true,
        createdAt: true,
      },
    });
  }
}
```

Le résultat doit ensuite être mappé vers un contrat applicatif stable.

---

## 75. Repositories génériques

Sont interdits : `GenericRepository<T>`, `BaseCrudRepository<T>`, `AbstractRepository<T>` lorsqu'ils imposent des méthodes telles que `findAll`, `create`, `update`, `delete` à tous les agrégats.

Les repositories doivent exprimer le besoin métier réel.

Exemple : `TenderRepository` avec `findById`, `existsByReference`, `save`.

---

## 76. Migrations

Toute modification du schéma passe par une migration versionnée.

Une migration doit être : déterministe ; revue ; testée ; reproductible ; observable ; compatible avec le déploiement ; accompagnée d'une stratégie de rollback ou de récupération.

Aucune modification manuelle non tracée en production.

---

## 77. Nom des migrations

Utiliser un nom explicite.

Exemples :

```text
20260725_add_tender_version
20260726_create_outbox_events
20260727_add_document_checksum
```

Éviter :

```text
update
fix
changes
migration2
```

---

## 78. Expand and contract

Les changements incompatibles suivent :

```text
Expand
→ Migrate
→ Switch
→ Contract
```

Exemple de renommage :

**Étape 1 — Expand** : ajouter la nouvelle colonne nullable.

**Étape 2 — Double write** : écrire dans les deux colonnes.

**Étape 3 — Backfill** : copier les anciennes données.

**Étape 4 — Switch read** : lire la nouvelle colonne.

**Étape 5 — Enforce** : ajouter `NOT NULL` et contraintes.

**Étape 6 — Contract** : supprimer l'ancienne colonne lors d'un déploiement ultérieur.

---

## 79. Migration additive

Les migrations additives sont préférées : nouvelle table ; nouvelle colonne nullable ; nouvel index concurrent ; nouvelle contrainte non validée ; nouvelle valeur compatible.

Elles réduisent les risques lors d'un déploiement progressif.

---

## 80. Colonne NOT NULL

Ne pas ajouter directement une colonne obligatoire sans valeur sur une grande table active.

Pattern :

```text
1. Add nullable column
2. Deploy code writing it
3. Backfill
4. Validate completeness
5. Add NOT NULL
```

Une valeur par défaut ne doit pas inventer une information métier incorrecte.

---

## 81. Backfill

Un backfill doit être : idempotent ; paginé ; tenant-aware ; limité en charge ; reprenable ; observable ; testé.

Il ne doit pas nécessairement être exécuté dans la migration transactionnelle si le volume est important.

---

## 82. Index en production

La création d'un index sur une grande table peut verrouiller ou ralentir les écritures.

Utiliser lorsque nécessaire :

```sql
CREATE INDEX CONCURRENTLY
```

Cela impose des contraintes spécifiques, notamment l'absence de transaction englobante.

La stratégie doit être documentée.

---

## 83. Contraintes progressives

Pour ajouter une contrainte sur une grande table :

```sql
ALTER TABLE ...
ADD CONSTRAINT ...
NOT VALID;
```

Puis :

```sql
ALTER TABLE ...
VALIDATE CONSTRAINT ...;
```

Cela peut réduire le verrouillage.

Toute utilisation SQL avancée doit être revue.

---

## 84. Renommage

Un renommage de colonne peut casser une version encore déployée.

Ne pas renommer directement dans un déploiement zero-downtime.

Utiliser expand and contract.

---

## 85. Suppression de colonne

Une colonne ne doit être supprimée qu'après vérification que : aucun code ne l'écrit ; aucun code ne la lit ; aucun job ne l'utilise ; aucun export ne l'utilise ; aucun dashboard ne l'utilise ; aucun rollback applicatif n'en dépend.

La suppression intervient dans un déploiement séparé.

---

## 86. Migration destructive

Une migration destructive exige : justification ; sauvegarde ; stratégie de récupération ; validation sur une copie ; fenêtre opérationnelle si nécessaire ; approbation ; monitoring.

Exemples : suppression de table ; changement de type irréversible ; recalcul massif ; fusion de colonnes ; suppression de données.

---

## 87. Seed data

Les seeds sont séparés en deux catégories.

### 87.1 Référentiels système

Exemples : pays ; devises ; types standard.

Ils doivent être idempotents et versionnés.

### 87.2 Données de développement

Exemples : organisation de démonstration ; utilisateur local ; Tenders fictifs.

Elles ne doivent jamais être exécutées automatiquement en production.

---

## 88. Données de test

Les tests doivent utiliser : factories ; fixtures minimales ; transactions de test ; nettoyage déterministe ; identifiants distincts par tenant.

Éviter de dépendre d'un seed global mutable.

---

## 89. Base locale

Pour le développement local, PostgreSQL peut être lancé avec Docker Compose.

Exemple minimal :

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: tenderos
      POSTGRES_USER: tenderos
      POSTGRES_PASSWORD: tenderos_local
    ports:
      - "5432:5432"
    volumes:
      - tenderos_postgres:/var/lib/postgresql/data

volumes:
  tenderos_postgres:
```

L'application peut être lancée directement avec pnpm.

Docker n'est pas obligatoire pour tous les services applicatifs en local.

---

## 90. Production initiale

Le déploiement initial cible Railway.

La base PostgreSQL de production doit être un service séparé de : l'API ; le frontend ; le worker.

Les paramètres doivent être fournis par variables d'environnement sécurisées.

Exemple :

```text
DATABASE_URL
DIRECT_DATABASE_URL
```

Le nom exact dépendra de la configuration Prisma et Railway.

---

## 91. Pool de connexions

Le nombre de connexions doit être limité.

Le dimensionnement dépend : du nombre de replicas API ; du nombre de workers ; du pool par service ; de la limite PostgreSQL ; de la charge ; du mode serverless ou long-running.

Il faut éviter :

```text
20 connexions × 20 replicas
```

sur une base limitée à 100 connexions.

Le budget de connexions doit être documenté.

---

## 92. Connexions des workers

Les workers doivent utiliser un pool contrôlé.

Un scaling horizontal des workers ne doit pas saturer la base.

Les jobs massifs doivent appliquer : concurrence maximale ; batch size ; backpressure ; retry ; timeout.

---

## 93. Health checks

Le health check base doit distinguer :

**Liveness** — Le processus fonctionne-t-il ?

**Readiness** — Le service peut-il accéder à la base et servir correctement ?

Une panne DB doit rendre l'API non prête sans nécessairement provoquer une boucle de redémarrage immédiate.

---

## 94. Timeouts

Les requêtes doivent avoir des timeouts adaptés.

Catégories : requête interactive ; transaction ; migration ; backfill ; reporting.

Une requête utilisateur ne doit pas rester bloquée indéfiniment.

Les timeouts doivent générer : erreur classifiée ; métrique ; log ; trace.

---

## 95. Requêtes lentes

La plateforme doit surveiller : durée des requêtes ; requêtes les plus fréquentes ; scans séquentiels importants ; verrous ; taux de cache ; saturation du pool ; deadlocks ; erreurs de connexion.

Une requête lente doit être analysée avec `EXPLAIN ANALYZE` sur un environnement sûr et des données représentatives.

---

## 96. Logging SQL

Le logging complet de toutes les requêtes SQL ne doit pas être activé durablement en production sans contrôle.

Risques : volume ; coût ; fuite de données ; secrets ; contenu confidentiel.

Préférer : durée ; type d'opération ; table ou repository ; request ID ; correlation ID ; statut ; erreur classifiée.

---

## 97. Métriques

Métriques recommandées :

```text
database_query_duration
database_query_errors
database_transaction_duration
database_transaction_rollbacks
database_pool_active
database_pool_waiting
database_deadlocks
outbox_pending_count
outbox_oldest_pending_age
migration_status
```

Ne pas inclure le tenant comme label haute cardinalité dans toutes les métriques.

---

## 98. Sauvegardes

La base de production doit disposer de sauvegardes automatisées.

La politique doit définir : fréquence ; rétention ; chiffrement ; emplacement ; accès ; restauration ; test de restauration ; RPO ; RTO.

Une sauvegarde non testée n'est pas une stratégie de restauration fiable.

---

## 99. RPO et RTO initiaux

Pour la première version, les objectifs doivent rester réalistes.

Exemple documentaire :

```text
RPO cible initial : à définir selon l'offre Railway
RTO cible initial : quelques heures
```

Les valeurs finales doivent être confirmées avec le plan d'hébergement retenu.

Elles doivent évoluer avec les engagements clients.

---

## 100. Restauration

Un exercice de restauration doit vérifier : la disponibilité du backup ; son intégrité ; le temps de restauration ; les permissions ; les migrations nécessaires ; la reconnexion des services ; la cohérence des objets stockés ; le traitement de l'Outbox.

L'exercice doit être documenté.

---

## 101. Point-in-time recovery

Le Point-in-Time Recovery est recommandé lorsque l'offre d'hébergement le permet.

Il protège contre : suppression accidentelle ; migration incorrecte ; bug applicatif destructif ; corruption logique récente.

Il ne remplace pas : les sauvegardes indépendantes ; les tests ; les protections applicatives.

---

## 102. Rétention

Chaque catégorie de données doit avoir une politique de rétention.

Exemples :

| Donnée | Politique à définir |
|---|---|
| comptes actifs | durée du contrat |
| Tenders | durée du contrat et obligations |
| documents | politique organisation |
| audit | période de conformité |
| Outbox publiée | rétention technique limitée |
| jobs | rétention courte |
| AI Runs | selon audit et coût |
| idempotence | durée de rejeu utile |
| sessions d'upload | expiration rapide |

Aucune durée ne doit être inventée sans validation produit ou juridique.

---

## 103. Export et portabilité

Les données doivent pouvoir être exportées par tenant.

Un export doit : vérifier la permission ; être tenant-scoped ; être audité ; être idempotent ; supporter les grands volumes ; éviter une transaction longue ; produire un fichier sécurisé ; expirer ; être supprimé après rétention.

---

## 104. Suppression d'organisation

La suppression d'une organisation est un workflow long.

Exemple :

```text
Deletion requested
→ Access restricted
→ Retention checks
→ Export opportunity
→ Async deletion plan
→ Delete object storage
→ Delete tenant data
→ Verify
→ Record completion evidence
```

Elle ne doit pas être implémentée par une simple cascade globale.

---

## 105. Ordre de suppression

Le workflow doit connaître les dépendances.

Exemple conceptuel :

```text
AI artifacts
→ Search indexes
→ Document chunks
→ Document versions
→ Documents
→ Proposals
→ Tenders
→ Memberships
→ Organization
```

L'audit ou la preuve de suppression peut devoir être conservé séparément selon la politique.

---

## 106. Données orphelines

Des jobs de réconciliation doivent pouvoir détecter : objets de stockage sans enregistrement DB ; enregistrements DB sans objet ; Outbox bloquée ; processing runs orphelins ; relations invalides ; exports expirés ; sessions d'upload abandonnées.

La réconciliation doit être tenant-safe et auditable.

---

## 107. Cache et base autoritative

PostgreSQL reste la source autoritative pour les données métier.

Redis peut contenir : cache ; rate limits ; locks temporaires ; sessions ; jobs ; résultats éphémères.

Redis ne doit pas être l'unique source d'une décision métier durable.

Toute donnée de cache doit être reconstructible.

---

## 108. Invalidations de cache

L'invalidation doit être explicite.

Options : TTL ; suppression après écriture ; version de ressource ; événements ; clés namespacées.

Exemple :

```text
organization:{organizationId}:tender:{tenderId}
```

Aucune donnée d'un tenant ne doit être accessible depuis une clé non tenant-scoped.

---

## 109. Projections

Une projection peut être stockée dans PostgreSQL pour optimiser les lectures.

Elle doit documenter : sa source ; son propriétaire ; sa fraîcheur ; son tenant ; son mode de reconstruction ; son schéma ; sa version ; son idempotence.

Elle n'est pas une source autoritative.

---

## 110. Reporting

Les requêtes analytiques lourdes ne doivent pas dégrader la base transactionnelle.

Évolution possible :

```text
read replica
→ vues matérialisées
→ warehouse
```

Le besoin doit être démontré avant d'ajouter une infrastructure supplémentaire.

---

## 111. Vues SQL

Une vue peut simplifier une lecture stable.

Elle ne doit pas masquer : une frontière de module ; une permission ; un tenant ; une transformation métier complexe.

Les vues sont versionnées par migration.

---

## 112. Vues matérialisées

Une vue matérialisée peut être utilisée pour : reporting ; agrégats coûteux ; tableaux de bord ; données acceptant une fraîcheur différée.

Elle doit définir : fréquence de refresh ; coût ; verrouillage ; index ; fraîcheur ; monitoring.

---

## 113. Triggers

Les triggers sont interdits par défaut pour les règles métier.

Ils peuvent être acceptés pour : contraintes impossibles autrement ; maintenance technique limitée ; intégrité critique ; timestamps spécifiques ; protection append-only.

Ils exigent : justification ; tests ; documentation ; migration ; observabilité ; ADR si structurants.

Les effets cachés sont à éviter.

---

## 114. Fonctions SQL

Une fonction SQL peut être utilisée pour : une opération atomique complexe ; un backfill ; un calcul performant ; une maintenance ciblée.

Elle ne doit pas devenir un second Domain caché dans PostgreSQL.

---

## 115. Partitionnement

Le partitionnement n'est pas requis au lancement.

Il peut devenir pertinent pour : audit massif ; Outbox ; événements ; logs ; données temporelles importantes.

Son introduction exige : volume mesuré ; stratégie de clé ; maintenance ; rétention ; compatibilité Prisma ; tests ; ADR.

---

## 116. Réplicas de lecture

Les replicas ne sont pas nécessaires initialement.

Ils peuvent être ajoutés lorsque : la lecture domine ; la base principale est saturée ; les requêtes sont compatibles avec la réplication ; la latence de réplication est acceptable.

Les décisions critiques doivent lire la source autoritative.

---

## 117. Sharding

Le sharding est exclu de l'architecture initiale.

Il ne peut être introduit qu'après : mesure de limites ; analyse des alternatives ; définition de la clé ; stratégie de migration ; expertise opérationnelle ; ADR approuvé.

Le champ `organization_id` facilite une éventuelle stratégie future sans la rendre nécessaire.

---

## 118. Tests de schéma

Les tests doivent vérifier : contraintes uniques ; clés étrangères ; `NOT NULL` ; checks ; soft delete ; tenant isolation ; rollback ; optimistic locking ; pagination ; index critiques ; migrations.

---

## 119. Tests de migration

Chaque migration importante doit être testée sur : base vide ; schéma existant ; données représentatives ; volume simulé ; ancienne version de l'application ; nouvelle version ; rollback ou restauration.

---

## 120. Test inter-tenant

Test obligatoire :

```typescript
it("does not return data from another organization", async () => {
  await seedTender({
    organizationId: ORGANIZATION_B_ID,
    tenderId: TENDER_ID,
  });

  const result = await repository.findById({
    organizationId: ORGANIZATION_A_ID,
    tenderId: TENDER_ID,
  });

  expect(result).toBeNull();
});
```

Des tests similaires doivent exister pour : updates ; deletes ; relations ; exports ; jobs ; projections ; recherche.

---

## 121. Test de concurrence

Exemple :

```text
Deux utilisateurs chargent version 4
Utilisateur A sauvegarde → version 5
Utilisateur B sauvegarde avec expectedVersion 4
→ Conflit
```

Le test doit confirmer : aucun écrasement ; erreur applicative correcte ; transaction rollback ; absence d'événement incorrect.

---

## 122. Test Outbox

Le test doit vérifier que :

```text
si la transaction métier rollback
→ aucun événement Outbox n'existe
```

et :

```text
si l'Outbox échoue
→ la modification métier rollback
```

---

## 123. Test d'idempotence

Vérifier : premier appel exécuté ; second appel identique retourne le même résultat ; aucun doublon ; même clé avec payload différent produit un conflit ; tenant différent reste isolé.

---

## 124. Test de soft delete

Vérifier : l'élément supprimé n'apparaît plus dans les queries normales ; il ne peut pas être modifié par les use cases courants ; l'accès administratif est explicite ; l'unicité suit la politique définie ; la restauration est cohérente si supportée.

---

## 125. Scripts de maintenance

Les scripts doivent être : versionnés ; typés ; tenant-aware ; idempotents ; dry-run si possible ; loggés ; limités ; approuvés pour production.

Éviter les commandes SQL manuelles improvisées.

---

## 126. Accès de production

L'accès direct à la base de production doit être limité.

Il doit utiliser : authentification forte ; comptes nominatifs ; moindre privilège ; tunnel sécurisé ; audit ; expiration ; procédure d'urgence.

L'application utilise un compte dédié.

Les migrations peuvent utiliser un compte distinct plus privilégié.

---

## 127. Moindre privilège

Différents rôles PostgreSQL peuvent être envisagés :

```text
tenderos_app
tenderos_migrator
tenderos_readonly
tenderos_support
```

La première version peut rester plus simple, mais les responsabilités doivent être séparées dès que les opérations le nécessitent.

---

## 128. Environnements

Les bases doivent être distinctes entre : `development` ; `test` ; `preview` ; `staging` ; `production`.

Aucune preview ne doit utiliser la base de production.

Les données de production ne doivent pas être copiées en développement sans anonymisation et autorisation.

---

## 129. Anonymisation

Une copie de production destinée au test doit supprimer ou transformer : noms ; emails ; téléphones ; documents ; secrets ; données commerciales confidentielles ; tokens ; identifiants externes.

L'anonymisation doit être irréversible pour l'environnement cible.

---

## 130. Variables d'environnement

Configuration minimale :

```text
DATABASE_URL
DATABASE_POOL_SIZE
DATABASE_CONNECT_TIMEOUT
DATABASE_QUERY_TIMEOUT
```

Les valeurs exactes dépendront de l'hébergement.

Aucune URL de production ne doit être committée.

---

## 131. Gestion des erreurs Prisma

Les erreurs Prisma doivent être traduites dans l'Infrastructure.

Exemples :

```text
Prisma unique constraint
→ Repository conflict
→ Application conflict
→ API 409

Prisma record not found
→ Repository not found or concurrency

Prisma connection error
→ DependencyUnavailable
→ API 503
```

Les messages Prisma ne doivent pas être exposés au client.

---

<!--
SECTION 132 INCOMPLETE — le message source a été tronqué par la limite de caractères
en plein milieu de la section "Mapping d'erreurs", dans un bloc de code TypeScript
(juste après `if (isUniqueConst`). Le reste de cette section, ainsi que toute
section suivante (probablement : autres patterns de mapping d'erreurs, checklist
finale, critères d'acceptation), n'a pas été reçu et n'a donc pas été reconstitué ici.
-->

## 132. Mapping d'erreurs

Exemple conceptuel :

```typescript
try {
  await client.tender.create({
    data,
  });
} catch (error) {
  if (isUniqueConst
  // TODO: section tronquée dans la source — suite du mapping manquante.
}
```
