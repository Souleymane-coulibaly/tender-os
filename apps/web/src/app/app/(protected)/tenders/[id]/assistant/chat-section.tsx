"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  archiveConversationAction,
  createConversationAction,
  fetchMessages,
  sendMessageAction,
} from "../../../../chat-actions";
import {
  CITATION_SOURCE_LABELS,
  type Conversation,
  type Message,
  type MessageCitation,
} from "../../../../../../lib/chat-types";
import { formatProvenanceLocation } from "../../../../../../lib/knowledge-types";
import { Button } from "../../../../../../components/ui/button";
import { Input } from "../../../../../../components/ui/input";

/** Correctif audit Codex P2 — un lien ouvrable vers la page de détail existante, jamais un nouveau
 *  viewer. La page cible revérifie l'accès (Server Component authentifié + RBAC backend réel, même
 *  motif que toute navigation `/app/...`) : jamais un contournement de permission via un lien direct.
 *  `undefined` pour les sources sans page de détail dédiée (TENDER_FIELD, FINDING, CHECKLIST_ITEM) —
 *  reste alors un simple texte, jamais un lien mort. */
function citationHref(citation: MessageCitation): string | undefined {
  if (citation.sourceType === "DOCUMENT" && citation.documentId)
    return `/app/documents/${citation.documentId}`;
  if (citation.sourceType === "KNOWLEDGE_ENTRY" && citation.knowledgeEntryId)
    return `/app/knowledge/${citation.knowledgeEntryId}`;
  return undefined;
}

const SUGGESTED_QUESTIONS = [
  "Quelle est la date limite de remise des plis ?",
  "Quels sont les critères d'attribution et leur pondération ?",
  "Quelles pièces de la checklist sont encore manquantes ?",
  "Quels sont les principaux risques identifiés dans le DCE ?",
];

function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onArchive,
}: {
  conversations: Conversation[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  if (conversations.length === 0) {
    return (
      <p className="p-3 text-sm text-tenderos-slate">Aucune conversation pour l&apos;instant.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <div
            className={`flex items-center justify-between gap-1 rounded px-2 py-1.5 text-sm ${selectedId === conversation.id ? "bg-tenderos-navy text-white" : "hover:bg-tenderos-light"}`}
          >
            <Button
              type="button"
              onClick={() => onSelect(conversation.id)}
              className="flex-1 truncate"
              variant="ghost"
              size="sm"
            >
              {conversation.title ?? "Conversation sans titre"}
            </Button>
            {selectedId === conversation.id ? (
              <Button
                type="button"
                onClick={() => onArchive(conversation.id)}
                className="shrink-0"
                title="Archiver cette conversation"
                variant="ghost"
                size="sm"
              >
                Archiver
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function CitationsList({ citations }: { citations: Message["citations"] }) {
  if (citations.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-tenderos-slate">
        Sources ({citations.length})
      </summary>
      <ul className="mt-1 flex flex-col gap-1 border-l-2 border-tenderos-navy/10 pl-2">
        {citations.map((citation) => {
          const location = formatProvenanceLocation(citation);
          const href = citationHref(citation);
          return (
            <li key={citation.id} className="text-xs text-tenderos-slate">
              <span className="font-medium text-tenderos-slate">
                [{CITATION_SOURCE_LABELS[citation.sourceType]}]
              </span>{" "}
              {href ? (
                <Link
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-tenderos-blue underline hover:text-tenderos-blue"
                >
                  {citation.label}
                </Link>
              ) : (
                citation.label
              )}
              {location ? <span className="text-tenderos-slate"> — {location}</span> : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "USER";
  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isUser ? "bg-tenderos-navy text-white" : "bg-tenderos-light text-tenderos-navy"}`}
      >
        {message.status === "PENDING" ? (
          <span className="italic text-tenderos-slate">Génération en cours…</span>
        ) : null}
        {message.status === "FAILED" ? (
          <span className="text-danger-fg">
            La génération a échoué. {message.errorMessage ?? ""}
          </span>
        ) : null}
        {message.status === "COMPLETED" ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : null}
      </div>
      {message.status === "COMPLETED" && !isUser ? (
        <CitationsList citations={message.citations} />
      ) : null}
    </div>
  );
}

export function ChatSection({
  tenderId,
  initialConversations,
}: {
  tenderId: string;
  initialConversations: Conversation[];
}) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialConversations[0]?.id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | undefined>();

  async function loadMessages(conversationId: string): Promise<void> {
    setIsLoadingMessages(true);
    setError(undefined);
    try {
      const fetched = await fetchMessages(tenderId, conversationId);
      setMessages(fetched);
    } catch {
      setError("Impossible de charger les messages de cette conversation.");
    } finally {
      setIsLoadingMessages(false);
    }
  }

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMessages est stable (ferme sur tenderId, jamais recréée par un changement de selectedId lui-même).
  }, [selectedId]);

  function handleSelect(conversationId: string): void {
    setSelectedId(conversationId);
  }

  async function handleCreateConversation(): Promise<void> {
    setError(undefined);
    const result = await createConversationAction(tenderId, {});
    if (result.error || !result.conversation) {
      setError(result.error ?? "La création de la conversation a échoué.");
      return;
    }
    setConversations((prev) => [result.conversation!, ...prev]);
    setSelectedId(result.conversation.id);
    setMessages([]);
  }

  async function handleArchive(conversationId: string): Promise<void> {
    const result = await archiveConversationAction(tenderId, conversationId);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    if (selectedId === conversationId) {
      setSelectedId(undefined);
      setMessages([]);
    }
  }

  async function handleSend(content: string): Promise<void> {
    if (!content.trim() || isSending) return;
    let conversationId = selectedId;

    if (!conversationId) {
      const result = await createConversationAction(tenderId, {});
      if (result.error || !result.conversation) {
        setError(result.error ?? "La création de la conversation a échoué.");
        return;
      }
      setConversations((prev) => [result.conversation!, ...prev]);
      conversationId = result.conversation.id;
      setSelectedId(conversationId);
    }

    setError(undefined);
    setIsSending(true);
    setInput("");

    const optimisticUserMessage: Message = {
      id: `optimistic-${Date.now()}`,
      conversationId,
      role: "USER",
      content,
      status: "COMPLETED",
      createdAt: new Date().toISOString(),
      citations: [],
    };
    setMessages((prev) => [...prev, optimisticUserMessage]);

    const result = await sendMessageAction(tenderId, conversationId, content);
    setIsSending(false);
    if (result.error || !result.message) {
      setError(result.error ?? "L'envoi du message a échoué.");
      return;
    }
    // Le backend a persisté le message USER et le message ASSISTANT — on recharge le fil complet
    // plutôt que de fusionner manuellement (jamais de divergence entre l'état optimiste et l'état réel).
    await loadMessages(conversationId);
  }

  const canSend = !isSending;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
      <aside className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-2">
        <Button type="button" onClick={handleCreateConversation} variant="primary" size="sm">
          + Nouvelle conversation
        </Button>
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={handleSelect}
          onArchive={handleArchive}
        />
      </aside>

      <section className="flex min-h-[420px] flex-col gap-3 rounded border border-tenderos-navy/10 p-3">
        {error ? (
          <p role="alert" className="rounded bg-red-50 p-2 text-xs text-danger-fg">
            {error}
          </p>
        ) : null}

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          {isLoadingMessages ? <p className="text-sm text-tenderos-slate">Chargement…</p> : null}
          {!isLoadingMessages && selectedId && messages.length === 0 ? (
            <p className="text-sm text-tenderos-slate">Aucun message pour l&apos;instant.</p>
          ) : null}
          {!selectedId && messages.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-tenderos-slate">
                Posez une question pour démarrer une conversation. Exemples :
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <Button
                    key={question}
                    type="button"
                    onClick={() => handleSend(question)}
                    variant="secondary"
                    size="sm"
                  >
                    {question}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend(input);
          }}
        >
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Posez votre question sur ce dossier…"
            disabled={!canSend}
            className="flex-1 disabled:bg-tenderos-light"
          />
          <Button type="submit" disabled={!canSend || !input.trim()} variant="primary" size="sm">
            {isSending ? "Envoi…" : "Envoyer"}
          </Button>
        </form>
      </section>
    </div>
  );
}
