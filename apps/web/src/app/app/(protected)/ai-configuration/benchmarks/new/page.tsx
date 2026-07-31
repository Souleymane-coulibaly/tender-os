import type { Metadata } from "next";
import { CreateBenchmarkSuiteForm } from "./create-benchmark-suite-form";

export const metadata: Metadata = { title: "Nouvelle suite de benchmark — TenderOS" };

export default function NewBenchmarkSuitePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Nouvelle suite de benchmark</h1>
      <CreateBenchmarkSuiteForm />
    </div>
  );
}
