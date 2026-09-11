import { CardSkeleton, TableSkeleton } from "../../../components/ui";

export default function PlatformAdminLoading() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tenderos-slate">Chargement...</p>
      <CardSkeleton />
      <TableSkeleton />
    </div>
  );
}
