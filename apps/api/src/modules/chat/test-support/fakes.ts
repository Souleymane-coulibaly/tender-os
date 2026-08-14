import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { AIProvider, AIProviderRegistry, AIProviderRequest, AIProviderResult } from "../../analysis";
import type { AtomicTransactionRunner } from "../application/ports/atomic-transaction-runner";
import type { AuditLogWriter, ChatAuditLogEntry } from "../application/ports/audit-log-writer";
import type { ConversationListFilters, ConversationRepository } from "../application/ports/conversation.repository";
import type { DceChunkMatch, DceChunkSearchProvider } from "../application/ports/dce-chunk-search-provider";
import type { MessageRepository } from "../application/ports/message.repository";
import type { Conversation } from "../domain/conversation.entity";
import type { MessageCitation } from "../domain/message-citation.entity";
import { Message, MessageRole, MessageStatus } from "../domain/message.entity";

export class FixedClock implements Clock {
  constructor(private value: Date = new Date("2026-01-01T00:00:00.000Z")) {}
  now(): Date {
    return this.value;
  }
  advance(ms: number): void {
    this.value = new Date(this.value.getTime() + ms);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

export type CapturedOutboxEvent = Readonly<{ eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown> }>;

export class FakeOutboxWriter {
  readonly events: CapturedOutboxEvent[] = [];
  async write(input: { organizationId: string; events: readonly CapturedOutboxEvent[] }): Promise<void> {
    this.events.push(...input.events);
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: ChatAuditLogEntry[] = [];
  async record(entry: ChatAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class FakeAtomicTransactionRunner implements AtomicTransactionRunner {
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

export class InMemoryConversationRepository implements ConversationRepository {
  readonly conversations: Conversation[] = [];

  async findById(input: { organizationId: string; conversationId: string }): Promise<Conversation | null> {
    return this.conversations.find((c) => c.id === input.conversationId && c.organizationId === input.organizationId) ?? null;
  }

  async listByTender(filters: ConversationListFilters): Promise<Conversation[]> {
    return this.conversations.filter(
      (c) => c.organizationId === filters.organizationId && c.tenderId === filters.tenderId && (filters.includeArchived || !c.isArchived),
    );
  }

  async save(conversation: Conversation): Promise<void> {
    const index = this.conversations.findIndex((c) => c.id === conversation.id);
    if (index === -1) this.conversations.push(conversation);
    else this.conversations[index] = conversation;
  }
}

export class InMemoryMessageRepository implements MessageRepository {
  readonly messages: Message[] = [];
  readonly citations: MessageCitation[] = [];

  /** Résout `conversationId -> tenderId` pour `countBillableAssistantMessagesForTenderSince`
   *  (`Message` ne porte pas `tenderId` directement, même motif que le schéma réel) — voir
   *  `InMemoryConversationRepository`. */
  constructor(private readonly conversationRepository?: InMemoryConversationRepository) {}

  async findById(input: { organizationId: string; messageId: string }): Promise<Message | null> {
    return this.messages.find((m) => m.id === input.messageId && m.organizationId === input.organizationId) ?? null;
  }

  async listByConversation(input: { organizationId: string; conversationId: string }): Promise<Message[]> {
    return this.messages.filter((m) => m.organizationId === input.organizationId && m.conversationId === input.conversationId);
  }

  async findPendingByConversation(input: { organizationId: string; conversationId: string }): Promise<Message | null> {
    return this.messages.find((m) => m.organizationId === input.organizationId && m.conversationId === input.conversationId && m.status === MessageStatus.Pending) ?? null;
  }

  async save(message: Message): Promise<void> {
    const index = this.messages.findIndex((m) => m.id === message.id);
    if (index === -1) this.messages.push(message);
    else this.messages[index] = message;
  }

  async saveCitations(citations: readonly MessageCitation[]): Promise<void> {
    this.citations.push(...citations);
  }

  async listCitationsByMessageId(input: { organizationId: string; messageId: string }): Promise<MessageCitation[]> {
    return this.citations.filter((c) => c.organizationId === input.organizationId && c.messageId === input.messageId);
  }

  async listCitationsByMessageIds(input: { organizationId: string; messageIds: readonly string[] }): Promise<MessageCitation[]> {
    return this.citations.filter((c) => c.organizationId === input.organizationId && input.messageIds.includes(c.messageId));
  }

  async lockTenderQuota(): Promise<void> {
    // Pas de verrou réel en mémoire (un seul thread de test) — voir `PrismaMessageRepository` pour
    // le verrou consultatif Postgres réel, prouvé par `prisma-message.repository.integration.spec.ts`.
  }

  async findStalePendingCandidates(input: { olderThan: Date; limit: number }): Promise<readonly { organizationId: string; messageId: string }[]> {
    return this.messages
      .filter((m) => m.status === MessageStatus.Pending && m.createdAt < input.olderThan)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, input.limit)
      .map((m) => ({ organizationId: m.organizationId, messageId: m.id }));
  }

  async countBillableAssistantMessagesForTenderSince(input: { organizationId: string; tenderId: string; since: Date }): Promise<number> {
    return this.messages.filter((m) => {
      if (m.organizationId !== input.organizationId || m.role !== MessageRole.Assistant || m.createdAt < input.since) return false;
      const conversation = this.conversationRepository?.conversations.find((c) => c.id === m.conversationId);
      if (conversation?.tenderId !== input.tenderId) return false;
      return m.status === MessageStatus.Pending || m.status === MessageStatus.Completed || (m.status === MessageStatus.Failed && m.model !== undefined);
    }).length;
  }

  async countAssistantMessagesForOrganizationSince(input: { organizationId: string; since: Date }): Promise<number> {
    return this.messages.filter((m) => {
      if (m.organizationId !== input.organizationId || m.role !== MessageRole.Assistant || m.createdAt < input.since) return false;
      return m.status === MessageStatus.Pending || m.status === MessageStatus.Completed || (m.status === MessageStatus.Failed && m.model !== undefined);
    }).length;
  }
}

export class FakeDceChunkSearchProvider implements DceChunkSearchProvider {
  matches: readonly DceChunkMatch[] = [];
  async search(): Promise<readonly DceChunkMatch[]> {
    return this.matches;
  }
}

export type FakeAIProviderBehavior = { kind: "success"; result: AIProviderResult } | { kind: "error"; error: Error };

export class FakeAIProvider implements AIProvider {
  readonly name = "FAKE";
  readonly requests: AIProviderRequest[] = [];
  private readonly behaviors: FakeAIProviderBehavior[];

  constructor(behaviors: readonly FakeAIProviderBehavior[]) {
    this.behaviors = [...behaviors];
  }

  async complete(request: AIProviderRequest): Promise<AIProviderResult> {
    this.requests.push(request);
    const behavior = this.behaviors.shift();
    if (!behavior) throw new Error("FakeAIProvider: no more configured behaviors.");
    if (behavior.kind === "error") throw behavior.error;
    return behavior.result;
  }
}

export class FakeAIProviderRegistry implements AIProviderRegistry {
  constructor(private readonly provider: AIProvider) {}
  resolve(): AIProvider {
    return this.provider;
  }
}

export function fakeChatAIProviderResult(overrides: Partial<AIProviderResult> = {}): AIProviderResult {
  return {
    content: JSON.stringify({ answer: "Réponse générée.", citations: [], insufficientContext: false }),
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    durationMs: 100,
    ...overrides,
  };
}
