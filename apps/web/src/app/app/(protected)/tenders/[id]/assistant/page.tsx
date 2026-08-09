import type { Metadata } from "next";
import { fetchConversations } from "../../../../chat-actions";
import type { Conversation } from "../../../../../../lib/chat-types";
import { ApiErrorState } from "../../../api-error-state";
import { ChatSection } from "./chat-section";

export const metadata: Metadata = { title: "Assistant IA — TenderOS" };

export default async function TenderAssistantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let conversations: Conversation[];
  try {
    conversations = await fetchConversations(tenderId);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Assistant IA</h1>
        <p className="text-sm text-neutral-600">
          Posez une question sur ce dossier — le DCE, l&apos;analyse IA, la checklist, les données du Tender et la base
          de connaissances validée de l&apos;entreprise. Chaque réponse cite ses sources ; l&apos;assistant reste en
          lecture seule sur vos données métier.
        </p>
      </div>
      <ChatSection tenderId={tenderId} initialConversations={conversations} />
    </div>
  );
}
