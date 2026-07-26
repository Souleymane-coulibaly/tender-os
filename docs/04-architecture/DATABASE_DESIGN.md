# TenderOS — Database Design

Version : 1.0
Statut : Draft
Propriétaires : Engineering Governor, Domain & Security

---

## 1. Objectif

Ce document transforme le modèle métier de TenderOS en une architecture de données exploitable avec :

- PostgreSQL ;
- Prisma ;
- pgvector ;
- stockage objet compatible S3 ;
- Transactional Outbox ;
- architecture multi-tenant.

Il définit : les conventions de base de données ; les tables principales ; les relations ; les contraintes ; les index ; les règles multi-tenant ; les règles de suppression ; les exigences de migration ; les garanties d'intégrité.

Ce document ne remplace pas le modèle métier. En cas de contradiction, les documents suivants prévalent :

```text
BUSINESS_RULES.md
DOMAIN_MODEL.md
PERMISSIONS.md
DOMAIN_EVENTS.md
```

---

## 2. Principes généraux

### DB-001 — PostgreSQL est la source de vérité

Toutes les données transactionnelles de TenderOS sont conservées dans PostgreSQL.

Ne sont pas stockés directement dans PostgreSQL : fichiers PDF ; documents bureautiques ; archives ZIP ; images ; pièces de soumission ; fichiers binaires volumineux.

PostgreSQL conserve leurs métadonnées et leurs clés de stockage.

### DB-002 — Identifiants applicatifs

Toutes les entités utilisent un identifiant généré par l'application.

Format recommandé : `UUID v7`

Exemple : `0195f250-9e4d-7d52-9152-d75092fa37aa`

Les identifiants : ne doivent pas contenir d'information métier ; ne doivent pas être séquentiels publiquement ; doivent être générables avant insertion ; doivent rester stables pendant toute la vie de l'entité.

### DB-003 — Nommage

**Tables** — `snake_case`, pluriel. Exemples : `organizations`, `organization_memberships`, `tender_workspaces`, `proposal_versions`

**Colonnes** — `snake_case`. Exemples : `organization_id`, `created_at`, `submission_deadline`

**Modèles Prisma** — `PascalCase`, singulier. Exemples : `Organization`, `TenderWorkspace`, `ProposalVersion`

### DB-004 — Dates et heures

Toutes les dates techniques sont stockées en UTC avec `timestamptz`.

Colonnes standards : `created_at`, `updated_at`, `deleted_at`

Les dates officielles d'un appel d'offres peuvent également conserver `official_timezone`.

Exemple :

```text
submission_deadline = 2027-02-15T11:00:00Z
official_timezone = Europe/Paris
```

### DB-005 — Données monétaires

Les montants doivent être stockés avec `numeric(19,4)`.

La devise est stockée séparément avec un code ISO 4217.

```text
estimated_amount = 150000.0000
currency = EUR
```

Les nombres flottants ne doivent jamais être utilisés pour les données financières.

### DB-006 — Multi-tenancy

Architecture initiale :

```text
Shared Database
Shared Schema
Tenant Key = organization_id
```

Toute ressource appartenant à un tenant doit contenir directement ou indirectement un `organization_id`.

Pour les agrégats majeurs, la colonne doit être présente directement afin de : simplifier les contrôles ; accélérer les requêtes ; réduire les risques inter-tenant ; permettre des contraintes et index composites.

### DB-007 — Suppression

La suppression fonctionnelle utilise principalement le soft delete : `deleted_at`, `deleted_by`

La suppression physique est réservée : aux données temporaires ; aux données techniques arrivées à expiration ; aux obligations légales ; aux procédures administratives contrôlées.

### DB-008 — Historisation

Les objets nécessitant une forte traçabilité utilisent des versions immuables. Exemples : documents ; propositions ; analyses IA ; packages de soumission ; décisions Go / No-Go.

Une version utilisée dans une validation ou une soumission ne doit jamais être modifiée.

### DB-009 — Contraintes métier

Les contraintes doivent être appliquées au niveau le plus bas possible.

Utiliser selon le cas : `NOT NULL` ; clés étrangères ; contraintes uniques ; contraintes `CHECK` ; transactions ; versioning optimiste ; validations du Domain.

La validation applicative seule ne suffit pas pour les invariants structurels.

---

## 3. Extensions PostgreSQL

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

| Extension | Usage |
|---|---|
| pgcrypto | Fonctions cryptographiques et UUID |
| vector | Embeddings |
| citext | Emails insensibles à la casse |
| pg_trgm | Recherche approximative et déduplication |

---

## 4. Domaines principaux

Identity, Organizations, Authorization, Buyers, Tenders, Qualification, Workspaces, Documents, DCE, AI, Company Brain, Proposals, Tasks, Collaboration, Compliance, Submission, Outcomes, Notifications, Audit, Events.

---

## 5. Identity et Organizations

### 5.1 `users`

Représente une identité humaine globale.

| Colonne | Type | Contraintes |
|---|---|---|
| id | uuid | PK |
| email | citext | unique, not null |
| display_name | varchar(160) | not null |
| first_name | varchar(100) | nullable |
| last_name | varchar(100) | nullable |
| status | varchar(30) | not null |
| email_verified_at | timestamptz | nullable |
| last_login_at | timestamptz | nullable |
| created_at | timestamptz | not null |
| updated_at | timestamptz | not null |
| deleted_at | timestamptz | nullable |

Statuts : `INVITED`, `ACTIVE`, `SUSPENDED`, `DEACTIVATED`

Contraintes : `UNIQUE(lower(email))`

Le mot de passe peut être géré par un fournisseur d'identité externe. TenderOS ne doit pas obligatoirement conserver de hash local.

### 5.2 `organizations`

Représente une entreprise cliente de TenderOS.

| Colonne | Type | Contraintes |
|---|---|---|
| id | uuid | PK |
| name | varchar(200) | not null |
| slug | varchar(120) | unique, not null |
| legal_name | varchar(240) | nullable |
| registration_number | varchar(100) | nullable |
| country_code | char(2) | nullable |
| default_currency | char(3) | not null, défaut EUR |
| default_timezone | varchar(80) | not null |
| status | varchar(30) | not null |
| settings | jsonb | not null, défaut {} |
| created_at | timestamptz | not null |
| updated_at | timestamptz | not null |
| deleted_at | timestamptz | nullable |

Statuts : `TRIAL`, `ACTIVE`, `SUSPENDED`, `CLOSED`

### 5.3 `organization_memberships`

Relie un utilisateur à une organisation.

| Colonne | Type | Contraintes |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | FK |
| user_id | uuid | FK |
| status | varchar(30) | not null |
| joined_at | timestamptz | nullable |
| suspended_at | timestamptz | nullable |
| expires_at | timestamptz | nullable |
| created_at | timestamptz | not null |
| updated_at | timestamptz | not null |

Contrainte : `UNIQUE(organization_id, user_id)`

Statuts : `INVITED`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, `REMOVED`

### 5.4 `organization_invitations`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| email | citext |
| token_hash | varchar(255) |
| status | varchar(30) |
| invited_by | uuid |
| expires_at | timestamptz |
| accepted_at | timestamptz |
| created_at | timestamptz |

Le token brut ne doit jamais être enregistré.

---

## 6. Roles et Permissions

### 6.1 `roles`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid, nullable |
| code | varchar(100) |
| name | varchar(160) |
| scope | varchar(30) |
| is_system | boolean |
| created_at | timestamptz |
| updated_at | timestamptz |

`organization_id` est nullable pour les rôles système.

Scopes : `ORGANIZATION`, `WORKSPACE`

### 6.2 `permissions`

| Colonne | Type |
|---|---|
| id | uuid |
| code | varchar(160), unique |
| resource | varchar(100) |
| action | varchar(100) |
| description | text |

Exemple : `proposal:approve`, `workspace:member:add`, `submission:record`

### 6.3 `role_permissions`

```text
role_id
permission_id
```

Contrainte : `UNIQUE(role_id, permission_id)`

### 6.4 `membership_roles`

Relie un membre d'organisation à un rôle d'organisation.

```text
membership_id
role_id
assigned_by
assigned_at
```

### 6.5 `resource_access_grants`

Pour les accès spécifiques ou temporaires.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| subject_type | varchar(30) |
| subject_id | uuid |
| resource_type | varchar(100) |
| resource_id | uuid |
| permissions | jsonb |
| starts_at | timestamptz |
| expires_at | timestamptz |
| granted_by | uuid |
| revoked_at | timestamptz |
| created_at | timestamptz |

---

## 7. Buyers

### 7.1 `buyers`

Un acheteur public peut être partagé entre plusieurs organisations, mais les enrichissements privés doivent rester tenant-scoped.

| Colonne | Type |
|---|---|
| id | uuid |
| canonical_name | varchar(255) |
| legal_identifier | varchar(120) |
| buyer_type | varchar(60) |
| country_code | char(2) |
| website_url | text |
| address | jsonb |
| normalized_name | varchar(255) |
| created_at | timestamptz |
| updated_at | timestamptz |

Index : `normalized_name`, `legal_identifier`, `country_code`

### 7.2 `organization_buyer_profiles`

Données privées d'une organisation sur un acheteur.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| buyer_id | uuid |
| relationship_status | varchar(50) |
| notes | text |
| internal_rating | smallint |
| created_at | timestamptz |
| updated_at | timestamptz |

Contrainte : `UNIQUE(organization_id, buyer_id)`

---

## 8. Tender Sources et Tenders

### 8.1 `tender_sources`

| Colonne | Type |
|---|---|
| id | uuid |
| code | varchar(50), unique |
| name | varchar(120) |
| source_type | varchar(50) |
| base_url | text |
| active | boolean |
| created_at | timestamptz |
| updated_at | timestamptz |

Exemples : `BOAMP`, `TED`, `MANUAL`, `PLACE`

### 8.2 `tender_notices`

Conserve chaque avis brut provenant d'une source.

| Colonne | Type |
|---|---|
| id | uuid |
| source_id | uuid |
| source_notice_id | varchar(255) |
| notice_type | varchar(80) |
| raw_payload | jsonb |
| payload_checksum | varchar(128) |
| published_at_source | timestamptz |
| fetched_at | timestamptz |
| processing_status | varchar(30) |
| processing_error_code | varchar(100) |
| created_at | timestamptz |

Contrainte : `UNIQUE(source_id, source_notice_id, payload_checksum)`

Les avis bruts permettent de reconstruire ou réinterpréter les données normalisées.

### 8.3 `tenders`

Représentation normalisée d'un appel d'offres.

| Colonne | Type | Contraintes |
|---|---|---|
| id | uuid | PK |
| organization_id | uuid | not null |
| buyer_id | uuid | nullable |
| title | varchar(500) | not null |
| description | text | nullable |
| reference | varchar(255) | nullable |
| procedure_type | varchar(80) | nullable |
| contract_type | varchar(80) | nullable |
| publication_date | timestamptz | nullable |
| submission_deadline | timestamptz | nullable |
| official_timezone | varchar(80) | nullable |
| estimated_amount | numeric(19,4) | nullable |
| currency | char(3) | nullable |
| status | varchar(40) | not null |
| source_url | text | nullable |
| is_manual | boolean | not null |
| version | integer | not null, défaut 1 |
| created_by | uuid | nullable |
| created_at | timestamptz | not null |
| updated_at | timestamptz | not null |
| deleted_at | timestamptz | nullable |

Statuts : `DISCOVERED`, `SHORTLISTED`, `QUALIFYING`, `GO`, `NO_GO`, `WATCHING`, `EXPIRED`, `CANCELLED`, `AWARDED`, `ARCHIVED`

Index : `(organization_id, status)`, `(organization_id, submission_deadline)`, `(organization_id, buyer_id)`, `(organization_id, created_at)`

Recherche texte : `title`, `description`, `reference`

### 8.4 `tender_source_links`

Relie un Tender normalisé à un ou plusieurs avis sources.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| tender_id | uuid |
| tender_notice_id | uuid |
| is_primary | boolean |
| created_at | timestamptz |

Contrainte : `UNIQUE(organization_id, tender_id, tender_notice_id)`

### 8.5 `tender_lots`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| tender_id | uuid |
| lot_number | varchar(80) |
| title | varchar(500) |
| description | text |
| estimated_amount | numeric(19,4) |
| currency | char(3) |
| status | varchar(40) |
| created_at | timestamptz |
| updated_at | timestamptz |

Contrainte : `UNIQUE(tender_id, lot_number)`

### 8.6 `tender_cpv_codes`

| Colonne | Type |
|---|---|
| tender_id | uuid |
| lot_id | uuid, nullable |
| cpv_code | varchar(20) |
| is_primary | boolean |

### 8.7 `tender_status_history`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| tender_id | uuid |
| previous_status | varchar(40) |
| new_status | varchar(40) |
| reason | text |
| changed_by | uuid |
| changed_at | timestamptz |

---

## 9. Matching et Qualification

### 9.1 `tender_matches`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| tender_id | uuid |
| score | numeric(5,2) |
| confidence | varchar(20) |
| recommended_action | varchar(30) |
| explanation | jsonb |
| blocking_factors | jsonb |
| model_version | varchar(100) |
| calculated_at | timestamptz |
| invalidated_at | timestamptz |

Une nouvelle évaluation crée un nouvel enregistrement.

### 9.2 `qualifications`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| tender_id | uuid |
| lot_id | uuid, nullable |
| status | varchar(30) |
| score | numeric(5,2) |
| recommendation | varchar(30) |
| summary | text |
| started_by | uuid |
| completed_by | uuid |
| started_at | timestamptz |
| completed_at | timestamptz |
| created_at | timestamptz |
| updated_at | timestamptz |

### 9.3 `qualification_criteria`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| qualification_id | uuid |
| criterion_code | varchar(100) |
| label | varchar(255) |
| weight | numeric(6,3) |
| score | numeric(6,3) |
| answer | text |
| blocking | boolean |
| created_at | timestamptz |
| updated_at | timestamptz |

### 9.4 `go_no_go_decisions`

Les décisions sont immuables.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| tender_id | uuid |
| lot_id | uuid, nullable |
| qualification_id | uuid, nullable |
| decision | varchar(20) |
| justification | text |
| recommended_decision | varchar(20) |
| is_override | boolean |
| decided_by | uuid |
| decided_at | timestamptz |
| supersedes_decision_id | uuid, nullable |

Décisions : `GO`, `NO_GO`, `WATCHING`

Une correction crée une nouvelle décision liée par `supersedes_decision_id`.

---

## 10. Tender Workspaces

### 10.1 `tender_workspaces`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| tender_id | uuid |
| lot_id | uuid, nullable |
| name | varchar(255) |
| status | varchar(40) |
| bid_manager_id | uuid |
| submission_deadline | timestamptz |
| official_timezone | varchar(80) |
| version | integer |
| created_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |
| archived_at | timestamptz |
| deleted_at | timestamptz |

Statuts : `DRAFT`, `QUALIFICATION`, `PREPARATION`, `REVIEW`, `APPROVED`, `READY_FOR_SUBMISSION`, `SUBMITTED`, `WON`, `LOST`, `CANCELLED`, `ARCHIVED`

Contrainte initiale : `UNIQUE(organization_id, tender_id, lot_id) WHERE deleted_at IS NULL`

Cette contrainte peut être adaptée si plusieurs réponses indépendantes à un même lot deviennent nécessaires.

### 10.2 `workspace_memberships`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| organization_membership_id | uuid |
| role_code | varchar(100) |
| status | varchar(30) |
| starts_at | timestamptz |
| expires_at | timestamptz |
| added_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |

Contrainte : `UNIQUE(workspace_id, organization_membership_id)`

### 10.3 `workspace_status_history`

Même principe que `tender_status_history`.

### 10.4 `workspace_milestones`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| title | varchar(255) |
| due_at | timestamptz |
| status | varchar(30) |
| position | integer |
| created_at | timestamptz |
| updated_at | timestamptz |

---

## 11. Documents

### 11.1 `documents`

Table générique représentant un document logique.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid, nullable |
| category | varchar(60) |
| document_type | varchar(80) |
| title | varchar(500) |
| confidentiality_level | varchar(30) |
| status | varchar(30) |
| current_version_id | uuid, nullable |
| created_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |
| archived_at | timestamptz |
| deleted_at | timestamptz |

Catégories : `CONSULTATION`, `COMPANY`, `PROPOSAL_EXPORT`, `SUBMISSION`, `EVIDENCE`, `OTHER`

### 11.2 `document_versions`

Une version est immuable après validation de l'upload.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| document_id | uuid |
| version_number | integer |
| filename | varchar(500) |
| storage_key | text |
| mime_type | varchar(160) |
| size_bytes | bigint |
| checksum_sha256 | varchar(64) |
| processing_status | varchar(40) |
| page_count | integer |
| language_code | varchar(20) |
| uploaded_by | uuid |
| uploaded_at | timestamptz |
| created_at | timestamptz |

Contraintes : `UNIQUE(document_id, version_number)`, `UNIQUE(organization_id, storage_key)`

### 11.3 `document_processing_jobs`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| document_version_id | uuid |
| job_type | varchar(60) |
| status | varchar(30) |
| attempt_count | integer |
| max_attempts | integer |
| error_code | varchar(100) |
| error_message | text |
| started_at | timestamptz |
| completed_at | timestamptz |
| next_attempt_at | timestamptz |
| created_at | timestamptz |

Types possibles : `MALWARE_SCAN`, `MIME_VALIDATION`, `TEXT_EXTRACTION`, `CLASSIFICATION`, `CHUNKING`, `EMBEDDING`, `INDEXING`

### 11.4 `document_text_contents`

Stocke le texte extrait, pas le fichier original.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| document_version_id | uuid |
| extraction_method | varchar(80) |
| text_content | text |
| content_checksum | varchar(64) |
| created_at | timestamptz |

Pour les très gros documents, le stockage pourra être externalisé ultérieurement.

### 11.5 `document_chunks`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid, nullable |
| document_id | uuid |
| document_version_id | uuid |
| chunk_index | integer |
| content | text |
| page_start | integer |
| page_end | integer |
| section_title | varchar(500) |
| confidentiality_level | varchar(30) |
| metadata | jsonb |
| embedding | vector |
| embedding_model | varchar(120) |
| created_at | timestamptz |

Index vectoriel à définir selon la dimension choisie.

```sql
CREATE INDEX document_chunks_embedding_idx
ON document_chunks
USING hnsw (embedding vector_cosine_ops);
```

Tout accès vectoriel doit filtrer par `organization_id`.

---

## 12. DCE

### 12.1 `dce_packages`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| status | varchar(30) |
| source_type | varchar(40) |
| imported_by | uuid |
| imported_at | timestamptz |
| created_at | timestamptz |
| updated_at | timestamptz |

### 12.2 `dce_documents`

Relie un document au DCE.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| dce_package_id | uuid |
| document_id | uuid |
| document_type | varchar(50) |
| classification_confidence | varchar(20) |
| is_required | boolean |
| position | integer |
| created_at | timestamptz |

Types : `RC`, `CCTP`, `CCAP`, `AE`, `BPU`, `DQE`, `DPGF`, `RESPONSE_TEMPLATE`, `ANNEX`, `AMENDMENT`, `CLARIFICATION`, `OTHER`

### 12.3 `tender_amendments`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| tender_id | uuid |
| workspace_id | uuid, nullable |
| source_notice_id | uuid, nullable |
| title | varchar(500) |
| published_at | timestamptz |
| detected_at | timestamptz |
| status | varchar(30) |
| created_at | timestamptz |

### 12.4 `tender_amendment_changes`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| amendment_id | uuid |
| change_type | varchar(80) |
| severity | varchar(20) |
| entity_type | varchar(80) |
| entity_id | uuid, nullable |
| previous_value | jsonb |
| new_value | jsonb |
| citation_id | uuid, nullable |
| created_at | timestamptz |

---

## 13. IA et analyses

### 13.1 `ai_runs`

Chaque exécution IA doit être traçable.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid, nullable |
| initiated_by | uuid, nullable |
| agent_type | varchar(100) |
| operation | varchar(120) |
| provider | varchar(80) |
| model_name | varchar(120) |
| prompt_version | varchar(80) |
| status | varchar(30) |
| input_token_count | integer |
| output_token_count | integer |
| estimated_cost | numeric(19,6) |
| currency | char(3) |
| duration_ms | integer |
| correlation_id | uuid |
| started_at | timestamptz |
| completed_at | timestamptz |
| error_code | varchar(100) |
| created_at | timestamptz |

Ne pas stocker systématiquement les prompts complets contenant des données confidentielles.

### 13.2 `ai_analyses`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| ai_run_id | uuid |
| analysis_type | varchar(80) |
| status | varchar(30) |
| summary | text |
| confidence | varchar(20) |
| model_version | varchar(120) |
| input_fingerprint | varchar(128) |
| invalidated_at | timestamptz |
| invalidation_reason | varchar(80) |
| created_at | timestamptz |
| completed_at | timestamptz |

### 13.3 `citations`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| document_id | uuid |
| document_version_id | uuid |
| chunk_id | uuid, nullable |
| page_number | integer |
| section_title | varchar(500) |
| quote_excerpt | text |
| start_offset | integer |
| end_offset | integer |
| created_at | timestamptz |

Une citation doit toujours pointer vers une version précise.

### 13.4 `requirements`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| analysis_id | uuid |
| category | varchar(80) |
| title | varchar(500) |
| description | text |
| criticality | varchar(20) |
| mandatory | boolean |
| confidence | varchar(20) |
| status | varchar(30) |
| validated_by | uuid, nullable |
| validated_at | timestamptz, nullable |
| created_at | timestamptz |
| updated_at | timestamptz |

### 13.5 `requirement_citations`

```text
requirement_id
citation_id
```

### 13.6 `evaluation_criteria`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| analysis_id | uuid |
| label | varchar(500) |
| description | text |
| weight | numeric(7,4) |
| position | integer |
| confidence | varchar(20) |
| created_at | timestamptz |

### 13.7 `risks`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| analysis_id | uuid, nullable |
| category | varchar(80) |
| title | varchar(500) |
| description | text |
| level | varchar(20) |
| status | varchar(30) |
| owner_id | uuid, nullable |
| created_at | timestamptz |
| updated_at | timestamptz |

---

## 14. Company Brain

### 14.1 `company_profiles`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid, unique |
| summary | text |
| industries | jsonb |
| service_areas | jsonb |
| geographies | jsonb |
| employee_count | integer |
| annual_revenue | numeric(19,4) |
| currency | char(3) |
| updated_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |

### 14.2 `company_references`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| title | varchar(500) |
| client_name | varchar(255) |
| description | text |
| contract_amount | numeric(19,4) |
| currency | char(3) |
| started_at | date |
| completed_at | date |
| status | varchar(30) |
| confidentiality_level | varchar(30) |
| approved_by | uuid, nullable |
| approved_at | timestamptz |
| created_at | timestamptz |
| updated_at | timestamptz |

### 14.3 `certifications`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| name | varchar(255) |
| issuer | varchar(255) |
| certification_number | varchar(160) |
| issued_at | date |
| expires_at | date |
| status | varchar(30) |
| document_id | uuid, nullable |
| created_at | timestamptz |
| updated_at | timestamptz |

### 14.4 `knowledge_candidates`

Connaissances proposées avant validation humaine.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| source_workspace_id | uuid |
| knowledge_type | varchar(80) |
| title | varchar(500) |
| content | text |
| status | varchar(30) |
| generated_by_ai | boolean |
| created_by | uuid, nullable |
| reviewed_by | uuid, nullable |
| reviewed_at | timestamptz |
| created_at | timestamptz |

### 14.5 `knowledge_entries`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| candidate_id | uuid, nullable |
| knowledge_type | varchar(80) |
| title | varchar(500) |
| content | text |
| status | varchar(30) |
| approved_by | uuid |
| approved_at | timestamptz |
| obsolete_at | timestamptz |
| created_at | timestamptz |
| updated_at | timestamptz |

Seules les connaissances approuvées doivent être considérées comme sources fiables par le Proposal Writer.

---

## 15. Proposals

### 15.1 `proposals`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| title | varchar(500) |
| status | varchar(40) |
| current_version_id | uuid, nullable |
| approved_version_id | uuid, nullable |
| created_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |
| locked_at | timestamptz |
| archived_at | timestamptz |

Statuts : `DRAFT`, `IN_PROGRESS`, `IN_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `LOCKED`, `ARCHIVED`

Un Workspace ne doit posséder qu'une Proposal active par défaut.

### 15.2 `proposal_sections`

Représente la structure logique stable.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| proposal_id | uuid |
| parent_section_id | uuid, nullable |
| title | varchar(500) |
| section_key | varchar(160) |
| position | integer |
| status | varchar(30) |
| assigned_to | uuid, nullable |
| created_at | timestamptz |
| updated_at | timestamptz |

### 15.3 `proposal_versions`

Version immuable complète de la Proposal.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| proposal_id | uuid |
| version_number | integer |
| creation_reason | varchar(50) |
| created_by | uuid |
| ai_run_id | uuid, nullable |
| content_checksum | varchar(64) |
| created_at | timestamptz |

Contrainte : `UNIQUE(proposal_id, version_number)`

### 15.4 `proposal_section_versions`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| proposal_version_id | uuid |
| proposal_section_id | uuid |
| title | varchar(500) |
| content | text |
| position | integer |
| source_citation_count | integer |
| unsupported_claim_count | integer |
| created_at | timestamptz |

### 15.5 `proposal_section_citations`

```text
proposal_section_version_id
citation_id
```

### 15.6 `proposal_reviews`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| proposal_id | uuid |
| proposal_version_id | uuid |
| reviewer_id | uuid |
| status | varchar(30) |
| started_at | timestamptz |
| completed_at | timestamptz |
| created_at | timestamptz |

### 15.7 `proposal_approvals`

Les approbations sont immuables.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| proposal_id | uuid |
| proposal_version_id | uuid |
| decision | varchar(30) |
| approved_by | uuid |
| justification | text |
| created_at | timestamptz |

---

## 16. Tasks et Collaboration

### 16.1 `workspace_tasks`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| title | varchar(500) |
| description | text |
| status | varchar(30) |
| priority | varchar(20) |
| assignee_id | uuid, nullable |
| due_at | timestamptz |
| blocking | boolean |
| generated_by_ai | boolean |
| source_requirement_id | uuid, nullable |
| created_by | uuid |
| completed_at | timestamptz |
| created_at | timestamptz |
| updated_at | timestamptz |
| deleted_at | timestamptz |

Statuts : `TODO`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `DONE`, `CANCELLED`

### 16.2 `comments`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| target_type | varchar(80) |
| target_id | uuid |
| author_id | uuid |
| content | text |
| blocking | boolean |
| resolved_at | timestamptz |
| resolved_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |
| deleted_at | timestamptz |

### 16.3 `comment_mentions`

```text
comment_id
user_id
notified_at
```

### 16.4 `workspace_activities`

Journal fonctionnel visible par les utilisateurs.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| actor_id | uuid, nullable |
| activity_type | varchar(100) |
| entity_type | varchar(80) |
| entity_id | uuid |
| summary | text |
| metadata | jsonb |
| created_at | timestamptz |

Ne pas confondre avec l'Audit Log de sécurité.

---

## 17. Compliance

### 17.1 `compliance_checklists`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| status | varchar(30) |
| blocking_issue_count | integer |
| warning_count | integer |
| last_checked_at | timestamptz |
| created_at | timestamptz |
| updated_at | timestamptz |

### 17.2 `compliance_items`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| checklist_id | uuid |
| requirement_id | uuid, nullable |
| code | varchar(120) |
| label | varchar(500) |
| description | text |
| status | varchar(30) |
| severity | varchar(20) |
| evidence_type | varchar(80) |
| evidence_entity_id | uuid, nullable |
| assigned_to | uuid, nullable |
| validated_by | uuid, nullable |
| validated_at | timestamptz |
| created_at | timestamptz |
| updated_at | timestamptz |

Statuts : `NOT_STARTED`, `IN_PROGRESS`, `COMPLIANT`, `NON_COMPLIANT`, `NOT_APPLICABLE`, `WAIVED`

### 17.3 `compliance_waivers`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| compliance_item_id | uuid |
| status | varchar(30) |
| justification | text |
| requested_by | uuid |
| requested_at | timestamptz |
| decided_by | uuid, nullable |
| decided_at | timestamptz |
| decision_comment | text |

---

## 18. Submission

### 18.1 `submission_packages`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| proposal_version_id | uuid |
| package_version | integer |
| status | varchar(30) |
| manifest | jsonb |
| checksum_sha256 | varchar(64) |
| generated_by | uuid |
| generated_at | timestamptz |
| validated_at | timestamptz |
| created_at | timestamptz |

Contrainte : `UNIQUE(workspace_id, package_version)`

### 18.2 `submission_package_files`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| package_id | uuid |
| document_version_id | uuid |
| filename | varchar(500) |
| position | integer |
| required | boolean |
| validation_status | varchar(30) |
| validation_issues | jsonb |
| created_at | timestamptz |

### 18.3 `submissions`

Un enregistrement de soumission est immuable.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| package_id | uuid |
| platform | varchar(160) |
| submitted_at | timestamptz |
| official_timezone | varchar(80) |
| recorded_by | uuid |
| reference_number | varchar(255) |
| evidence_document_id | uuid, nullable |
| notes | text |
| supersedes_submission_id | uuid, nullable |
| created_at | timestamptz |

Une correction crée un nouvel enregistrement.

---

## 19. Outcomes

### 19.1 `tender_outcomes`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| workspace_id | uuid |
| outcome | varchar(30) |
| award_date | date |
| awarded_supplier_name | varchar(255) |
| awarded_amount | numeric(19,4) |
| currency | char(3) |
| reason | text |
| source_type | varchar(80) |
| recorded_by | uuid |
| created_at | timestamptz |
| updated_at | timestamptz |

Outcomes : `WON`, `LOST`, `CANCELLED`, `UNKNOWN`

---

## 20. Notifications

### 20.1 `notifications`

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| recipient_user_id | uuid |
| type | varchar(100) |
| priority | varchar(20) |
| title | varchar(255) |
| body | text |
| entity_type | varchar(80) |
| entity_id | uuid |
| read_at | timestamptz |
| created_at | timestamptz |

### 20.2 `notification_deliveries`

| Colonne | Type |
|---|---|
| id | uuid |
| notification_id | uuid |
| channel | varchar(30) |
| status | varchar(30) |
| provider_reference | varchar(255) |
| attempt_count | integer |
| delivered_at | timestamptz |
| error_code | varchar(100) |
| created_at | timestamptz |

---

## 21. Audit Logs

### 21.1 `audit_logs`

Les Audit Logs sont append-only.

| Colonne | Type |
|---|---|
| id | uuid |
| organization_id | uuid |
| actor_type | varchar(30) |
| actor_id | uuid, nullable |
| action | varchar(160) |
| resource_type | varchar(100) |
| resource_id | uuid, nullable |
| result | varchar(30) |
| reason_code | varchar(100) |
| request_id | varchar(120) |
| trace_id | varchar(120) |
| ip_address | inet |
| user_agent | text |
| metadata | jsonb |
| created_at | timestamptz |

Le champ `metadata` ne doit pas contenir : secrets ; documents complets ; prompts confidentiels ; données personnelles inutiles.

Les Audit Logs ne doivent pas être modifiables par les utilisateurs standards.

---

## 22. Events et traitements asynchrones

### 22.1 `outbox_events`

| Colonne | Type |
|---|---|
| id | uuid |
| event_type | varchar(160) |
| event_version | integer |
| organization_id | uuid, nullable |
| aggregate_type | varchar(100) |
| aggregate_id | uuid |
| aggregate_version | integer |
| correlation_id | uuid |
| causation_id | uuid, nullable |
| payload | jsonb |
| occurred_at | timestamptz |
| published_at | timestamptz |
| status | varchar(30) |
| attempt_count | integer |
| next_attempt_at | timestamptz |
| last_error | text |
| created_at | timestamptz |

Index critique : `(status, next_attempt_at, created_at)`

### 22.2 `processed_events`

Garantit l'idempotence des consommateurs.

| Colonne | Type |
|---|---|
| consumer_name | varchar(160) |
| event_id | uuid |
| status | varchar(30) |
| attempt_count | integer |
| processed_at | timestamptz |
| last_error | text |

Clé primaire : `PRIMARY KEY(consumer_name, event_id)`

### 22.3 `dead_letter_events`

| Colonne | Type |
|---|---|
| id | uuid |
| event_id | uuid |
| consumer_name | varchar(160) |
| error_code | varchar(100) |
| error_message | text |
| payload_snapshot | jsonb |
| attempt_count | integer |
| first_failed_at | timestamptz |
| last_failed_at | timestamptz |
| resolved_at | timestamptz |
| resolved_by | uuid |

---

## 23. Concurrence optimiste

Les agrégats sensibles doivent utiliser une colonne `version integer`.

Exemples : Tender ; TenderWorkspace ; Proposal ; ComplianceChecklist.

Mise à jour conceptuelle :

```sql
UPDATE tender_workspaces
SET
  status = $new_status,
  version = version + 1,
  updated_at = now()
WHERE
  id = $workspace_id
  AND organization_id = $organization_id
  AND version = $expected_version;
```

Si aucune ligne n'est modifiée : `CONCURRENT_MODIFICATION`

---

## 24. Indexation

**Index tenant-first** — Pour les tables tenant-scoped, privilégier `(organization_id, ...)`.

Exemples : `(organization_id, status)`, `(organization_id, created_at)`, `(organization_id, workspace_id)`

**Index sur les clés étrangères** — Toute clé étrangère utilisée dans les jointures fréquentes doit posséder un index.

**Index partiels**

```sql
CREATE INDEX active_tenders_deadline_idx
ON tenders (organization_id, submission_deadline)
WHERE deleted_at IS NULL
  AND status NOT IN ('ARCHIVED', 'CANCELLED', 'EXPIRED');
```

**Recherche approximative** — Pour les acheteurs et la déduplication :

```sql
CREATE INDEX buyers_normalized_name_trgm_idx
ON buyers
USING gin (normalized_name gin_trgm_ops);
```

---

## 25. Foreign Keys

**`ON DELETE RESTRICT`** — Politique recommandée pour les données métier importantes : Tenders ; Workspaces ; Proposals ; Submissions ; Audit Logs.

**`ON DELETE CASCADE`** — Uniquement pour les objets strictement internes à un parent et sans valeur indépendante. Exemples possibles : mentions d'un commentaire ; liaisons many-to-many ; lignes temporaires non auditées.

**`ON DELETE SET NULL`** — Pour les références historiques à un utilisateur supprimé ou désactivé. Exemple : `assigned_to`, `resolved_by`

Le choix exact doit être validé pour chaque relation.

---

## 26. Row-Level Security

PostgreSQL Row-Level Security peut être introduit comme défense supplémentaire.

```sql
ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_on_tenders
ON tenders
USING (
  organization_id = current_setting(
    'app.current_organization_id',
    true
  )::uuid
);
```

Décision initiale : les repositories doivent obligatoirement filtrer par organisation ; des tests multi-tenant sont obligatoires ; RLS pourra être activé lorsque le mécanisme de contexte de connexion sera stabilisé.

RLS ne remplace pas les contrôles applicatifs.

---

## 27. Données sensibles

Les colonnes sensibles doivent être identifiées. Exemples : informations personnelles ; documents confidentiels ; prix ; secrets d'intégration ; preuves de dépôt ; prompts IA ; résultats IA privés.

Les secrets ne doivent pas être stockés en clair dans les tables métier.

Utiliser : Secret Manager ; chiffrement applicatif si nécessaire ; hash pour les tokens ; références vers les secrets externes.

---

## 28. Rétention

Politiques à définir selon le type de donnée.

| Donnée | Politique |
|---|---|
| Sessions expirées | suppression périodique |
| Invitations expirées | suppression ou anonymisation |
| Avis sources bruts | conservation longue |
| Versions soumises | conservation renforcée |
| Audit Logs | politique contractuelle |
| AI Runs | conservation configurable |
| Documents supprimés | délai de grâce avant purge |
| Dead Letters | conservation jusqu'à résolution |

Aucune purge définitive ne doit être développée sans politique validée.

---

## 29. Sauvegarde et restauration

La base de production doit prévoir : sauvegardes automatiques ; point-in-time recovery si disponible ; chiffrement ; réplication selon le fournisseur ; tests de restauration ; procédure documentée.

Une sauvegarde non testée ne constitue pas une garantie de restauration.

---

## 30. Prisma

**Règles** — Les modèles Prisma sont placés dans `packages/database/prisma/`.

```text
prisma/
├── schema.prisma
├── models/
├── migrations/
└── seed/
```

Si Prisma ne permet pas plusieurs fichiers nativement dans la version utilisée, Claude doit utiliser une génération contrôlée ou maintenir un schéma unique organisé par domaines.

**Interdictions** — exposer les modèles Prisma dans l'API ; utiliser Prisma directement dans le Domain ; retourner un modèle Prisma depuis un Use Case ; utiliser `Json` sans schéma applicatif documenté ; créer des migrations manuelles non versionnées.

---

## 31. Seed Data

Les seeds doivent créer uniquement des données nécessaires au développement.

Exemples : permissions système ; rôles système ; sources Tender ; compte de démonstration ; organisation de test ; quelques Tenders factices.

Ils doivent être : idempotents ; sans secret réel ; différents des données de production ; exécutables localement.

---

## 32. Migrations

**Règles** — Chaque changement de schéma doit posséder : une migration versionnée ; une justification ; un test ; une stratégie de rollback ou de correction ; une analyse de compatibilité.

**Migration destructive** — Toute migration destructive exige validation. Sont notamment destructifs : suppression de table ; suppression de colonne ; changement de type avec perte potentielle ; réécriture massive ; ajout d'une contrainte sur des données non nettoyées.

**Stratégie**

```text
Expand
→ Backfill
→ Switch
→ Contract
```

---

## 33. Transactions métier

Les opérations suivantes doivent être transactionnelles.

**Création d'un Workspace**

```text
Créer Workspace
Créer WorkspaceMembership du responsable
Modifier le statut du Tender
Créer Activity
Créer AuditLog
Créer OutboxEvent
```

**Approbation d'une Proposal**

```text
Valider les invariants
Créer ProposalApproval
Définir approved_version_id
Mettre à jour le statut
Verrouiller si nécessaire
Créer AuditLog
Créer OutboxEvent
```

**Enregistrement d'une soumission**

```text
Vérifier le package
Créer Submission
Modifier Workspace
Créer Activity
Créer AuditLog
Créer OutboxEvent
```

---

## 34. Diagramme relationnel simplifié

```text
Organization
├── OrganizationMembership
│   └── MembershipRole
├── Tender
│   ├── TenderLot
│   ├── TenderMatch
│   ├── Qualification
│   │   └── GoNoGoDecision
│   └── TenderWorkspace
│       ├── WorkspaceMembership
│       ├── DCEPackage
│       │   └── DCEDocument
│       ├── Document
│       │   └── DocumentVersion
│       │       ├── DocumentChunk
│       │       └── Citation
│       ├── AIAnalysis
│       │   ├── Requirement
│       │   ├── EvaluationCriterion
│       │   └── Risk
│       ├── Proposal
│       │   ├── ProposalSection
│       │   ├── ProposalVersion
│       │   ├── ProposalReview
│       │   └── ProposalApproval
│       ├── WorkspaceTask
│       ├── Comment
│       ├── ComplianceChecklist
│       │   └── ComplianceItem
│       ├── SubmissionPackage
│       │   └── Submission
│       └── TenderOutcome
├── CompanyReference
├── Certification
├── KnowledgeEntry
├── Notification
├── AuditLog
└── OutboxEvent
```

---

## 35. Tables du premier vertical slice

Claude ne doit pas implémenter immédiatement toutes les tables de ce document.

La première tranche utilise uniquement :

```text
users
organizations
organization_memberships
roles
permissions
role_permissions
membership_roles
tenders
tender_status_history
audit_logs
outbox_events
processed_events
```

Fonctionnalités correspondantes : Authentification ; Création d'une Organization ; Membership ; Création manuelle d'un Tender ; Liste des Tenders ; Fiche Tender ; Changement de statut ; Audit ; Outbox.

---

## 36. Ordre d'implémentation du schéma

**Migration 001 — Platform** — `users`, `organizations`, `organization_memberships`

**Migration 002 — Authorization** — `roles`, `permissions`, `role_permissions`, `membership_roles`, `resource_access_grants`

**Migration 003 — Tender Foundation** — `buyers`, `tender_sources`, `tender_notices`, `tenders`, `tender_source_links`, `tender_lots`, `tender_cpv_codes`, `tender_status_history`

**Migration 004 — Qualification** — `tender_matches`, `qualifications`, `qualification_criteria`, `go_no_go_decisions`

**Migration 005 — Workspaces** — `tender_workspaces`, `workspace_memberships`, `workspace_status_history`, `workspace_milestones`, `workspace_tasks`

**Migration 006 — Documents et DCE** — `documents`, `document_versions`, `document_processing_jobs`, `document_text_contents`, `document_chunks`, `dce_packages`, `dce_documents`, `tender_amendments`

**Migration 007 — AI Analysis** — `ai_runs`, `ai_analyses`, `citations`, `requirements`, `evaluation_criteria`, `risks`

**Migration 008 — Company Brain** — `company_profiles`, `company_references`, `certifications`, `knowledge_candidates`, `knowledge_entries`

**Migration 009 — Proposal** — `proposals`, `proposal_sections`, `proposal_versions`, `proposal_section_versions`, `proposal_reviews`, `proposal_approvals`

**Migration 010 — Compliance et Submission** — `compliance_checklists`, `compliance_items`, `compliance_waivers`, `submission_packages`, `submission_package_files`, `submissions`, `tender_outcomes`

---

## 37. Tests obligatoires

**Intégrité** — une clé étrangère invalide est refusée ; un numéro de version dupliqué est refusé ; un email dupliqué sans distinction de casse est refusé ; une source Tender dupliquée est détectée.

**Multi-tenancy** — une Organization ne peut lire les Tenders d'une autre ; une recherche vectorielle ne retourne aucun chunk étranger ; un worker ne traite pas la mauvaise organisation ; un accès à un document exige son `organization_id`.

**Versionnement** — une version documentaire validée ne peut être modifiée ; une Proposal approuvée pointe vers une version immuable ; une soumission pointe vers un package précis.

**Transactions** — un échec d'Outbox annule la transaction métier ; un Workspace incomplet n'est jamais créé ; une approbation partielle est annulée en cas d'erreur.

**Idempotence** — un événement traité deux fois ne produit pas deux effets ; un import source identique n'est pas dupliqué ; les seeds peuvent être relancés.

---

## 38. Décisions nécessitant un ADR

Claude doit créer ou proposer un ADR avant de modifier : le modèle multi-tenant ; la stratégie d'identifiants ; Prisma ; PostgreSQL ; pgvector ; la stratégie de soft delete ; le stockage des documents ; la stratégie de versionnement ; l'Outbox ; la politique RLS ; la séparation entre données globales et tenant-scoped.

---

## 39. Critères d'acceptation

Le design de base de données est correctement implémenté lorsque :

- toutes les ressources tenant-scoped sont isolées ;
- les contraintes critiques existent en base ;
- les montants utilisent `numeric` ;
- les timestamps sont en UTC ;
- les fichiers sont stockés hors PostgreSQL ;
- les versions validées sont immuables ;
- les actions critiques sont auditées ;
- l'Outbox est transactionnelle ;
- les consumers sont idempotents ;
- les migrations sont versionnées ;
- les index tenant-first sont présents ;
- les tests multi-tenant passent ;
- aucune entité Prisma n'est exposée directement ;
- les tables sont créées progressivement selon les besoins.
