export const MessageRole = {
  User: "USER",
  Assistant: "ASSISTANT",
} as const;
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

/** Jamais SYSTEM en persistance — le prompt système est versionné en code
 *  (`chat-system-prompt.ts`), jamais un message stocké/modifiable (mission §31). */
export const MessageStatus = {
  Pending: "PENDING",
  Completed: "COMPLETED",
  Failed: "FAILED",
} as const;
export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

export type MessageUsage = Readonly<{
  inputTokenCount: number;
  outputTokenCount: number;
  totalTokenCount: number;
}>;

export type MessageProps = {
  id: string;
  organizationId: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdByUserId?: string | undefined;
  model?: string | undefined;
  promptVersion?: number | undefined;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  errorMessage?: string | undefined;
  createdAt: Date;
};

/** Un message USER est toujours COMPLETED dès sa création (pas de génération associée). Un message
 *  ASSISTANT naît PENDING et transite UNE SEULE FOIS vers COMPLETED ou FAILED (mission décision §1
 *  — synchrone, un seul aller-retour, jamais de ré-génération sur ce même message). */
export class Message {
  private constructor(private props: MessageProps) {}

  static createUserMessage(input: { id: string; organizationId: string; conversationId: string; content: string; createdByUserId: string; occurredAt: Date }): Message {
    return new Message({
      id: input.id,
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      role: MessageRole.User,
      content: input.content,
      status: MessageStatus.Completed,
      createdByUserId: input.createdByUserId,
      createdAt: input.occurredAt,
    });
  }

  static createPendingAssistantMessage(input: { id: string; organizationId: string; conversationId: string; occurredAt: Date }): Message {
    return new Message({
      id: input.id,
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      role: MessageRole.Assistant,
      content: "",
      status: MessageStatus.Pending,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: MessageProps): Message {
    return new Message(props);
  }

  complete(input: { content: string; model: string; promptVersion: number; usage: MessageUsage }): void {
    this.props.content = input.content;
    this.props.status = MessageStatus.Completed;
    this.props.model = input.model;
    this.props.promptVersion = input.promptVersion;
    this.props.inputTokenCount = input.usage.inputTokenCount;
    this.props.outputTokenCount = input.usage.outputTokenCount;
    this.props.totalTokenCount = input.usage.totalTokenCount;
  }

  /** `model` DOIT être renseigné si et seulement si un appel RÉEL au provider IA a été tenté avant
   *  cet échec (mission — garde-fou volume IA, décision utilisateur) : c'est ce champ, jamais un
   *  nouveau, qui distingue un échec "facturable" (réseau, timeout, sortie invalide APRÈS un vrai
   *  appel) d'un échec "gratuit" (permission, provider non configuré, contexte non assemblable —
   *  jamais d'appel réseau) pour `countBillableAssistantMessagesForTenderSince`. */
  fail(errorMessage: string, model?: string): void {
    this.props.status = MessageStatus.Failed;
    this.props.errorMessage = errorMessage;
    if (model) this.props.model = model;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get conversationId(): string {
    return this.props.conversationId;
  }
  get role(): MessageRole {
    return this.props.role;
  }
  get content(): string {
    return this.props.content;
  }
  get status(): MessageStatus {
    return this.props.status;
  }
  get createdByUserId(): string | undefined {
    return this.props.createdByUserId;
  }
  get model(): string | undefined {
    return this.props.model;
  }
  get promptVersion(): number | undefined {
    return this.props.promptVersion;
  }
  get inputTokenCount(): number | undefined {
    return this.props.inputTokenCount;
  }
  get outputTokenCount(): number | undefined {
    return this.props.outputTokenCount;
  }
  get totalTokenCount(): number | undefined {
    return this.props.totalTokenCount;
  }
  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
