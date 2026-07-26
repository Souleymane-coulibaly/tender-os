# Module Documents

Statut : implémenté (V1). AI/OCR/RAG et Billing sont explicitement hors périmètre.

## 1. Objectif

Gérer le cycle de vie des documents d'une organisation (dépôt, versionnage, métadonnées,
archivage, suppression logique, association à un Tender), avec un stockage physique découplé de
tout fournisseur concret. Le module ne fait aucune extraction de texte, aucune indexation, aucune
génération assistée par IA — ces capacités sont volontairement préparées mais non implémentées.

## 2. Position dans l'architecture

```
Identity ← Organizations ← Memberships ← { PlatformAdministration, Tenders, Documents }
```

`Documents` dépend de la façade publique de `Tenders` (uniquement `GetTenderUseCase`, réexporté
par `tenders/index.ts`) pour vérifier qu'un Tender existe et appartient à l'organisation active
avant une association. La dépendance inverse n'existe pas : `Tenders` ignore tout de `Documents`.

Couches (Clean Architecture / DDD, identique aux autres modules) :

```
apps/api/src/modules/documents/
├── domain/            # Document, DocumentVersion, DocumentTenderAssociation, erreurs, permissions
├── application/       # ports, use cases, DTOs, validation de fichier, clé de stockage
├── infrastructure/     # repositories Prisma, LocalFilesystemStorageProvider, audit writer
└── interfaces/http/    # schémas Zod, presenters, contrôleurs, filtre d'erreurs
```

## 3. Modèle de données

- **Document** — agrégat racine. `origin` (USER_UPLOAD | DCE | TEMPLATE | GENERATED | IMPORTED),
  `domain` (TENDER | ORGANIZATION | KNOWLEDGE | TEMPLATE | GENERATED — volontairement limité à 5
  valeurs), `category` (chaîne libre, non contrainte côté serveur — la classification métier RC/
  CCAP/CCTP/AE/BPU/KBIS/CV... est une liste de suggestions **frontend uniquement**), `status`
  (ACTIVE | ARCHIVED — le cycle de vie ne connaît pas de statut DELETED), `deletedAt` pour la
  suppression logique (même convention que `User.deletedAt`/`Organization.deletedAt`).
- **DocumentVersion** — entité immuable (aucune mutation après création). Porte directement
  `storageKey`, `mimeType`, `checksum` (SHA-256), `sizeBytes`, `originalFilename` (jamais utilisé
  comme clé de stockage) et `sanitizedFilename`. Pas d'entité `StorageObject` séparée : la
  déduplication future, si nécessaire, peut se faire en rendant l'adaptateur de stockage
  content-addressable, sans migration de schéma.
- **`Document.currentVersionId` + `currentVersionNumber`** (pointeur + dénormalisation) plutôt
  qu'un flag `latest` sur `DocumentVersion` — intégrité référentielle réelle (FK), promotion en
  une seule écriture.
- **DocumentTenderAssociation** — table de liaison pure (`documentId`, `tenderId`,
  `organizationId`, contrainte unique) ; supprimer une association ne touche jamais le document.
- **`TenderRequestedDocument.documentId`** porte désormais une vraie FK vers `Document` (avant :
  UUID nu sans contrainte).

Migration : `20260726210729_add_documents_module` (CREATE TABLE / CREATE INDEX / ADD CONSTRAINT
uniquement — non destructive ; FK `TenderRequestedDocument → Document` en `ON DELETE SET NULL`).

## 4. Permissions

`DocumentPermission` + `ROLE_DOCUMENT_PERMISSIONS` (même pattern en code que
`TenderPermission`/`ROLE_TENDER_PERMISSIONS`) — aucun système de rôles indépendant, les rôles
existants (`OrganizationRole`) sont réutilisés :

| Tier | Rôles | Droits |
| --- | --- | --- |
| Admin | `ORGANIZATION_ADMIN`, `BID_MANAGER` | tous (y compris archive/restore/delete) |
| Contributor | `CONTRIBUTOR` | read, download, create, upload_version, update, attach_to_tender |
| Viewer | `REVIEWER`, `EXECUTIVE`, `EXTERNAL_CONSULTANT`, `READ_ONLY` | read, download uniquement |

## 5. Stockage

Port `StorageProvider` (`put`/`openReadStream`/`delete`/`exists`/`getMetadata` +
`generateSignedUrl?` optionnel) — Domain et Application ne dépendent jamais de `fs`, S3 ou du SDK
R2. V1 : `LocalFilesystemStorageProvider` (répertoire configurable via
`DOCUMENT_LOCAL_STORAGE_PATH`), sans `generateSignedUrl` → toutes les requêtes sont
API-médiées (upload multipart en mémoire, téléchargement en flux via l'API).

La clé de stockage (`storageKey`) est **toujours** générée côté serveur à partir d'UUID
(`{organizationId}/{documentId}/{versionId}.{extension}`), jamais dérivée du nom de fichier
fourni par le client. `storageKey` n'est **jamais** exposé dans une réponse API (voir DTOs).

### Vers Cloudflare R2

Le port `StorageProvider` est déjà suffisant pour un adaptateur R2 : implémenter les mêmes
méthodes plus `generateSignedUrl`, l'enregistrer à la place de `LocalFilesystemStorageProvider`
dans `documents.module.ts`. Aucun use case n'a besoin de changer — `DownloadDocumentVersionUseCase`
bascule déjà automatiquement en mode redirection dès que `generateSignedUrl` existe sur le port.

## 6. Validation de fichier

- Jamais de confiance dans l'extension seule, le MIME déclaré par le client seul, ou le nom de
  fichier seul — `isAllowedFileType(mimeType, extension)` exige une paire connue et cohérente
  (`allowed-file-types.ts` : PDF, Word, Excel, CSV, texte, PNG, JPEG).
- Taille maximale configurable (`DOCUMENT_MAX_FILE_SIZE_MB`, appliquée par
  `validateIncomingFile`) ; un plafond brut Multer (100 Mo, codé en dur) protège en amont contre
  la bufferisation d'un corps de requête arbitrairement volumineux avant même cette validation.
- Concurrence de version : pas de verrou applicatif — la contrainte unique
  `(documentId, versionNumber)` en base est le véritable garde-fou ; une violation `P2002` est
  traduite en `ConcurrentVersionCreationError`. Vérifié par un test d'intégration réel (deux
  `addVersionAndPromote` simultanés contre Postgres, `Promise.allSettled`).

## 7. Pas de file d'attente

Aucun BullMQ, aucun bus d'événements réel dans ce dépôt. Tous les événements du cycle de vie
(`document.created`, `document.version_created`, `document.metadata_updated`,
`document.archived`, `document.restored`, `document.deleted`, `document.attached_to_tender`,
`document.detached_from_tender`) sont réalisés comme des écritures synchrones dans `audit_logs`
via `AuditLogWriter` (même pattern que Tenders/Memberships).

Le nettoyage d'un fichier orphelin (upload physique réussi puis échec de la transaction DB, ou
suppression logique d'un document) reste une procédure manuelle documentée ici, jamais un job
automatique :

1. Repérer les clés de stockage sans `DocumentVersion` correspondante (upload orphelin) ou dont
   le `Document` a `deletedAt` non nul depuis longtemps.
2. Supprimer l'objet via `StorageProvider.delete(key)` (jamais un accès direct au système de
   fichiers ou au SDK R2 en dehors de l'adaptateur).

## 8. API

Toutes les routes sont protégées par `AuthenticatedGuard` + `OrganizationMembershipGuard`
(en-tête `X-Organization-Id` requis, revalidé contre une Membership active réelle).

```
POST   /documents                                   multipart — crée + première version
GET    /documents                                   liste paginée + filtres (status/origin/domain/search/tri)
GET    /documents/:documentId
PATCH  /documents/:documentId
DELETE /documents/:documentId                        suppression logique
POST   /documents/:documentId/archive
POST   /documents/:documentId/restore
GET    /documents/:documentId/versions
POST   /documents/:documentId/versions               multipart — nouvelle version
GET    /documents/:documentId/download                version courante
GET    /documents/:documentId/versions/:versionId/download
POST   /documents/:documentId/tenders/:tenderId       association
DELETE /documents/:documentId/tenders/:tenderId       dissociation
GET    /tenders/:tenderId/documents                   documents associés (route portée par Documents)
```

Filtre d'erreurs dédié (`DocumentsErrorFilter`) — mappe les 15 erreurs du Domain Documents **et**
`TENDER_NOT_FOUND` (propagé tel quel depuis `GetTenderUseCase` de Tenders lors d'une association,
jamais ré-enveloppé).

## 9. Sécurité multi-tenant

Chaque méthode de repository est scopée à `organizationId` (`findById`, `list`,
`listByTenderId`) — un ID de document ou de version valide mais appartenant à une autre
organisation ne peut structurellement pas être retrouvé (retourne 404, jamais 403, pour ne
jamais révéler l'existence d'une ressource étrangère).

## 10. Frontend

- `apps/web/src/lib/documents-types.ts` — types + labels + fonctions de gating UI
  (`canUploadOrEditDocument`, `canManageDocumentLifecycle` — jamais l'autorité réelle, seulement
  un confort d'affichage, revalidé côté API à chaque requête).
- `/app/documents` — bibliothèque (liste, filtres, lien de création).
- `/app/documents/new` — dépôt (formulaire multipart).
- `/app/documents/[id]` — fiche document (métadonnées, versions, téléchargement, ajout de
  version, archivage/restauration/suppression selon le rôle).
- `/app/documents/[id]/download` — route Next.js qui relaie l'appel authentifié vers l'API (le
  jeton de session est un cookie httpOnly serveur uniquement ; un lien direct vers l'API ne
  pourrait pas s'authentifier lui-même).
- Onglet "Documents" sur la fiche Tender (`tenders/[id]/documents-section.tsx`) — dépôt +
  association en une étape, association d'un document existant par ID, dissociation.
- Pas d'aperçu PDF avancé, pas de conversion DOCX/Excel, pas d'OCR (hors périmètre explicite).

## 11. Préparation du futur module IA

- Le checksum SHA-256 de chaque version est déjà stocké — réutilisable pour la déduplication ou
  la détection de doublons par un futur pipeline d'ingestion.
- `DocumentVersion` étant immuable et versionnée, un futur module d'extraction de texte/RAG peut
  s'appuyer sur `(documentId, versionNumber)` comme clé stable sans jamais modifier ce module.
- Le port `StorageProvider` permet à un futur worker d'ingestion de lire le contenu binaire
  (`openReadStream`) sans connaître le fournisseur de stockage réel.
- Aucune colonne, aucun champ, aucune dépendance vers un moteur d'embedding n'a été ajouté —
  strictement hors périmètre de cette tranche.

## 12. Limites connues (V1)

- Pas de recherche plein texte dans le contenu des fichiers (uniquement titre/nom de fichier).
- Pas de liste "dans quels Tenders ce document est-il utilisé" depuis la fiche document (seul le
  sens Tender → Documents est exposé par l'API ; ajouter le sens inverse nécessiterait un nouvel
  endpoint, hors périmètre de cette tranche).
- Pas de sélecteur de recherche de document dans l'onglet Tender (association par ID uniquement).
- Pas de prévisualisation de fichier dans l'UI (téléchargement uniquement).
