import type { Metadata } from "next";
import { PageHeader } from "../../../../../components/ui";
import { CreateClientAccountForm } from "./create-client-account-form";

export const metadata: Metadata = { title: "Nouveau client — TenderOS" };

export default function NewClientPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader breadcrumb={[{ label: "Clients", href: "/app/clients" }, { label: "Nouveau" }]} title="Nouveau client" />
      <CreateClientAccountForm />
    </div>
  );
}
