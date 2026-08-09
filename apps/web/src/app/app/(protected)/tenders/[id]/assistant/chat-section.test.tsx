import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ChatSection } from "./chat-section";
import type { Conversation, Message } from "../../../../../../lib/chat-types";

const fetchMessages = vi.fn(async (_tenderId: string, _conversationId: string): Promise<Message[]> => []);
const createConversationAction = vi.fn(async (_tenderId: string, _input: unknown) => ({}) as { conversation?: Conversation; error?: string });
const archiveConversationAction = vi.fn(async (_tenderId: string, _conversationId: string) => ({}) as { error?: string });
const sendMessageAction = vi.fn(async (_tenderId: string, _conversationId: string, _content: string) => ({}) as { message?: Message; error?: string });

vi.mock("../../../../chat-actions", () => ({
  fetchMessages: (tenderId: string, conversationId: string) => fetchMessages(tenderId, conversationId),
  createConversationAction: (tenderId: string, input: unknown) => createConversationAction(tenderId, input),
  archiveConversationAction: (tenderId: string, conversationId: string) => archiveConversationAction(tenderId, conversationId),
  sendMessageAction: (tenderId: string, conversationId: string, content: string) => sendMessageAction(tenderId, conversationId, content),
}));

const CONVERSATIONS: Conversation[] = [
  { id: "conv-1", organizationId: "org-1", tenderId: "tender-1", createdByUserId: "user-1", title: "Questions sur le DCE", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
];

const USER_MESSAGE: Message = { id: "msg-1", conversationId: "conv-1", role: "USER", content: "Quelle est la date limite ?", status: "COMPLETED", createdAt: "2026-01-01T00:00:00.000Z", citations: [] };
const ASSISTANT_MESSAGE: Message = {
  id: "msg-2",
  conversationId: "conv-1",
  role: "ASSISTANT",
  content: "La date limite est le 1er septembre 2026.",
  status: "COMPLETED",
  createdAt: "2026-01-01T00:01:00.000Z",
  citations: [{ id: "cit-1", sourceType: "TENDER_FIELD", label: "Date limite de remise des plis" }],
};

beforeEach(() => {
  fetchMessages.mockReset();
  createConversationAction.mockReset();
  archiveConversationAction.mockReset();
  sendMessageAction.mockReset();
  fetchMessages.mockResolvedValue([USER_MESSAGE, ASSISTANT_MESSAGE]);
});

describe("ChatSection", () => {
  it("loads and displays the messages of the initially selected conversation, with citations", async () => {
    render(<ChatSection tenderId="tender-1" initialConversations={CONVERSATIONS} />);

    expect(await screen.findByText("Quelle est la date limite ?")).toBeInTheDocument();
    expect(screen.getByText("La date limite est le 1er septembre 2026.")).toBeInTheDocument();
    expect(fetchMessages).toHaveBeenCalledWith("tender-1", "conv-1");

    const sourcesToggle = screen.getByText("Sources (1)");
    await userEvent.click(sourcesToggle);
    expect(screen.getByText(/Date limite de remise des plis/)).toBeInTheDocument();
  });

  it("correctif audit Codex P2 — DOCUMENT and KNOWLEDGE_ENTRY citations are clickable links to their real detail page (permission re-checked on navigation); TENDER_FIELD stays plain text (no dedicated page)", async () => {
    const messageWithLinkableCitations: Message = {
      ...ASSISTANT_MESSAGE,
      id: "msg-3",
      citations: [
        { id: "cit-doc", sourceType: "DOCUMENT", documentId: "doc-1", label: "CCTP.pdf", pageStart: 12 },
        { id: "cit-kb", sourceType: "KNOWLEDGE_ENTRY", knowledgeEntryId: "kb-1", label: "Certification ISO 9001" },
        { id: "cit-tender", sourceType: "TENDER_FIELD", label: "Date limite de remise des plis" },
      ],
    };
    fetchMessages.mockReset();
    fetchMessages.mockResolvedValue([USER_MESSAGE, messageWithLinkableCitations]);

    render(<ChatSection tenderId="tender-1" initialConversations={CONVERSATIONS} />);
    await screen.findByText("Quelle est la date limite ?");
    await userEvent.click(screen.getByText("Sources (3)"));

    const documentLink = screen.getByRole("link", { name: "CCTP.pdf" });
    expect(documentLink).toHaveAttribute("href", "/app/documents/doc-1");

    const knowledgeLink = screen.getByRole("link", { name: "Certification ISO 9001" });
    expect(knowledgeLink).toHaveAttribute("href", "/app/knowledge/kb-1");

    expect(screen.getByText("Date limite de remise des plis")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Date limite de remise des plis" })).not.toBeInTheDocument();
  });

  it("shows an empty state with suggested questions when there is no conversation yet", () => {
    render(<ChatSection tenderId="tender-1" initialConversations={[]} />);
    expect(screen.getByText(/Posez une question pour démarrer une conversation/)).toBeInTheDocument();
    expect(screen.getByText("Quelle est la date limite de remise des plis ?")).toBeInTheDocument();
  });

  it("creates a new conversation and switches to it", async () => {
    const newConversation: Conversation = { id: "conv-2", organizationId: "org-1", tenderId: "tender-1", createdByUserId: "user-1", createdAt: "2026-02-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" };
    createConversationAction.mockResolvedValueOnce({ conversation: newConversation });
    fetchMessages.mockResolvedValueOnce([USER_MESSAGE, ASSISTANT_MESSAGE]).mockResolvedValue([]);

    render(<ChatSection tenderId="tender-1" initialConversations={CONVERSATIONS} />);
    await screen.findByText("Quelle est la date limite ?");

    await userEvent.click(screen.getByText("+ Nouvelle conversation"));

    await waitFor(() => expect(createConversationAction).toHaveBeenCalledWith("tender-1", {}));
    expect(await screen.findByText("Conversation sans titre")).toBeInTheDocument();
  });

  it("archives the selected conversation and removes it from the list", async () => {
    archiveConversationAction.mockResolvedValueOnce({});
    render(<ChatSection tenderId="tender-1" initialConversations={CONVERSATIONS} />);
    await screen.findByText("Quelle est la date limite ?");

    await userEvent.click(screen.getByText("Archiver"));

    await waitFor(() => expect(archiveConversationAction).toHaveBeenCalledWith("tender-1", "conv-1"));
    expect(screen.queryByText("Questions sur le DCE")).not.toBeInTheDocument();
  });

  it("sends a message, shows an optimistic USER bubble, then reconciles with the real thread once the (synchronous) response returns", async () => {
    sendMessageAction.mockResolvedValueOnce({ message: ASSISTANT_MESSAGE });
    fetchMessages.mockResolvedValueOnce([USER_MESSAGE, ASSISTANT_MESSAGE]).mockResolvedValueOnce([USER_MESSAGE, ASSISTANT_MESSAGE]);

    render(<ChatSection tenderId="tender-1" initialConversations={CONVERSATIONS} />);
    await screen.findByText("Quelle est la date limite ?");

    const input = screen.getByPlaceholderText("Posez votre question sur ce dossier…");
    await userEvent.type(input, "Une autre question ?");
    await userEvent.click(screen.getByRole("button", { name: /Envoyer/ }));

    await waitFor(() => expect(sendMessageAction).toHaveBeenCalledWith("tender-1", "conv-1", "Une autre question ?"));
  });

  it("surfaces a friendly error when sending fails (e.g. a generation already in progress)", async () => {
    sendMessageAction.mockResolvedValueOnce({ error: "Une réponse est déjà en cours de génération pour cette conversation. Veuillez patienter." });

    render(<ChatSection tenderId="tender-1" initialConversations={CONVERSATIONS} />);
    await screen.findByText("Quelle est la date limite ?");

    const input = screen.getByPlaceholderText("Posez votre question sur ce dossier…");
    await userEvent.type(input, "Encore une question ?");
    await userEvent.click(screen.getByRole("button", { name: /Envoyer/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Une réponse est déjà en cours de génération");
  });
});
