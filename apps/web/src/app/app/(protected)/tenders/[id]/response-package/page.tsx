import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole, getCurrentUserId } from "../../../../../../lib/app-api-client";
import type { TenderProfile } from "../../../../../../lib/tenders-types";
import { fetchResponsePackages } from "../../../../response-package-actions";
import type { ResponsePackage } from "../../../../../../lib/response-package-types";
import { fetchParticipants, fetchWorkspaceMembers } from "../../../../workspace-actions";
import type { TenderParticipant } from "../../../../../../lib/workspace-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { ResponsePackageSection } from "./response-package-section";

export const metadata: Metadata = { title: "Dossier final — TenderOS" };

export default async function TenderResponsePackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let packages: ResponsePackage[];
  let lots: { id: string; lotNumber: string; title: string }[];
  let participants: TenderParticipant[];
  let members: { userId: string; email: string; displayName: string }[];
  let actorRole: string | undefined;
  let actorId: string | undefined;
  try {
    const [packageList, profile, participantList, memberList, role, userId] = await Promise.all([
      fetchResponsePackages(tenderId),
      appApiFetch<TenderProfile>(`/api/v1/tenders/${tenderId}/profile`),
      fetchParticipants(tenderId),
      fetchWorkspaceMembers(tenderId),
      getCurrentMembershipRole(),
      getCurrentUserId(),
    ]);
    packages = packageList;
    lots = profile.lots.map((lot) => ({ id: lot.id, lotNumber: lot.lotNumber, title: lot.title }));
    participants = participantList;
    members = memberList;
    actorRole = role;
    actorId = userId;
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Dossier", href: `/app/tenders/${tenderId}` }, { label: "Dossier final" }]}
        title="Dossier final"
        description="Assemblez les pièces déjà produites (Checklist, dossier administratif, mémoire technique, chiffrage) en un dossier de réponse par lot, contrôlez sa complétude, validez-le, puis générez le ZIP prêt au dépôt manuel. Une pièce facultative absente ne bloque jamais le dossier."
      />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/response-package`} />
      <ResponsePackageSection
        tenderId={tenderId}
        initialPackages={packages}
        lots={lots}
        participants={participants}
        members={members}
        actorRole={actorRole}
        actorId={actorId}
      />
    </div>
  );
}
