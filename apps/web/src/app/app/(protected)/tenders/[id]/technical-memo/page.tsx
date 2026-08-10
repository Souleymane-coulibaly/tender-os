import type { Metadata } from "next";
import { fetchTechnicalMemos } from "../../../../technical-memo-actions";
import type { TechnicalMemo } from "../../../../../../lib/technical-memo-types";
import { ApiErrorState } from "../../../api-error-state";
import { TechnicalMemoSection } from "./technical-memo-section";

export const metadata: Metadata = { title: "Rédaction IA du mémoire — TenderOS" };

export default async function TenderTechnicalMemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let memos: TechnicalMemo[];
  try {
    memos = await fetchTechnicalMemos(tenderId);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Rédaction IA du mémoire technique</h1>
        <p className="text-sm text-neutral-600">
          Générez votre mémoire technique à partir de votre propre modèle DOCX, de la trame imposée par le DCE, ou du
          modèle standard TenderOS. Chaque section est rédigée séparément, avec ses sources, et reste soumise à votre
          validation avant export.
        </p>
      </div>
      <TechnicalMemoSection tenderId={tenderId} initialMemos={memos} />
    </div>
  );
}
