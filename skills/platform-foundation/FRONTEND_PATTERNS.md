# TenderOS — Frontend Patterns

Version : 1.0
Statut : Draft
Rôle concerné : Platform Foundation
Document parent : `skills/platform-foundation/SKILL.md`
Documents associés :

- `docs/04-architecture/ENGINEERING_STANDARDS.md` §30-37 (règles d'autorité — ce document en est la traduction en patterns d'implémentation)
- `docs/04-architecture/API_GUIDELINES.md`
- `bible/02-product/ubiquitous-language.md`
- `bible/03-domain/domain-model.md`
- `bible/03-domain/permissions.md`
- `skills/platform-foundation/ARCHITECTURE_RULES.md` §20
- `skills/platform-foundation/API_PATTERNS.md`
- `CLAUDE.md` (stack technique)

---

## 1. Objectif

Ce document définit les patterns d'implémentation obligatoires pour le frontend Next.js de TenderOS.

Il traduit en patterns concrets (structure de dossiers, composants, hooks, Server Actions) les règles déjà fixées par `ENGINEERING_STANDARDS.md` §30-37, qui reste le document d'autorité sur les décisions structurelles (Server Components par défaut, gestion de l'état, formulaires, accessibilité). Ce document ne redéfinit aucune règle : il montre comment l'appliquer dans le code, en cohérence avec `ARCHITECTURE_RULES.md` §20 (frontières Interfaces layer) et `API_PATTERNS.md` (contrat consommé).

Il précise notamment : la structure du frontend dans le monorepo ; l'organisation par feature ; la frontière Server/Client Components ; l'accès aux données ; les Server Actions ; la gestion de l'état ; les formulaires ; les permissions et capacités à l'écran ; les états d'interface obligatoires ; la gestion des erreurs API ; les opérations asynchrones et les uploads côté client ; l'accessibilité ; la sécurité ; les patterns de composant ; les anti-patterns interdits.

---

## 2. Documents d'autorité

Ordre de priorité pour toute question relative au frontend :

```text
1. PRODUCT_CONSTITUTION.md
2. bible/03-domain/business-rules.md
3. bible/03-domain/permissions.md
4. bible/03-domain/domain-model.md
5. bible/02-product/ubiquitous-language.md
6. bible/04-architecture/system-architecture.md
7. docs/04-architecture/API_GUIDELINES.md
8. docs/04-architecture/ENGINEERING_STANDARDS.md
9. skills/platform-foundation/ARCHITECTURE_RULES.md
10. skills/platform-foundation/API_PATTERNS.md
11. skills/platform-foundation/FRONTEND_PATTERNS.md   ← ce document
```

---

## 3. Ce que ce document ne couvre pas

Ce document couvre l'**architecture et les patterns de code** du frontend — pas le **langage visuel**.

`DESIGN_SYSTEM.md` (racine) liste les sujets attendus (couleurs, typographie, espacements, boutons, tableaux, cartes, icônes, états, responsive) mais son contenu, ainsi que celui de `bible/07-design/design-system.md`, `ux-principles.md` et `components.md`, est **actuellement vide**. Aucune valeur de token visuel (palette, échelle typographique, grille d'espacement) n'est donc disponible comme source d'autorité.

Ce document ne comble pas cette lacune : il ne définit ni ne suppose de tokens visuels. Il pose les règles structurelles (où vit un composant, comment il récupère ses données, comment il gère ses états) qui restent valables quel que soit le design visuel final. La rédaction de `DESIGN_SYSTEM.md` est un chantier documentaire distinct, hors périmètre de ce document.

---

## 4. Principes directeurs

```text
Server-first before client-first
Business logic never lives in a component
Server remains the authority, UI is a reflection
Explicit data flow before implicit context
Minimal client state before global stores
Accessible by default, not by afterthought
Predictable UI states over clever loading spinners
Typed contracts before hand-written fetch calls
Feature cohesion before generic abstraction
```

---

## 5. Stack technique de référence

Conformément à `CLAUDE.md` :

```text
Next.js
React
TypeScript (strict)
Tailwind CSS
```

TypeScript strict est obligatoire, avec la même configuration que le backend (`ARCHITECTURE_RULES.md`, `SKILL.md` §14). Aucune bibliothèque de composants UI n'est imposée par la documentation existante ; tant que `DESIGN_SYSTEM.md` n'est pas rédigé, tout composant visuel est construit avec Tailwind CSS et les primitives HTML/React, sans dépendance de composants tierce ajoutée sans validation (`ARCHITECTURE_RULES.md` — décision de niveau 2 ou 3 selon la portée, voir `SKILL.md` §36-37).

---

## 6. Position dans l'architecture

Le frontend appartient à la couche **Interfaces** de la Clean Architecture définie par `ARCHITECTURE_RULES.md` : il traduit un protocole (navigateur, requêtes HTTP) vers l'Application, il ne porte aucune règle métier.

```text
Browser
  ↓
Next.js (Interfaces)
  ↓ typed API client / Server Actions
API TenderOS — /api/v1 (Interfaces → Application → Domain)
```

Le frontend n'accède jamais directement à Prisma, à la base de données, ou aux use cases en process. Il consomme exclusivement l'API décrite par `API_PATTERNS.md`, via un client typé ou des Server Actions contrôlées (§17-18).

---

## 7. Structure du monorepo frontend

```text
apps/
└── web/
    ├── app/
    ├── features/
    ├── components/
    ├── server/
    └── lib/

packages/
├── contracts/     ← schémas Zod, types de réponse, codes d'erreur (partagés avec l'API)
└── ui/            ← composants génériques, sans dépendance métier
```

`apps/web/components/` contient des compositions locales à l'application web (souvent proches d'une feature mais réutilisées par plusieurs). `packages/ui` contient les composants réellement génériques, publiables et réutilisables indépendamment de TenderOS — voir §13.

---

## 8. Organisation par feature

Le frontend est organisé par fonctionnalité métier, alignée sur les modules backend (`ENGINEERING_STANDARDS.md` §30) :

```text
apps/web/features/
├── tenders/
├── qualification/
├── workspaces/
├── documents/
├── proposals/
└── compliance/
```

Un composant métier reste dans sa feature. Un composant n'est déplacé vers `packages/ui` que lorsqu'il devient réellement générique (§13-14) — le déplacement anticipé, sans second consommateur réel, est une abstraction prématurée interdite par les principes de `ARCHITECTURE_RULES.md`.

---

## 9. Structure d'une feature

```text
features/tenders/
├── components/
│   ├── tender-detail-card.tsx
│   ├── tender-status-badge.tsx
│   └── shortlist-tender-button.tsx
├── hooks/
│   └── use-tender-details.ts
├── actions/
│   └── shortlist-tender.action.ts
├── types/
│   └── tender-view-model.ts
└── index.ts
```

Tous les dossiers ne sont pas obligatoires — créés uniquement lorsqu'une responsabilité réelle existe, conformément à `MODULE_TEMPLATE.md` §6.

---

## 10. Server Components par défaut

Les Server Components sont utilisés par défaut, conformément à `ENGINEERING_STANDARDS.md` §31.

Ils conviennent à : la lecture initiale d'une page ; le rendu de listes et de détails ; l'orchestration de plusieurs sources de données ; toute logique ne nécessitant aucune interactivité client.

```typescript
// app/tenders/[tenderId]/page.tsx
export default async function TenderDetailPage(
  props: { params: { tenderId: string } },
) {
  const tender = await getTenderDetails(props.params.tenderId);

  return <TenderDetailView tender={tender} />;
}
```

`getTenderDetails` appelle le client API typé côté serveur (§15), jamais Prisma directement.

---

## 11. Client Components — quand et comment

Un Client Component est réservé aux besoins réels : interactions utilisateur ; état local ; effets navigateur ; formulaires interactifs ; drag-and-drop ; éditeurs riches ; WebSocket (`ENGINEERING_STANDARDS.md` §31).

```typescript
"use client";

export function ShortlistTenderButton(
  props: { tenderId: string; disabled: boolean },
) {
  const { mutate, isPending } = useShortlistTender();

  return (
    <button
      type="button"
      disabled={props.disabled || isPending}
      onClick={() => mutate({ tenderId: props.tenderId })}
    >
      Shortlist
    </button>
  );
}
```

`"use client"` est déclaré au plus près du besoin d'interactivité, jamais en tête d'un arbre complet de page pour éviter d'y réfléchir composant par composant.

---

## 12. Frontière Server/Client

Un Server Component peut rendre un Client Component et lui passer des props sérialisables. L'inverse est impossible directement : un Client Component ne peut pas importer un Server Component pour l'exécuter côté client.

```text
Server Component (page)
  → fetches data
  → renders Client Component (interactive island)
      → receives typed, serializable props
```

Un Server Component ne doit jamais transmettre à un Client Component : une fonction non sérialisable ; un secret ; un token brut ; une donnée d'un autre tenant récupérée par erreur.

---

## 13. Composants partagés — `packages/ui`

Un composant de `packages/ui` doit être : accessible ; documenté ; testable ; visuellement cohérent ; **sans dépendance métier cachée** (`ENGINEERING_STANDARDS.md` §37).

```typescript
// packages/ui/src/badge.tsx
export function Badge(props: {
  tone: "neutral" | "positive" | "warning" | "critical";
  children: React.ReactNode;
}) {
  return (
    <span className={badgeClassName(props.tone)}>
      {props.children}
    </span>
  );
}
```

`Badge` ne connaît pas `TenderStatus` : c'est la feature `tenders` qui mappe un statut métier vers une tonalité visuelle (`tone`), pas l'inverse.

---

## 14. Interdiction de logique métier dans `packages/ui`

`packages/ui` ne doit jamais contenir : une règle métier Tender ; une vérification de permission ; un appel API ; une logique de Workspace ou de Proposal (`ENGINEERING_STANDARDS.md` §37).

```text
Interdit dans packages/ui :
  if (tender.status === "SHORTLISTED") { ... }
  useCanShortlistTender()
  fetch("/api/v1/tenders/...")
```

Ce package doit pouvoir être extrait dans un dépôt indépendant sans emporter de connaissance de TenderOS.

---

## 15. Accès aux données — Server Components

Un Server Component récupère ses données via un client API typé côté serveur, jamais via Prisma ni un use case en process (`ARCHITECTURE_RULES.md` §20.2-20.3).

```typescript
// apps/web/server/api-client.ts
export async function getTenderDetails(
  tenderId: string,
): Promise<TenderDetails> {
  const response = await serverApiFetch(
    `/tenders/${tenderId}`,
    { method: "GET" },
  );

  return TenderDetailsSchema.parse(response);
}
```

Le client transporte l'authentification (session/token) de la requête entrante vers l'appel API, propage `X-Request-Id`/`correlationId` (`API_PATTERNS.md` §28), et valide la réponse avec le schéma partagé de `packages/contracts`.

---

## 16. Accès aux données — Client Components

Pour les données interactives côté client, la solution recommandée est **TanStack Query** (`ENGINEERING_STANDARDS.md` §34).

```typescript
export function useTenderDetails(tenderId: string) {
  return useQuery({
    queryKey: ["organization", organizationId, "tenders", tenderId],
    queryFn: () => fetchTenderDetails(tenderId),
  });
}
```

Les clés de cache doivent être : structurées ; **tenant-aware** (`organizationId` toujours présent) ; stables ; invalidées explicitement après une mutation. Une clé de cache sans `organizationId` pour une donnée tenant-scoped est interdite — voir §32.

```typescript
useMutation({
  mutationFn: shortlistTender,
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ["organization", organizationId, "tenders"],
    });
  },
});
```

---

## 17. Server Actions

Une Server Action peut encapsuler un appel à l'API pour une mutation déclenchée depuis un formulaire ou une interaction simple. Elle ne doit jamais contourner : les use cases ; les permissions ; le tenant scope ; l'audit ; les contrats métier (`ARCHITECTURE_RULES.md` §20.3).

```typescript
"use server";

export async function shortlistTenderAction(
  input: { tenderId: string; reason?: string },
) {
  const actor = await getAuthenticatedActor();

  return serverApiFetch(
    `/tenders/${input.tenderId}/shortlist`,
    {
      method: "POST",
      body: { reason: input.reason },
      actor,
    },
  );
}
```

Une Server Action appelle l'API TenderOS comme n'importe quel client — elle n'a pas d'accès privilégié à la base de données ou au Domain. Elle traduit les erreurs API (`API_PATTERNS.md` §13-14) en un résultat exploitable par le formulaire.

---

## 18. Client API typé et contrats partagés

Tous les appels API — Server Components, Server Actions, Client Components — utilisent un client généré ou construit à partir des contrats de `packages/contracts` (schémas Zod, types de réponse, catalogue de codes d'erreur), jamais un type dupliqué à la main dans le frontend.

```typescript
import type { TenderDetails } from "@tenderos/contracts/tenders";
```

Un type de réponse frontend qui diverge du contrat backend est un défaut à corriger dans `packages/contracts`, jamais à contourner localement par un type frontend parallèle.

---

## 19. Gestion de l'état

Priorité, du plus préférable au moins préférable (`ENGINEERING_STANDARDS.md` §33) :

```text
1. Server state       — données possédées par l'API, lues via Server Component ou Query
2. URL state           — filtres, pagination, onglet actif
3. Form state           — état d'un formulaire en cours de saisie
4. Local component state — état d'affichage strictement local
5. Global client state  — uniquement si aucune option précédente ne convient
```

Ne pas introduire un store global pour une donnée qui peut rester dans le serveur, l'URL, un formulaire, ou un composant local.

---

## 20. State global — quand l'utiliser

Un store global (ex. contexte React partagé, état applicatif transverse) n'est justifié que pour un état réellement transverse à l'application entière et non dérivable des quatre niveaux précédents : par exemple l'organisation active sélectionnée par l'utilisateur, ou l'état d'un panneau de notification global.

L'introduction d'un store global est une décision de niveau 2 au sens de `SKILL.md` §36 — elle doit être annoncée, pas ajoutée silencieusement au fil d'une fonctionnalité.

---

## 21. Formulaires

Recommandation : **React Hook Form + Zod** (`ENGINEERING_STANDARDS.md` §35).

```typescript
const ShortlistTenderFormSchema = z.object({
  reason: z.string().trim().min(1).max(2_000).optional(),
});

export function ShortlistTenderForm(props: { tenderId: string }) {
  const form = useForm<z.infer<typeof ShortlistTenderFormSchema>>({
    resolver: zodResolver(ShortlistTenderFormSchema),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await shortlistTenderAction({
      tenderId: props.tenderId,
      reason: values.reason,
    });
  });

  return <form onSubmit={onSubmit}>{/* fields */}</form>;
}
```

Un formulaire doit : afficher clairement les erreurs ; empêcher les doubles soumissions (`isSubmitting`/`isPending`) ; préserver les données saisies lors d'une erreur récupérable ; gérer les états de chargement ; être accessible au clavier ; éviter les validations contradictoires avec le backend.

---

## 22. Validation double — ergonomique vs autoritaire

Le schéma Zod utilisé côté frontend est une validation **ergonomique** : elle donne un retour immédiat à l'utilisateur, mais ne remplace jamais la validation du backend décrite par `API_PATTERNS.md` §22.

Idéalement, le schéma frontend est dérivé du même contrat que le schéma backend (`packages/contracts`), pour éviter deux définitions divergentes de la même règle.

---

## 23. Permissions et capacités côté frontend

Le backend expose des capacités calculées pour l'UX, conformément à `API_GUIDELINES.md` §75 :

```json
{
  "capabilities": {
    "canEdit": true,
    "canArchive": false,
    "canCreateWorkspace": true
  }
}
```

Le frontend utilise ces capacités pour : masquer ou désactiver une action non autorisée ; expliquer pourquoi une action est indisponible ; refléter l'état de la ressource.

Ces capacités **ne remplacent jamais** le contrôle serveur (`ENGINEERING_STANDARDS.md` §32) : le backend revérifie systématiquement l'autorisation lors de l'appel réel, y compris si le frontend a laissé un bouton actif par erreur.

```typescript
export function TenderActions(
  props: { tender: TenderDetails },
) {
  return (
    <ShortlistTenderButton
      tenderId={props.tender.id}
      disabled={!props.tender.capabilities.canShortlist}
    />
  );
}
```

---

## 24. Affichage conditionnel selon les capacités

Une action non autorisée est de préférence : désactivée avec une explication contextuelle (tooltip, texte d'aide), plutôt que masquée sans indication — sauf si son existence même constitue une fuite d'information (ex. action réservée à un rôle que l'utilisateur ne doit pas savoir exister).

```text
canShortlist: false, reasonCode: "INVALID_RESOURCE_STATUS"
→ bouton désactivé + "Cette action n'est plus disponible pour ce statut."

canShortlist: false, reasonCode: "PERMISSION_MISSING"
→ bouton masqué ou désactivé selon la sensibilité du rôle concerné
```

Le mapping `reasonCode → message` réutilise le vocabulaire de `bible/03-domain/permissions.md` §31 et le catalogue de `API_PATTERNS.md` §14 — jamais un message inventé au cas par cas dans un composant.

---

## 25. Aucune autorité de sécurité côté client

Toute action déclenchée depuis le navigateur — y compris via une manipulation de l'état client, une modification directe d'une requête, ou l'utilisation d'un outil de développement — doit être refusée côté serveur si elle n'est pas réellement autorisée.

```text
UI désactivée ≠ opération bloquée
Seule la vérification serveur (§17, API_PATTERNS.md §17) fait foi.
```

---

## 26. États UI obligatoires

Tout composant consommant une donnée asynchrone représente explicitement quatre états :

```text
Loading  — squelette ou indicateur, jamais un écran vide silencieux
Empty    — état vide explicite avec action possible si pertinente
Error    — message compréhensible, sans détail technique (§27)
Success  — rendu normal des données
```

```typescript
if (query.isLoading) return <TenderListSkeleton />;
if (query.isError) return <TenderListError error={query.error} />;
if (query.data.items.length === 0) return <TenderListEmptyState />;

return <TenderList items={query.data.items} />;
```

Un écran qui ne gère qu'un seul de ces états (typiquement le succès) n'est pas considéré comme terminé.

---

## 27. Gestion des erreurs API côté frontend

Une erreur API suit l'enveloppe définie par `API_PATTERNS.md` §13 :

```json
{
  "error": {
    "code": "INVALID_TENDER_STATUS_TRANSITION",
    "message": "...",
    "requestId": "req_...",
    "details": {}
  }
}
```

Le frontend mappe `error.code` vers un message utilisateur localisé et une action éventuelle (retry, redirection, formulaire réaffiché avec erreurs de champ). Le `message` brut de l'API est technique et ne doit pas être affiché tel quel à l'utilisateur final sans passage par ce mapping.

```typescript
export function toUserMessage(code: ApiErrorCode): string {
  switch (code) {
    case "PERMISSION_MISSING":
      return "Vous n'avez pas les droits nécessaires pour cette action.";
    case "CONCURRENT_MODIFICATION":
      return "Cet élément a été modifié entre-temps. Merci de recharger la page.";
    case "VALIDATION_FAILED":
      return "Certains champs sont invalides.";
    default:
      return "Une erreur inattendue est survenue.";
  }
}
```

`requestId` est affiché ou copiable dans les messages d'erreur destinés à être signalés au support, jamais dans un message d'erreur générique destiné à un utilisateur non technique.

---

## 28. Opérations asynchrones longues côté frontend

Une opération longue (analyse IA, génération de package) suit le pattern `202 Accepted` + suivi d'opération décrit par `API_PATTERNS.md` §23.

```typescript
export function useOperationStatus(operationId: string) {
  return useQuery({
    queryKey: ["operations", operationId],
    queryFn: () => fetchOperation(operationId),
    refetchInterval: (query) =>
      query.state.data?.status === "RUNNING" ||
      query.state.data?.status === "QUEUED"
        ? 2_000
        : false,
  });
}
```

L'interface affiche la progression (`progress.currentStep`, `completedUnits`/`totalUnits`) plutôt qu'un simple indicateur indéterminé lorsque cette information est disponible.

---

## 29. Upload de fichiers côté frontend

Le flux d'upload suit les huit étapes de `API_PATTERNS.md` §24 : le fichier est envoyé directement vers l'URL signée retournée par l'API, jamais transmis en passant par le serveur applicatif Next.js.

```typescript
const { uploadUrl, uploadId, requiredHeaders } =
  await requestDocumentUpload(workspaceId, file);

await fetch(uploadUrl, {
  method: "PUT",
  headers: requiredHeaders,
  body: file,
});

await completeDocumentUpload(uploadId);
```

L'interface affiche une progression d'upload, gère l'échec réseau avec retry manuel, et ne considère le fichier disponible qu'après confirmation ET traitement asynchrone terminé côté serveur.

---

## 30. Pagination et listes infinies

Les collections utilisent la pagination par curseur définie par `API_PATTERNS.md` §11.

```typescript
useInfiniteQuery({
  queryKey: ["organization", organizationId, "tenders", filters],
  queryFn: ({ pageParam }) => fetchTenders({ ...filters, cursor: pageParam }),
  getNextPageParam: (lastPage) =>
    lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.nextCursor : undefined,
});
```

Le curseur n'est jamais construit ou décodé côté frontend : il est transmis tel que reçu de l'API.

---

## 31. Recherche et filtres

Un champ de recherche texte applique un debounce avant de déclencher la requête. Les filtres et le tri sont reflétés dans l'URL (`ENGINEERING_STANDARDS.md` §33 — URL state) pour rester partageables et navigables au bouton retour.

```text
/tenders?status=SHORTLISTED&sort=-createdAt&q=centre+administratif
```

Seuls les champs whitelistés par l'API (`API_PATTERNS.md` §12) sont proposés dans l'interface de tri.

---

## 32. Multi-tenant côté frontend

`organizationId` est explicite dans : les clés de cache (§16) ; les routes nécessitant un contexte d'organisation ; les appels au client API (propagé automatiquement par `apps/web/server/api-client.ts`, jamais reconstruit manuellement par chaque composant).

Un changement d'organisation active doit invalider entièrement le cache client concerné — aucune donnée d'une organisation précédente ne doit rester visible après un changement de contexte.

```typescript
useEffect(() => {
  queryClient.removeQueries({ queryKey: ["organization", previousOrganizationId] });
}, [organizationId]);
```

---

## 33. Accessibilité

Le produit vise au minimum les bonnes pratiques **WCAG 2.1 AA** (`ENGINEERING_STANDARDS.md` §36).

Exigences minimales : navigation clavier complète ; labels de formulaires associés à leurs champs ; contraste suffisant ; focus visible ; messages d'erreur compréhensibles et associés au champ concerné ; boutons avec noms accessibles (pas d'icône seule sans `aria-label`) ; titres structurés (`h1`→`h2`→`h3` sans saut) ; absence de dépendance exclusive à la couleur pour transmettre une information (ex. statut) ; support des lecteurs d'écran pour les actions critiques.

```typescript
<button aria-label="Archiver l'appel d'offres" onClick={onArchive}>
  <ArchiveIcon aria-hidden="true" />
</button>
```

---

## 34. Internationalisation

Conformément au principe défini dans `DATABASE_PATTERNS.md` §62, le frontend sépare :

```text
Stable internal code (ex. error.code, status enum)
+
Localized user-facing message
```

Un `code` d'erreur ou de statut n'est jamais traduit directement ; il est mappé vers un message localisé (§27). La locale par défaut est le français, conformément à la langue du produit ; l'architecture ne doit pas empêcher une localisation future, sans qu'elle soit nécessairement implémentée dès la première version.

---

## 35. Performance frontend

Le frontend applique par défaut les optimisations offertes par Next.js : rendu serveur et streaming pour réduire le temps au premier contenu utile ; découpage de code par route/feature ; chargement différé des Client Components lourds (éditeurs riches, visualiseurs de documents) ; optimisation des images.

Aucune optimisation ne doit être ajoutée sans mesure préalable, conformément au principe général de `ARCHITECTURE_RULES.md` §38 (résilience et performance) — pas de mémoïsation ou de découpage spéculatif sans preuve de ralentissement réel.

---

## 36. Sécurité frontend

Le frontend ne stocke aucun secret, clé API, ou credential de fournisseur. Un token de session est manipulé uniquement côté serveur (cookies `httpOnly`, jamais de token sensible exposé à un Client Component ou au `localStorage`) — détail complet dans `SECURITY_PATTERNS.md` (à venir).

Tout contenu utilisateur affiché (titre de Tender, commentaire, texte de proposition) est traité comme non fiable et échappé/sanitizé avant rendu, particulièrement pour tout rendu de contenu riche (éditeur, aperçu de document).

---

## 37. Tests frontend

La stratégie complète est définie dans `TESTING_PATTERNS.md` (à venir). Le minimum attendu par composant ou écran significatif : cas nominal ; erreur serveur ; permission refusée (capacité désactivée) ; état vide ; état de chargement ; interaction clavier ; soumission de formulaire, y compris invalide ; opération asynchrone suivie jusqu'à son terme.

Les tests ne dépendent jamais d'un backend réel non maîtrisé : les appels API sont simulés via les contrats de `packages/contracts`.

---

## 38. Pattern — Server Component de lecture

```typescript
// app/tenders/page.tsx
export default async function TendersPage(
  props: { searchParams: TendersSearchParams },
) {
  const tenders = await listTenders({
    status: props.searchParams.status,
    sort: props.searchParams.sort,
    cursor: props.searchParams.cursor,
  });

  return <TenderList initialData={tenders} />;
}
```

Le Server Component effectue la première lecture ; un Client Component enfant peut ensuite prendre le relais avec TanStack Query pour la pagination interactive, initialisé avec `initialData` pour éviter un état de chargement inutile au premier rendu.

---

## 39. Pattern — Client Component avec TanStack Query

```typescript
"use client";

export function TenderList(
  props: { initialData: TenderListResponse },
) {
  const { data } = useTenders({ initialData: props.initialData });

  if (data.items.length === 0) return <TenderListEmptyState />;

  return (
    <ul>
      {data.items.map((tender) => (
        <TenderListItem key={tender.id} tender={tender} />
      ))}
    </ul>
  );
}
```

---

## 40. Pattern — Server Action encapsulant une mutation

```typescript
"use server";

export async function recordGoNoGoDecisionAction(
  input: {
    tenderId: string;
    decision: "GO" | "NO_GO" | "WATCHING";
    rationale: string;
  },
) {
  try {
    return {
      success: true as const,
      data: await serverApiFetch(
        `/tenders/${input.tenderId}/go-no-go-decisions`,
        { method: "POST", body: input },
      ),
    };
  } catch (error) {
    return {
      success: false as const,
      error: toApiError(error),
    };
  }
}
```

Une Server Action retourne un résultat discriminé (`success: true | false`) plutôt que de laisser une exception non gérée remonter jusqu'au composant appelant.

---

## 41. Pattern — formulaire avec état de soumission

```typescript
export function GoNoGoDecisionForm(props: { tenderId: string }) {
  const form = useForm<GoNoGoDecisionFormValues>({
    resolver: zodResolver(GoNoGoDecisionFormSchema),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await recordGoNoGoDecisionAction({
      tenderId: props.tenderId,
      ...values,
    });

    if (!result.success) {
      form.setError("root", { message: toUserMessage(result.error.code) });
      return;
    }

    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} aria-busy={form.formState.isSubmitting}>
      {/* fields */}
      <button type="submit" disabled={form.formState.isSubmitting}>
        Enregistrer la décision
      </button>
    </form>
  );
}
```

---

## 42. Pattern — capacité et raison de refus

```typescript
export function ArchiveTenderButton(
  props: { tender: TenderDetails },
) {
  if (!props.tender.capabilities.canArchive) {
    return (
      <ButtonWithTooltip
        disabled
        tooltip={toUserMessage(
          props.tender.capabilities.archiveDeniedReasonCode,
        )}
      >
        Archiver
      </ButtonWithTooltip>
    );
  }

  return <ArchiveTenderActiveButton tenderId={props.tender.id} />;
}
```

---

## 43. Exemple complet — écran de détail d'un Tender

Aligné sur le Domain Model réel (`bible/03-domain/domain-model.md`, `business-rules.md` §7) : un Tender `SHORTLISTED` avec la capacité `canRecordGoNoGoDecision` active.

```text
app/tenders/[tenderId]/page.tsx        → Server Component, fetch initial
features/tenders/components/
  tender-detail-header.tsx             → statut, référence, échéance
  tender-status-badge.tsx              → packages/ui Badge + mapping statut→tone
  go-no-go-decision-panel.tsx          → Client Component, formulaire
features/tenders/actions/
  record-go-no-go-decision.action.ts   → Server Action → POST .../go-no-go-decisions
```

La page Server Component charge `TenderDetails` (incluant `capabilities`) ; le panneau de décision Go/No-Go est un Client Component parce qu'il porte un formulaire interactif ; l'action serveur appelle l'endpoint défini dans `API_PATTERNS.md` §35 ; le mapping `TenderStatus → tone` reste dans la feature `tenders`, jamais dans `packages/ui`.

---

## 44. Anti-patterns interdits

```text
Logique métier (règle Tender, calcul de permission) dans un composant React
Composant packages/ui connaissant un type ou statut métier TenderOS
"use client" sur un arbre de page entier sans besoin d'interactivité
Appel direct à Prisma ou à un use case depuis le frontend
Type de réponse dupliqué à la main au lieu d'être importé de packages/contracts
Clé de cache TanStack Query sans organizationId pour une donnée tenant-scoped
Store global introduit pour une donnée dérivable du serveur, de l'URL ou d'un formulaire
Message d'erreur API brut affiché tel quel à l'utilisateur final
Bouton d'action laissé actif sans vérification de capabilities côté UI
Sécurité reposant uniquement sur un bouton désactivé ou masqué côté client
Upload de fichier transitant par le serveur Next.js plutôt qu'une URL signée
Curseur de pagination construit ou modifié côté frontend
Secret, token brut ou credential exposé à un Client Component
Composant sans état de chargement, vide, ou erreur représenté
Traduction directe d'un code d'erreur ou de statut sans passage par un mapping
```

---

## 45. Conditions bloquantes

La livraison d'un écran ou d'une feature frontend doit être bloquée lorsque : une action métier n'est pas revérifiée côté serveur ; une donnée tenant-scoped est mise en cache sans `organizationId` ; un composant `packages/ui` contient une dépendance métier ; un état d'erreur, de chargement ou vide manque sur un composant consommant une donnée asynchrone ; un formulaire ne gère pas la double soumission ; un code d'erreur ou de statut est affiché brut à l'utilisateur ; l'accessibilité minimale (clavier, labels, contraste) n'est pas respectée sur un parcours critique.

---

## 46. Definition of Ready

La conception d'un écran ou d'une feature frontend est prête lorsque : l'intention métier et le parcours utilisateur sont compris ; le ou les endpoints API consommés existent ou sont définis dans `API_PATTERNS.md` ; les capacités (`capabilities`) nécessaires sont connues ; les états UI (loading/empty/error/success) sont identifiés ; la nécessité d'un Client Component est tranchée ; la stratégie de cache/invalidation est connue si des données mutables sont affichées.

---

## 47. Definition of Done

Une feature frontend est terminée lorsque :

```text
Server Components used by default, Client Components justified
+
No business logic leaks into packages/ui
+
Data access goes through the typed API client or Server Actions only
+
Server remains the authority for every permission-sensitive action
+
Tenant scope explicit in every cache key
+
Loading, empty, error and success states implemented
+
Forms handle validation, submission state and recoverable errors
+
Accessibility baseline (WCAG 2.1 AA) respected
+
API error codes mapped to user-facing messages
+
Tests cover nominal, error, permission-denied and empty states
```

---

## 48. Checklist de conception d'un écran

**Architecture**

- [ ] Server Component utilisé par défaut.
- [ ] Client Component justifié par un besoin d'interactivité réel.
- [ ] Aucun accès direct à Prisma ou à un use case.
- [ ] Types importés de `packages/contracts`, non dupliqués.

**Données**

- [ ] Clé de cache tenant-aware si applicable.
- [ ] Invalidation explicite après mutation.
- [ ] Pagination par curseur pour les collections volumineuses.

**Sécurité**

- [ ] Capacités (`capabilities`) utilisées pour l'affichage, pas pour la sécurité.
- [ ] Aucune action sensible protégée uniquement côté client.
- [ ] Aucun secret ou token exposé au Client Component.

**États**

- [ ] État de chargement présent.
- [ ] État vide présent.
- [ ] État d'erreur présent, avec message mappé depuis `error.code`.
- [ ] Double soumission empêchée sur les formulaires.

**Accessibilité**

- [ ] Navigation clavier complète.
- [ ] Labels associés aux champs.
- [ ] Contraste suffisant.
- [ ] Focus visible.

**Tests**

- [ ] Cas nominal.
- [ ] Erreur serveur.
- [ ] Permission refusée.
- [ ] État vide et chargement.

---

## 49. Critères d'acceptation

Ce document est correctement appliqué lorsque :

- les Server Components restent la solution par défaut, les Client Components l'exception justifiée ;
- aucune règle métier ne fuit dans `packages/ui` ;
- toute donnée transite par le client API typé ou une Server Action contrôlée, jamais par un accès direct à l'infrastructure ;
- le serveur reste l'autorité de sécurité, quelle que soit l'affichage côté client ;
- le tenant est explicite dans chaque clé de cache et chaque appel ;
- les quatre états d'interface (loading/empty/error/success) sont systématiquement représentés ;
- les erreurs API sont mappées vers des messages utilisateur, jamais affichées brutes ;
- l'accessibilité WCAG 2.1 AA de base est respectée sur les parcours critiques ;
- les exemples de ce document restent cohérents avec le Domain Model réel et les contrats définis par `API_PATTERNS.md` ;
- l'absence de `DESIGN_SYSTEM.md` renseigné n'est pas comblée par des suppositions visuelles dans ce document.
