import type { Metadata } from "next";
import { CreateClientAccountForm } from "./create-client-account-form";

export const metadata: Metadata = { title: "Nouveau client — TenderOS" };

export default function NewClientPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nouveau client</h1>
      <CreateClientAccountForm />
    </div>
  );
}
