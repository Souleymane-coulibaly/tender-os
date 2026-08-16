import type { Metadata } from "next";
import { fetchConversations } from "../../../../chat-actions";
import type { Conversation } from "../../../../../../lib/chat-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
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
      <PageHeader
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Dossier", href: `/app/tenders/${tenderId}` }, { label: "Assistant IA" }]}
        title="Assistant IA"
        description="Posez une question sur ce dossier — le DCE, l'analyse IA, la checklist, les données du Tender et la base de connaissances validée de l'entreprise. Chaque réponse cite ses sources ; l'assistant reste en lecture seule sur vos données métier."
      />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/assistant`} />
      <ChatSection tenderId={tenderId} initialConversations={conversations} />
    </div>
  );
}
