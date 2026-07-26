import type { Metadata } from "next";
import { CreateTenderForm } from "./create-tender-form";

export const metadata: Metadata = { title: "Nouvel appel d'offres — TenderOS" };

export default function NewTenderPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nouvel appel d&apos;offres</h1>
      <CreateTenderForm />
    </div>
  );
}
