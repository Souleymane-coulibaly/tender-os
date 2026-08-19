import type { Metadata } from "next";
import { PageHeader } from "../../../../../components/ui";
import { CreateCandidateCompanyForm } from "./create-candidate-company-form";

export const metadata: Metadata = { title: "Nouvelle entreprise candidate — TenderOS" };

export default function NewCandidateCompanyPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Entreprises candidates", href: "/app/candidate-companies" }, { label: "Nouvelle" }]}
        title="Nouvelle entreprise candidate"
        description="L'entité juridique qui répondra effectivement à vos appels d'offres — distincte de vos clients."
      />
      <CreateCandidateCompanyForm />
    </div>
  );
}
