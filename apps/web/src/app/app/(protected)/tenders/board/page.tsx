import type { Metadata } from "next";
import { Button, PageHeader } from "../../../../../components/ui";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import { canChangeTenderStatus, type TenderBoard, type TenderStatistics as TenderStatisticsData } from "../../../../../lib/tenders-types";
import { ApiErrorState } from "../../api-error-state";
import { TenderFilters } from "../tender-filters";
import { TenderStatistics } from "../tender-statistics";
import { TenderViewSwitcher } from "../tender-view-switcher";
import { TenderKanbanBoard } from "./tender-kanban-board";

export const metadata: Metadata = { title: "Kanban — Appels d'offres — TenderOS" };

type SearchParams = {
  search?: string;
  internalOwnerId?: string;
  deadlineAfter?: string;
  deadlineBefore?: string;
  overdue?: string;
};

export default async function TendersBoardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const boardQuery = new URLSearchParams();
  if (params.search) boardQuery.set("search", params.search);
  if (params.internalOwnerId) boardQuery.set("internalOwnerId", params.internalOwnerId);

  let board: TenderBoard;
  let stats: TenderStatisticsData;
  let role: string | undefined;
  try {
    [board, stats, role] = await Promise.all([
      appApiFetch<TenderBoard>(`/api/v1/tenders/board?${boardQuery.toString()}`),
      appApiFetch<TenderStatisticsData>("/api/v1/tenders/stats"),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const queryString = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[{ label: "Appels d'offres" }]}
        title="Appels d'offres — Kanban"
        actions={
          <>
            <TenderViewSwitcher active="board" queryString={queryString} />
            <Button href="/app/tenders/new" variant="primary">
              Nouvel appel d&apos;offres
            </Button>
          </>
        }
      />

      <TenderStatistics stats={stats} />

      <TenderFilters
        basePath="/app/tenders/board"
        values={{
          search: params.search,
          internalOwnerId: params.internalOwnerId,
          deadlineAfter: params.deadlineAfter,
          deadlineBefore: params.deadlineBefore,
          overdue: params.overdue === "true",
        }}
      />

      <TenderKanbanBoard board={board} canDrag={canChangeTenderStatus(role)} />
    </div>
  );
}
