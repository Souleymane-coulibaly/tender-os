import type { Metadata } from "next";
import { appApiFetch } from "../../../../../../lib/app-api-client";
import type { TenderProfile } from "../../../../../../lib/tenders-types";
import { fetchResponsePackages } from "../../../../response-package-actions";
import type { ResponsePackage } from "../../../../../../lib/response-package-types";
import { ApiErrorState } from "../../../api-error-state";
import { ResponsePackageSection } from "./response-package-section";

export const metadata: Metadata = { title: "Dossier final — TenderOS" };

export default async function TenderResponsePackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let packages: ResponsePackage[];
  let lots: { id: string; lotNumber: string; title: string }[];
  try {
    const [packageList, profile] = await Promise.all([fetchResponsePackages(tenderId), appApiFetch<TenderProfile>(`/api/v1/tenders/${tenderId}/profile`)]);
    packages = packageList;
    lots = profile.lots.map((lot) => ({ id: lot.id, lotNumber: lot.lotNumber, title: lot.title }));
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Dossier final</h1>
        <p className="text-sm text-neutral-600">
          Assemblez les pièces déjà produites (Checklist, dossier administratif, mémoire technique, chiffrage) en un
          dossier de réponse par lot, contrôlez sa complétude, validez-le, puis générez le ZIP prêt au dépôt manuel.
          Une pièce facultative absente ne bloque jamais le dossier.
        </p>
      </div>
      <ResponsePackageSection tenderId={tenderId} initialPackages={packages} lots={lots} />
    </div>
  );
}
