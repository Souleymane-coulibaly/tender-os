"use server";

import { appApiFetch } from "../../lib/app-api-client";
import type { DashboardOverview } from "../../lib/dashboard-types";

export async function fetchDashboard(filters?: { clientId?: string | undefined; periodDays?: 7 | 30 | 90 | undefined }): Promise<DashboardOverview> {
  const params = new URLSearchParams();
  if (filters?.clientId) params.set("clientId", filters.clientId);
  if (filters?.periodDays) params.set("periodDays", String(filters.periodDays));
  const query = params.toString();
  return appApiFetch<DashboardOverview>(`/api/v1/dashboard${query ? `?${query}` : ""}`);
}
