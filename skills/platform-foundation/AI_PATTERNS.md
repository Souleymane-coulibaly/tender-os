# TenderOS — AI Patterns

Version : 1.0
Statut : Draft
Rôle concerné : Platform Foundation
Document parent : `skills/platform-foundation/SKILL.md`
Documents associés :

- `docs/05-ai/AI_ARCHITECTURE.md` (règles d'autorité — ce document en est la traduction en patterns d'implémentation)
- `bible/03-domain/domain-model.md`
- `bible/03-domain/permissions.md` §10, §13
- `bible/03-domain/business-rules.md`
- `skills/platform-foundation/ARCHITECTURE_RULES.md` §27
- `skills/platform-foundation/API_PATTERNS.md`
- `skills/platform-foundation/DATABASE_PATTERNS.md` §65-66

---

## 1. Objectif

Ce document définit les patterns d'implémentation obligatoires pour toute capacité IA de TenderOS.

Il traduit en patterns concrets (interfaces TypeScript, structure de Skill, pipelines) la doctrine déjà fixée par `docs/05-ai/AI_ARCHITECTURE.md`, qui reste le document d'autorité sur les décisions de fond (ce que l'IA peut ou ne peut pas faire, les seuils de qualité, la politique de confidentialité, l'ordre d'implémentation). Ce document ne redéfinit aucune règle : il montre comment l'appliquer dans le code, en cohérence avec `ARCHITECTURE_RULES.md` §27 (frontières architecturales) et `API_PATTERNS.md` (contrat HTTP des opérations IA).

Il précise notamment : la structure d'un module et d'un Skill IA ; le port `AIGateway` et son implémentation ; le pattern AI Use Case ; la composition et la validation des sorties structurées ; le RAG ; les citations ; les AI Runs ; le traitement asynchrone ; l'idempotence ; les agents et le tool-calling ; les coûts et budgets ; la résilience ; les erreurs ; les permissions IA ; les tests obligatoires.

---

## 2. Documents d'autorité

Ordre de priorité pour toute question relative à l'IA :

```text
1. PRODUCT_CONSTITUTION.md
2. bible/03-domain/business-rules.md
3. bible/03-domain/permissions.md
4. bible/03-domain/domain-model.md
5. bible/02-product/ubiquitous-language.md
6. bible/04-architecture/system-architecture.md
7. docs/05-ai/AI_ARCHITECTURE.md
8. docs/04-architecture/API_GUIDELINES.md
9. docs/04-architecture/DATABASE_DESIGN.md
10. docs/04-architecture/ENGINEERING_STANDARDS.md
11. skills/platform-foundation/ARCHITECTURE_RULES.md
12. skills/platform-foundation/API_PATTERNS.md
13. skills/platform-foundation/DATABASE_PATTERNS.md
14. skills/platform-foundation/AI_PATTERNS.md   ← ce document
```

Le stub racine `IA_ARCHITECTURE.md` (27 lignes) diverge légèrement de `docs/05-ai/AI_ARCHITECTURE.md` sur la liste des agents (ex. « Task Planner Agent », « Reviewer Agent », « Analytics Agent » n'existent pas dans le document canonique). `docs/05-ai/AI_ARCHITECTURE.md` fait autorité ; le stub racine doit être considéré obsolète.

---

## 3. Ce que ce document ne couvre pas

Ce document couvre l'**architecture d'implémentation** des capacités IA — pas le **contenu** des prompts eux-mêmes.

`bible/05-ai/prompt-library.md`, `agents.md`, `ai-vision.md`, `evaluation.md`, `rag.md`, ainsi que l'ensemble de `bible/06-skills/*.md` et `docs/prompts/*.md`, sont **actuellement vides**. Aucun prompt réel, aucune définition métier fine d'un agent (au-delà de ce que fixe `AI_ARCHITECTURE.md` §8-9), et aucun jeu d'évaluation concret n'existe donc comme source d'autorité.

Ce document ne comble pas cette lacune : il définit comment un Skill est structuré, versionné et exécuté, pas ce que son prompt contient. La rédaction des prompts, de la bibliothèque de Skills détaillée et des jeux d'évaluation est un chantier produit/IA distinct, hors périmètre de ce document.

---

## 4. Principes directeurs

Rappel condensé de `AI_ARCHITECTURE.md` §2, appliqué à chaque pattern de ce document :

```text
AI assists, humans decide
No direct model access from business modules
Evidence before confidence
Structured outputs before free text
Tenant isolation before retrieval
Permissions before context construction
Human approval before critical action
Provider independence
Traceability by default
Cost awareness
Graceful degradation
No silent hallucination
```

---

## 5. Position dans l'architecture

L'IA est une capacité d'Infrastructure consommée par l'Application via un port, exactement comme le stockage ou la base de données (`ARCHITECTURE_RULES.md` §16, §27).

```text
Business Use Case (Application)
  → AI Use Case (Application)
    → AIGateway (port)
      → AI Gateway implementation (Infrastructure)
        → Policy & Context Builder
          → Skill / Prompt
            → Model Router
              → Provider Adapter
                → LLM or AI Service
```

Le Domain n'appelle jamais l'IA. Un agrégat ne connaît ni `AIGateway`, ni un Skill, ni un modèle — voir `ARCHITECTURE_RULES.md` §4.2.

---

## 6. Structure d'un module IA

```text
packages/ai/
├── gateway/
│   ├── ai-gateway.port.ts
│   ├── ai-gateway.service.ts
│   └── model-router.ts
├── providers/
│   ├── openai-provider.adapter.ts
│   ├── anthropic-provider.adapter.ts
│   └── provider.port.ts
├── skills/
│   └── dce-analyst/
│       ├── SKILL.md
│       ├── input-schema.ts
│       ├── output-schema.ts
│       ├── prompt.ts
│       └── evaluation/
├── runs/
│   ├── ai-run.repository.ts
│   └── ai-run.entity.ts
└── rag/
    ├── chunking/
    ├── embedding/
    └── retrieval/
```

Un module métier (`modules/tenders`, `modules/documents`, ...) ne contient jamais sa propre copie de logique IA : il consomme `packages/ai` via le port `AIGateway`, conformément à `ARCHITECTURE_RULES.md` §16.

---

## 7. Le port `AIGateway`

```typescript
export interface AIGateway {
  execute<TInput, TOutput>(
    request: AIExecutionRequest<TInput, TOutput>,
  ): Promise<AIExecutionResult<TOutput>>;
}

export type AIExecutionRequest<TInput, TOutput> = {
  organizationId: OrganizationId;
  actorId: UserId;
  workspaceId?: WorkspaceId;
  operation: AIOperation;
  skillName: string;
  skillVersion: string;
  input: TInput;
  outputSchema: ZodSchema<TOutput>;
  confidentialityLevel: ConfidentialityLevel;
  correlationId: CorrelationId;
  idempotencyKey?: string;
};

export type AIExecutionResult<TOutput> = {
  aiRunId: string;
  status: AIRunStatus;
  output?: TOutput;
  confidence?: "LOW" | "MEDIUM" | "HIGH";
  citations?: Citation[];
};
```

C'est l'unique point d'entrée. Aucun module métier n'importe un SDK fournisseur (`openai`, `@anthropic-ai/sdk`, ...) — cette dépendance reste confinée à `packages/ai/providers`.

---

## 8. Implémentation du Model Router

```typescript
export class ModelRouter {
  route(input: {
    operation: AIOperation;
    category: ModelCategory;
    confidentialityLevel: ConfidentialityLevel;
    contextSize: number;
  }): ModelSelection {
    const candidates = this.policy.candidatesFor(input.category);

    const allowed = candidates.filter((candidate) =>
      this.confidentialityPolicy.isAllowed(
        candidate.provider,
        candidate.region,
        input.confidentialityLevel,
      ),
    );

    if (allowed.length === 0) {
      throw new AIPolicyDeniedError({ operation: input.operation });
    }

    return this.rankByPolicy(allowed, input)[0];
  }
}
```

Catégories de modèle (`AI_ARCHITECTURE.md` §16.1) : `FAST_CLASSIFICATION`, `STRUCTURED_EXTRACTION`, `LONG_CONTEXT_ANALYSIS`, `REASONING`, `CONTENT_GENERATION`, `EMBEDDING`, `OCR`, `VISION`. Le routage vérifie la confidentialité **avant** tout critère de coût ou de latence — un modèle moins cher mais non autorisé pour le niveau de confidentialité requis n'est jamais sélectionné.

---

## 9. Pattern — AI Use Case

Un AI Use Case suit la même structure qu'un use case métier (`MODULE_TEMPLATE.md` §22-23), avec une étape supplémentaire de construction du contexte et de validation de sortie.

```typescript
export class RunDceAnalysisUseCase {
  constructor(
    private readonly transactionManager: TransactionManager,
    private readonly authorizationPolicy: DceAnalysisAuthorizationPolicy,
    private readonly aiGateway: AIGateway,
    private readonly aiRunRepository: AIRunRepository,
    private readonly outboxWriter: OutboxWriter,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RunDceAnalysisCommand,
  ): Promise<RunDceAnalysisResult> {
    const permission = await this.authorizationPolicy.canRun({
      organizationId: command.organizationId,
      actorId: command.actorId,
      workspaceId: command.workspaceId,
    });

    if (!permission.allowed) {
      throw new PermissionDeniedError({ permission: "ai-analysis:run" });
    }

    const aiRun = await this.aiRunRepository.createQueued({
      organizationId: command.organizationId,
      workspaceId: command.workspaceId,
      actorId: command.actorId,
      operation: "dce-analysis",
      skillName: "dce-analyst",
      skillVersion: DCE_ANALYST_SKILL_VERSION,
      correlationId: command.correlationId,
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [new DceAnalysisQueued({ aiRunId: aiRun.id, ...command })],
      correlationId: command.correlationId,
    });

    return { aiRunId: aiRun.id, status: "QUEUED" };
  }
}
```

L'exécution réelle du modèle a lieu dans un **worker**, jamais dans la requête HTTP synchrone (§17) — le use case ici ne fait que valider, autoriser, et mettre en file d'attente.

---

## 10. Structure d'un Skill

```text
skills/dce-analyst/
├── SKILL.md          — rôle, instructions, règles métier applicables, exemples
├── input-schema.ts    — Zod schema de l'entrée
├── output-schema.ts   — Zod schema de la sortie structurée
├── prompt.ts          — composition du prompt (§12)
├── policy.ts          — outils autorisés, limites, conditions d'arrêt
└── evaluation/
    ├── datasets/
    ├── expected/
    └── scorers/
```

Un Skill contient : rôle ; instructions ; règles métier applicables ; contexte autorisé ; format de sortie ; interdictions ; exemples ; critères de qualité ; comportement en cas d'incertitude (`AI_ARCHITECTURE.md` §10). Ce contenu vit dans `SKILL.md` du dossier du Skill — jamais dispersé en chaînes de caractères inline dans le code applicatif.

---

## 11. Versionnement d'un Skill

```typescript
export const DCE_ANALYST_SKILL_VERSION = "1.0.0";
```

Chaque exécution enregistre `skillName`, `skillVersion`, `promptVersion`, `modelName`, `provider`, `outputSchemaVersion` (`AI_ARCHITECTURE.md` §11). Une modification significative du prompt, du schéma de sortie ou des règles métier applicables incrémente la version — jamais une réécriture silencieuse d'une version déjà en production.

```text
dce-analyst@1.0.0
proposal-writer@1.2.0
compliance-reviewer@2.0.0
```

---

## 12. Composition du prompt

```typescript
export function buildDceAnalystPrompt(
  input: DceAnalystPromptInput,
): ComposedPrompt {
  return {
    system: SYSTEM_POLICY,
    skillInstructions: DCE_ANALYST_INSTRUCTIONS,
    businessRules: input.applicableBusinessRules,
    authorizationContext: {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      confidentialityLevel: input.confidentialityLevel,
    },
    taskInput: input.taskInput,
    retrievedEvidence: input.retrievedChunks,
    outputSchema: DceAnalystOutputSchema,
  };
}
```

Chaque composant a une source identifiable (`AI_ARCHITECTURE.md` §13). Le contenu récupéré (`retrievedEvidence`) est explicitement marqué comme donnée, jamais fusionné avec les instructions système — voir §34 (prompt injection).

---

## 13. Sortie structurée

```typescript
const RequirementExtractionSchema = z.object({
  requirements: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      category: z.string(),
      mandatory: z.boolean(),
      criticality: z.enum(["LOW", "MEDIUM", "HIGH", "BLOCKING"]),
      confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
      citations: z.array(CitationSchema),
    }),
  ),
});
```

Une sortie IA sans schéma explicite n'est jamais acceptée par l'AI Gateway — `outputSchema` est un champ obligatoire de `AIExecutionRequest` (§7).

---

## 14. Pipeline de validation de sortie

```typescript
export async function validateAIOutput<TOutput>(
  raw: unknown,
  schema: ZodSchema<TOutput>,
  context: OutputValidationContext,
): Promise<TOutput> {
  const syntactic = tryParseJson(raw);
  const schemaResult = schema.safeParse(syntactic);

  if (!schemaResult.success) {
    const repaired = await attemptSchemaRepair(syntactic, schema, {
      maxAttempts: 1,
    });

    if (!repaired.success) {
      throw new AIOutputInvalidError({ issues: schemaResult.error.issues });
    }
  }

  await validateBusinessRules(schemaResult.data, context);
  await validatePermissions(schemaResult.data, context);
  await validateCitations(schemaResult.data, context);

  return schemaResult.data;
}
```

Ordre obligatoire : `Syntax → Schema → Business → Permission → Citation → Persistence` (`AI_ARCHITECTURE.md` §34). Une réparation automatique (§35) ne comble jamais une donnée métier manquante — elle corrige uniquement une non-conformité structurelle proche du schéma attendu, et n'est tentée qu'une fois.

---

## 15. Pattern — Provider Adapter

```typescript
export interface LanguageModelProvider {
  generate(
    request: ProviderGenerationRequest,
  ): Promise<ProviderGenerationResponse>;
}

export class OpenAIProviderAdapter implements LanguageModelProvider {
  async generate(
    request: ProviderGenerationRequest,
  ): Promise<ProviderGenerationResponse> {
    // Traduction vers le SDK fournisseur, gestion des erreurs spécifiques,
    // application des timeouts, mapping vers le format neutre.
  }
}
```

Un adapter ne contient aucune règle métier ; il traduit un appel neutre vers l'API du fournisseur et inversement. L'ajout d'un fournisseur (`AnthropicProviderAdapter`, `AzureOpenAIProviderAdapter`, `BedrockProviderAdapter`) n'affecte jamais le code appelant `AIGateway`.

---

## 16. Pipeline RAG — ingestion

```text
Document Upload
→ Security Validation
→ Text Extraction
→ Normalization
→ Structural Segmentation
→ Chunking
→ Metadata Enrichment
→ Embedding
→ Vector Indexing
```

```typescript
export class IngestDocumentForRetrievalUseCase {
  async execute(command: IngestDocumentCommand): Promise<void> {
    const text = await this.extractor.extract(command.documentVersionId);
    const chunks = this.chunker.chunk(text, {
      preserveStructure: true,
    });

    for (const chunk of chunks) {
      const embedding = await this.embeddingProvider.embed(chunk.text);

      await this.chunkRepository.save({
        organizationId: command.organizationId,
        workspaceId: command.workspaceId,
        documentId: command.documentId,
        documentVersionId: command.documentVersionId,
        chunkIndex: chunk.index,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        sectionTitle: chunk.sectionTitle,
        confidentialityLevel: command.confidentialityLevel,
        embedding,
        embeddingModel: this.embeddingProvider.modelName,
      });
    }
  }
}
```

Métadonnées minimales d'un chunk (`AI_ARCHITECTURE.md` §23.1) : `organizationId`, `workspaceId`, `documentId`, `documentVersionId`, `chunkIndex`, `pageStart`, `pageEnd`, `sectionTitle`, `documentType`, `confidentialityLevel`, `language`, `checksum`, `embeddingModel`, `createdAt`. Voir `DATABASE_PATTERNS.md` §65 pour le schéma de persistance.

---

## 17. Pipeline RAG — retrieval sécurisé

```typescript
export class RetrieveRelevantChunksUseCase {
  async execute(
    query: RetrievalQuery,
  ): Promise<RankedChunk[]> {
    const candidates = await this.chunkRepository.search({
      organizationId: query.organizationId,
      workspaceIds: query.allowedWorkspaceIds,
      maxConfidentiality: query.actorClearance,
      documentVersion: query.explicitVersion ?? "current",
      excludeDeleted: true,
      queryEmbedding: await this.embeddingProvider.embed(query.text),
      limit: query.candidateLimit,
    });

    return this.reranker.rerank(candidates, query);
  }
}
```

Le filtre de sécurité s'applique **avant** ou **pendant** la requête vectorielle, jamais après (`AI_ARCHITECTURE.md` §25) :

```sql
organizationId = currentOrganization
AND workspaceId IN allowedWorkspaces
AND confidentialityLevel <= actorClearance
AND deletedAt IS NULL
AND documentVersion = currentOrExplicitVersion
```

La proximité vectorielle seule ne détermine jamais l'autorisation d'accès à un chunk.

---

## 18. Pattern — Context Builder

```typescript
export class ContextBuilder {
  build(input: {
    retrievedChunks: RankedChunk[];
    tokenBudget: number;
    actorClearance: ConfidentialityLevel;
  }): BuiltContext {
    const authorized = input.retrievedChunks.filter(
      (chunk) => chunk.confidentialityLevel <= input.actorClearance,
    );

    const deduplicated = deduplicateBySource(authorized);
    const withinBudget = truncateToTokenBudget(
      deduplicated,
      input.tokenBudget,
    );

    return {
      sources: withinBudget,
      conflicts: detectConflicts(withinBudget),
    };
  }
}
```

Priorité des sources (`AI_ARCHITECTURE.md` §29) : document officiel du DCE > addendum officiel plus récent > clarification officielle > donnée validée par l'organisation > Company Brain approuvé > proposition historique autorisée > suggestion IA non validée. Une source de faible autorité ne doit jamais contredire silencieusement une source officielle — un conflit détecté est signalé, pas résolu automatiquement.

---

## 19. Pattern — citations

```typescript
export const CitationSchema = z.object({
  documentId: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  pageNumber: z.number().int().positive(),
  sectionTitle: z.string().optional(),
  chunkId: z.string().uuid(),
  quoteExcerpt: z.string().max(500),
});
```

Une citation pointe vers une version immuable (`documentVersionId`), jamais uniquement vers `documentId` (`ARCHITECTURE_RULES.md` — cohérent avec le pattern Document/DocumentVersion de `MODULE_TEMPLATE.md` §29). `quoteExcerpt` doit correspondre exactement au texte du chunk référencé — validé lors du pipeline de §14, jamais généré librement par le modèle.

---

## 20. Pattern — AI Run

```typescript
export interface AIRunRepository {
  createQueued(input: {
    organizationId: string;
    workspaceId?: string;
    actorId: string;
    operation: string;
    skillName: string;
    skillVersion: string;
    correlationId: string;
  }): Promise<AIRun>;

  markRunning(aiRunId: string): Promise<void>;

  markSucceeded(input: {
    aiRunId: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: string;
    outputSummary: unknown;
  }): Promise<void>;

  markFailed(input: {
    aiRunId: string;
    errorCode: string;
  }): Promise<void>;
}
```

Champs d'un AI Run (`AI_ARCHITECTURE.md` §52, `DATABASE_PATTERNS.md` §66) : `id`, `organizationId`, `workspaceId`, `actorId`, `operation`, `skillName`, `skillVersion`, `provider`, `modelName`, `status`, `startedAt`, `completedAt`, `durationMs`, `inputTokens`, `outputTokens`, `estimatedCost`, `correlationId`, `errorCode`.

États (`AI_ARCHITECTURE.md` §53) : `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `PARTIALLY_SUCCEEDED`, `INVALID_OUTPUT`, `REQUIRES_REVIEW`.

Toute opération IA significative crée un AI Run avant l'appel au modèle — jamais après coup, pour garantir la traçabilité même en cas d'échec.

---

## 21. Traitement asynchrone d'une opération IA

Aligné sur `API_PATTERNS.md` §23 : une opération IA est acceptée, mise en file, exécutée par un worker.

```text
API Request
→ Permission Check
→ AI Run Created (QUEUED)
→ Outbox Event
→ Worker
→ AI Gateway
→ Persist Result
→ Domain Event
→ Notification
```

```text
POST /api/v1/workspaces/{workspaceId}/dce-analyses
→ 202 Accepted
{ "operationId": "aiRun_...", "status": "QUEUED", "statusUrl": "/api/v1/operations/aiRun_..." }
```

L'endpoint API ne diffère pas structurellement d'une opération asynchrone non-IA — le suivi via `GET /operations/{operationId}` reste identique.

---

## 22. Idempotence et fingerprint

```typescript
export function computeInputFingerprint(input: {
  documentVersionIds: string[];
  skillVersion: string;
  outputSchemaVersion: string;
  companyBrainSnapshotId?: string;
}): string {
  return sha256(canonicalJsonStringify(input));
}
```

Clé d'idempotence (`AI_ARCHITECTURE.md` §54) : `organizationId`, `workspaceId`, `operation`, `inputFingerprint`, `skillVersion`. Deux appels avec un fingerprint identique peuvent réutiliser un résultat déjà validé, selon la politique du Skill — voir `API_PATTERNS.md` §19 pour le mécanisme HTTP générique sous-jacent.

---

## 23. Invalidation des résultats

```typescript
export async function invalidateAffectedAnalyses(
  event: DocumentVersionSuperseded,
): Promise<void> {
  await this.aiAnalysisRepository.markInvalidated({
    organizationId: event.organizationId,
    documentId: event.documentId,
    reason: "SOURCE_DOCUMENT_CHANGED",
  });
}
```

Une analyse est invalidée lorsque : le document source change ; un addendum est ajouté ; une exigence est corrigée ; le Company Brain est modifié ; la politique change ; le Skill change significativement ; une citation devient inaccessible ; une erreur est découverte (`AI_ARCHITECTURE.md` §56). L'état `INVALIDATED` est distinct de `SUPERSEDED` (§38) : une donnée invalidée doit être régénérée, une donnée superseded a déjà été remplacée.

---

## 24. Pattern — agent et tool-calling

```typescript
export interface AgentTool<TInput, TOutput> {
  name: string;
  execute(
    input: TInput,
    context: AgentExecutionContext,
  ): Promise<TOutput>;
}

export class SearchWorkspaceDocumentsTool
  implements AgentTool<SearchInput, SearchResult>
{
  async execute(
    input: SearchInput,
    context: AgentExecutionContext,
  ): Promise<SearchResult> {
    // Vérifie context.organizationId, context.workspaceId, context.actorId
    // avant toute recherche — jamais une recherche non scopée.
    return this.retrieval.search({
      organizationId: context.organizationId,
      workspaceId: input.workspaceId,
      actorClearance: context.actorClearance,
      text: input.query,
    });
  }
}
```

Règle fondamentale (`bible/03-domain/permissions.md` §13) :

```text
Permissions Agent ⊆ Permissions Utilisateur
```

Un agent agit avec les permissions de l'acteur à l'origine de la demande — il ne les élargit jamais. Chaque outil vérifie le tenant, vérifie les permissions, valide ses entrées, limite les données retournées, et est audité si nécessaire (`AI_ARCHITECTURE.md` §46).

---

## 25. Outils autorisés et interdits

Outils typiques exposés à un agent : `SearchWorkspaceDocuments`, `ReadDocumentChunk`, `ListRequirements`, `ReadCompanyReference`, `CreateDraftSection`, `RecordAIAnalysis`.

```typescript
const FORBIDDEN_TOOL_CAPABILITIES = [
  "DELETE_DATA",
  "MANAGE_PERMISSIONS",
  "MODIFY_ROLES",
  "SUBMIT_OFFICIALLY",
  "SEND_EXTERNAL_UNCONTROLLED",
  "EXECUTE_SQL",
  "EXECUTE_SYSTEM_COMMAND",
  "ACCESS_ALL_TENANTS",
  "ACCESS_SECRETS",
] as const;
```

Un agent ne dispose jamais directement de ces capacités (`AI_ARCHITECTURE.md` §47), quelle que soit la permission de l'acteur — ce sont des opérations réservées à des use cases métier avec leur propre chaîne d'autorisation et de confirmation humaine explicite (§26).

---

## 26. Conditions d'arrêt et limites

```typescript
export const DCE_ANALYST_AGENT_LIMITS: AgentLimits = {
  maxSteps: 8,
  maxModelCalls: 5,
  maxTokens: 60_000,
  maxDurationSeconds: 180,
  maxCostEur: 0.5,
};

export function shouldStop(
  state: AgentExecutionState,
  limits: AgentLimits,
): StopDecision {
  if (state.steps >= limits.maxSteps) return { stop: true, reason: "MAX_STEPS_REACHED" };
  if (state.modelCalls >= limits.maxModelCalls) return { stop: true, reason: "MAX_MODEL_CALLS_REACHED" };
  if (state.elapsedSeconds >= limits.maxDurationSeconds) return { stop: true, reason: "MAX_DURATION_REACHED" };
  if (state.estimatedCostEur >= limits.maxCostEur) return { stop: true, reason: "MAX_COST_REACHED" };
  if (state.objectiveAchieved) return { stop: true, reason: "OBJECTIVE_ACHIEVED" };
  return { stop: false };
}
```

Les valeurs exactes dépendent du Skill (`AI_ARCHITECTURE.md` §50) mais doivent toujours être définies explicitement — une boucle agentique sans limite déclarée est un anti-pattern bloquant (§40).

---

## 27. Niveaux de validation humaine

```typescript
export type HumanReviewLevel = "A_ASSISTANCE" | "B_RECOMMENDATION" | "C_CRITICAL_DECISION";

export function requiresHumanReviewBeforeUse(
  level: HumanReviewLevel,
): boolean {
  return level !== "A_ASSISTANCE";
}
```

**Niveau A — Assistance** (résumé, classification non critique) : validation légère ou facultative. **Niveau B — Recommandation** (score de qualification, risque, brouillon) : validation humaine requise avant usage métier important. **Niveau C — Décision critique** (approbation, Go/No-Go, conformité finale, soumission) : l'IA ne peut jamais exécuter la décision (`AI_ARCHITECTURE.md` §37).

Un use case IA de niveau C ne doit exposer aucun chemin d'exécution automatique — uniquement une proposition consommée par un use case métier distinct, lui-même soumis aux permissions humaines normales.

---

## 28. Coûts et budgets

```typescript
export class AIBudgetGuard {
  async assertWithinBudget(input: {
    organizationId: string;
    estimatedCostEur: number;
  }): Promise<void> {
    const usage = await this.costTracker.currentUsage(input.organizationId);

    if (usage.dailyCostEur + input.estimatedCostEur > usage.dailyBudgetEur) {
      throw new AIBudgetExceededError({
        organizationId: input.organizationId,
        scope: "DAILY",
      });
    }
  }
}
```

Limites possibles (`AI_ARCHITECTURE.md` §67) : `maxCostPerRun`, `dailyOrganizationBudget`, `monthlyOrganizationBudget`. Une limite dépassée produit `AI_BUDGET_EXCEEDED` avant l'appel au modèle, pas après.

---

## 29. Cache IA

```typescript
function aiCacheKey(input: {
  organizationId: string;
  operation: string;
  skillVersion: string;
  inputFingerprint: string;
  modelPolicyVersion: string;
}): string {
  return [
    "ai-cache",
    input.organizationId,
    input.operation,
    input.skillVersion,
    input.inputFingerprint,
    input.modelPolicyVersion,
  ].join(":");
}
```

Un cache IA n'est utilisé que si le tenant est inclus dans la clé, la confidentialité est respectée, une durée est définie, et l'invalidation suit un changement de version de Skill, de modèle, ou de politique (`AI_ARCHITECTURE.md` §69, cohérent avec `DATABASE_PATTERNS.md` §27).

---

## 30. Résilience

```typescript
export const AI_GATEWAY_RETRY_POLICY: RetryPolicy = {
  retryableErrors: [
    "AI_TIMEOUT",
    "AI_PROVIDER_UNAVAILABLE",
    "AI_RATE_LIMITED",
  ],
  nonRetryableErrors: [
    "AI_POLICY_DENIED",
    "AI_BUDGET_EXCEEDED",
    "AI_OUTPUT_INVALID",
    "AI_CONTEXT_TOO_LARGE",
  ],
  backoff: "EXPONENTIAL_WITH_JITTER",
  maxAttempts: 3,
};
```

Un circuit breaker (`CLOSED` / `OPEN` / `HALF_OPEN`) protège contre un fournisseur durablement indisponible. Le fallback vers un fournisseur secondaire doit respecter les mêmes contraintes de confidentialité et de résidence des données que le fournisseur principal (`AI_ARCHITECTURE.md` §19, §70-73) — jamais un relâchement silencieux de ces garanties pour maintenir la disponibilité.

---

## 31. Dégradation contrôlée

Lorsque l'IA est indisponible, le produit continue de permettre : upload de documents ; consultation ; édition manuelle ; gestion des tâches ; qualification manuelle ; rédaction manuelle ; conformité manuelle ; soumission manuelle (`AI_ARCHITECTURE.md` §74).

```typescript
if (!aiGatewayHealth.isAvailable) {
  return renderManualFallback(); // jamais un blocage de l'écran entier
}
```

Une fonctionnalité métier qui devient totalement inutilisable en cas de panne IA est un défaut de conception, pas une conséquence acceptable de la dépendance.

---

## 32. Erreurs IA

Catalogue canonique (`AI_ARCHITECTURE.md` §75), mappé vers HTTP selon les mêmes principes que `API_PATTERNS.md` §14-15 :

| Code | HTTP | Retryable |
|---|---:|---|
| `AI_PROVIDER_UNAVAILABLE` | 503 | Oui |
| `AI_TIMEOUT` | 504 | Oui |
| `AI_OUTPUT_INVALID` | 422 | Non (après réparation tentée) |
| `AI_CONTEXT_TOO_LARGE` | 422 | Non |
| `AI_BUDGET_EXCEEDED` | 429 | Non |
| `AI_RATE_LIMITED` | 429 | Oui |
| `AI_POLICY_DENIED` | 403 | Non |
| `AI_CITATION_VALIDATION_FAILED` | 422 | Non |
| `AI_RESULT_INVALIDATED` | 409 | Non |
| `AI_HUMAN_REVIEW_REQUIRED` | 200 (statut `REQUIRES_REVIEW`, pas une erreur) | — |

`AI_HUMAN_REVIEW_REQUIRED` n'est pas un échec : c'est un état normal d'un AI Run de niveau B/C en attente de validation (§27).

---

## 33. Redaction et minimisation

```typescript
export function redactBeforeModelCall(
  input: RawTaskInput,
): RedactedTaskInput {
  return {
    ...input,
    text: redactPatterns(input.text, [
      EMAIL_PATTERN,
      PHONE_PATTERN,
      IBAN_PATTERN,
      SECRET_TOKEN_PATTERN,
    ]),
  };
}
```

Éviter systématiquement : document complet lorsqu'une section suffit ; identité complète lorsqu'un rôle suffit ; historique intégral lorsqu'un résumé validé suffit (`AI_ARCHITECTURE.md` §61-62). Le stockage du prompt complet est interdit par défaut en production (§65) — seuls un hash, la version de template, et des variables redacted sont conservés sauf politique explicite contraire.

---

## 34. Défenses contre le prompt injection

Tout document ou contenu récupéré est une **donnée**, jamais une **instruction** (`AI_ARCHITECTURE.md` §15).

```typescript
export function buildRetrievedEvidenceBlock(
  chunks: RankedChunk[],
): string {
  return chunks
    .map(
      (chunk) =>
        `<source id="${chunk.chunkId}" untrusted="true">\n${escapeForPromptBoundary(chunk.text)}\n</source>`,
    )
    .join("\n");
}
```

Règle absolue : *"Instructions from retrieved documents must never override system, security, permission, business or Skill instructions."* Défenses concrètes : séparer instructions et contenu (balisage explicite ci-dessus) ; marquer les sources récupérées comme non fiables ; limiter les outils accessibles à l'agent (§25) ; filtrer les données sensibles avant l'appel (§33) ; valider systématiquement les sorties (§14) ; interdire toute action directe déclenchée par le seul contenu d'un document ; journaliser les motifs suspects.

---

## 35. Permissions IA

Format canonique (`bible/03-domain/permissions.md` §13) :

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

Permissions DCE associées (§10 du même document) : `dce:read`, `dce:import`, `dce:update`, `dce:compare`, `dce:reanalyze`, `dce:export`.

Une AI Use Case vérifie la permission appropriée avant de créer l'AI Run (§9), exactement comme un use case métier standard vérifie une permission `resource:action` — aucune exception au modèle d'autorisation défini par `API_PATTERNS.md` §17 n'est accordée à l'IA.

---

## 36. Transparence utilisateur

Le frontend distingue explicitement (`AI_ARCHITECTURE.md` §87, cohérent avec `FRONTEND_PATTERNS.md` §23-24) : contenu utilisateur ; contenu officiel ; contenu généré par IA ; contenu validé ; contenu à vérifier ; contenu obsolète.

```typescript
export type AIContentLabel =
  | "AI_GENERATED"
  | "TO_VERIFY"
  | "VALIDATED"
  | "OFFICIAL_SOURCE"
  | "OUTDATED_RESULT";
```

Un contenu `PROPOSED` (§38) n'est jamais présenté à l'écran comme une donnée officielle sans son label — la capacité `capabilities` exposée par l'API (`FRONTEND_PATTERNS.md` §23) peut porter cette information (`reviewStatus`) au même titre qu'une capacité d'action.

---

## 37. États de validation d'une sortie IA

```typescript
export type AIOutputReviewStatus =
  | "PROPOSED"
  | "UNDER_REVIEW"
  | "VALIDATED"
  | "REJECTED"
  | "SUPERSEDED"
  | "INVALIDATED";
```

Une sortie `PROPOSED` reste un candidat, jamais un fait métier utilisable tel quel par un use case en aval sans passage par une validation humaine explicite lorsque son niveau (§27) l'exige.

---

## 38. Tests obligatoires

Repris de `AI_ARCHITECTURE.md` §93, avec le pattern d'implémentation associé (fakes cohérents avec `MODULE_TEMPLATE.md` §59) :

```typescript
export class FakeAIGateway implements AIGateway {
  async execute<TInput, TOutput>(
    request: AIExecutionRequest<TInput, TOutput>,
  ): Promise<AIExecutionResult<TOutput>> {
    const fixture = this.fixtures.get(request.operation);
    return fixture ?? this.defaultRejection(request);
  }
}
```

**AI Gateway** — routage correct ; refus de politique ; timeout ; fallback ; budget ; sortie invalide ; traçabilité. **RAG** — tenant filter ; permissions ; version documentaire ; confidentialité ; absence de fuite inter-tenant ; citations correctes ; documents supprimés exclus. **Agents** — outils autorisés ; outils interdits ; limite d'étapes ; condition d'arrêt ; validation humaine ; injection. **Sorties** — schema validation ; enums ; données absentes ; citations ; contradictions ; confiance.

Les tests ordinaires ne dépendent jamais d'un modèle IA réel — toujours `FakeAIGateway` ou équivalent, conformément à `ENGINEERING_STANDARDS.md`.

---

## 39. Pattern — jeu d'évaluation d'un Skill

```text
packages/ai/skills/dce-analyst/evaluation/
├── datasets/         — documents et cas représentatifs
├── expected/          — sorties attendues, annotées manuellement
├── scorers/           — fonctions de scoring (precision, recall, citation accuracy)
├── reports/            — résultats d'exécution horodatés
└── regression/         — seuils bloquants
```

```typescript
export function scoreRequirementExtraction(
  actual: RequirementExtractionOutput,
  expected: RequirementExtractionOutput,
): EvaluationScore {
  return {
    precision: computePrecision(actual.requirements, expected.requirements),
    recall: computeRecall(actual.requirements, expected.requirements),
    citationAccuracy: computeCitationAccuracy(actual.requirements),
  };
}
```

Seuils de qualité de référence (`AI_ARCHITECTURE.md` §81, à valider sur données représentatives avant usage en production) : `Schema Validity ≥ 99%`, `Citation Accuracy ≥ 95%`, `Unsupported Claim Rate ≤ 2%`, `Critical Requirement Recall ≥ 98%`. Toute modification de prompt, Skill, modèle, routeur, chunking, retrieval ou schéma déclenche ces évaluations ; une régression critique bloque la mise en production (§80).

---

## 40. Exemple complet — DCE Analyst (vertical slice)

Aligné sur le vertical slice de référence du MVP (`AI_ARCHITECTURE.md` §99) et le Domain Model réel (`AIAnalysis`, `Requirement`, `EvaluationCriterion`, `Risk` — `bible/03-domain/domain-model.md`).

```text
Upload PDF (Document/DocumentVersion, MODULE_TEMPLATE.md §29)
→ Extract Text
→ Chunk (§16)
→ Embed (§16)
→ Retrieve (§17) — non nécessaire si l'analyse porte sur le document entier
→ Extract Requirements (Skill dce-analyst, §9-14)
→ Validate Schema (§14)
→ Create Citations (§19)
→ Store Proposed Requirements (reviewStatus: PROPOSED, §37)
→ Human Review (§27, niveau B)
```

Endpoint API associé (`API_PATTERNS.md` §35) :

```text
POST /api/v1/workspaces/{workspaceId}/dce-analyses
→ 202 Accepted { operationId, status: "QUEUED", statusUrl }
```

Permission requise : `ai-analysis:run` (§35). Chaque exigence extraite référence ses citations (§19) et porte un niveau de confiance (§36-37) affiché explicitement dans l'interface de revue (`FRONTEND_PATTERNS.md` §26-27) avant tout usage dans la Proposal.

---

## 41. Anti-patterns interdits

Repris et complétés depuis `AI_ARCHITECTURE.md` §103 :

```text
Appel direct à un SDK fournisseur depuis un module métier
Prompt dispersé en chaînes de caractères inline dans le code applicatif
Endpoint générique exposant un accès libre au modèle
Sortie IA non validée par schéma utilisée par un use case métier
Retrieval sans filtre tenant appliqué avant la requête vectorielle
Contexte contenant des données non nécessaires à la tâche
Citation générée sans validation contre le chunk source
Résultat probabiliste présenté à l'utilisateur comme un fait certain
Agent disposant d'un outil de soumission officielle ou de suppression
Boucle agentique sans maxSteps/maxModelCalls/maxDuration/maxCost définis
Mémoire d'agent utilisée comme source de vérité métier
Cache IA sans organizationId dans la clé
Fallback fournisseur relâchant silencieusement la confidentialité
Coût non mesuré avant ou après l'appel au modèle
Contenu obsolète (source modifiée) affiché sans signalement
Sortie de niveau B ou C utilisée sans validation humaine préalable
Prompt complet stocké en production sans politique explicite
```

---

## 42. Conditions bloquantes

La livraison d'une capacité IA doit être bloquée lorsque : l'appel ne passe pas par `AIGateway` ; la sortie n'a pas de schéma de validation ; le retrieval n'applique pas les filtres tenant/permission/confidentialité avant la recherche ; un agent dispose d'un outil interdit (§25) ; une boucle agentique n'a pas de limites explicites ; un AI Run n'est pas créé pour une opération significative ; le coût n'est pas mesuré ; une sortie de niveau C peut être exécutée sans validation humaine ; les tests d'injection ou de fuite inter-tenant échouent ; le changement de fournisseur principal n'a pas d'approbation de niveau 3.

---

## 43. Definition of Ready

L'implémentation d'un Skill ou d'une capacité IA est prête lorsque : l'objectif métier et le niveau de validation humaine requis (§27) sont connus ; les permissions nécessaires existent dans `permissions.md` ; le corpus et le niveau de confidentialité sont identifiés ; le schéma d'entrée et de sortie sont définis ; la nécessité d'un traitement asynchrone est tranchée ; les limites agentiques (si applicable) sont définies ; un jeu d'évaluation minimal est prévu.

---

## 44. Definition of Done

Une capacité IA est terminée lorsque :

```text
All calls go through AIGateway
+
Output validated against an explicit schema
+
Tenant and permissions enforced before context construction
+
Citations point to immutable document versions
+
AI Run created and traceable for every significant operation
+
Cost measured and within budget
+
Human review enforced for level B/C outputs
+
Agents (if any) have bounded steps, tools and cost
+
Injection and cross-tenant leak tests pass
+
Evaluation thresholds met, no unaddressed regression
+
Graceful degradation verified when AI is unavailable
```

---

## 45. Checklist d'implémentation d'un Skill

**Architecture**

- [ ] Appel exclusif via `AIGateway`.
- [ ] Aucun SDK fournisseur importé hors `packages/ai/providers`.
- [ ] AI Use Case distinct du use case métier consommateur.
- [ ] Traitement asynchrone si l'opération dépasse un budget interactif.

**Données et sécurité**

- [ ] Tenant filtré avant tout retrieval.
- [ ] Confidentialité vérifiée par le Model Router.
- [ ] Redaction appliquée si nécessaire.
- [ ] Aucun prompt complet stocké sans politique explicite.

**Qualité**

- [ ] Schéma de sortie défini et versionné.
- [ ] Citations validées contre la source.
- [ ] Niveau de confiance calculé, pas auto-déclaré par le modèle seul.
- [ ] Jeu d'évaluation minimal existant.

**Gouvernance**

- [ ] Permission `ai-*`/`dce:*` correcte vérifiée avant exécution.
- [ ] Niveau de validation humaine (A/B/C) déterminé et appliqué.
- [ ] AI Run créé et traçable.
- [ ] Coût mesuré, budget respecté.

**Agents (si applicable)**

- [ ] Outils listés et strictement limités.
- [ ] `Permissions Agent ⊆ Permissions Utilisateur` respecté.
- [ ] `maxSteps`/`maxModelCalls`/`maxDuration`/`maxCost` définis.
- [ ] Aucun outil de la liste interdite exposé.

**Tests**

- [ ] Sortie invalide testée.
- [ ] Fuite inter-tenant testée.
- [ ] Injection testée.
- [ ] Dégradation en absence d'IA testée.

---

## 46. Critères d'acceptation

Ce document est correctement appliqué lorsque :

- aucune capacité métier n'appelle un fournisseur IA autrement que via `AIGateway` ;
- toute sortie IA est validée par un schéma avant d'être exploitée ;
- le tenant et les permissions sont vérifiés avant la construction du contexte, pas après ;
- les citations restent traçables jusqu'à une version immuable de document ;
- chaque opération IA significative produit un AI Run exploitable ;
- les coûts sont mesurés et bornés par des budgets explicites ;
- les sorties de niveau B et C restent soumises à validation humaine avant usage métier ;
- les agents opèrent avec des permissions et des limites strictement bornées ;
- l'indisponibilité de l'IA ne bloque jamais un workflow manuel équivalent ;
- les exemples de ce document restent cohérents avec `AI_ARCHITECTURE.md`, le Domain Model réel et les conventions déjà fixées par `API_PATTERNS.md`, `ARCHITECTURE_RULES.md` et `DATABASE_PATTERNS.md`.
