import type { Metadata } from "next";
import { PageHeader } from "../../../../../components/ui";
import { CreateSubcontractorProfileForm } from "./create-subcontractor-profile-form";

export const metadata: Metadata = { title: "Nouveau sous-traitant — TenderOS" };

export default function NewSubcontractorProfilePage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[{ label: "Sous-traitants", href: "/app/subcontractor-profiles" }, { label: "Nouveau" }]}
        title="Nouveau sous-traitant"
        description="Le profil est créé avec le statut « À vérifier » — jamais automatiquement actif. Vous pourrez le compléter et le vérifier ensuite."
      />
      <CreateSubcontractorProfileForm />
    </div>
  );
}
