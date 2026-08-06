import type { Metadata } from "next";
import Link from "next/link";
import { CreateSubcontractorProfileForm } from "./create-subcontractor-profile-form";

export const metadata: Metadata = { title: "Nouveau sous-traitant — TenderOS" };

export default function NewSubcontractorProfilePage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/app/subcontractor-profiles" className="text-sm text-neutral-500 hover:underline">
        ← Sous-traitants
      </Link>
      <h1 className="text-xl font-semibold">Nouveau sous-traitant</h1>
      <p className="max-w-2xl text-sm text-neutral-600">
        Le profil est créé avec le statut « À vérifier » — jamais automatiquement actif. Vous pourrez le compléter et le vérifier ensuite.
      </p>
      <CreateSubcontractorProfileForm />
    </div>
  );
}
