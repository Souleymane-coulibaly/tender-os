"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  APP_ORGANIZATION_COOKIE,
  APP_SESSION_COOKIE,
  appApiFetch,
  appApiFetchWithToken,
} from "../../lib/app-api-client";
import type { PageResponse, MyMembership, Tender } from "../../lib/tenders-types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}

export type LoginActionState = { error?: string };

/**
 * Authentifie via Identity, PUIS résout l'organisation de travail à partir de la première
 * Membership active de l'utilisateur (aucun sélecteur multi-organisation dans cette tranche —
 * mission Tenders : périmètre volontairement réduit, à étendre si un utilisateur multi-org
 * en a besoin).
 */
export async function loginAction(_prevState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Email et mot de passe requis." };
  }

  const loginResponse = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  if (!loginResponse.ok) {
    return { error: "Identifiants invalides." };
  }

  const loginBody = (await loginResponse.json()) as { accessToken: string; expiresAt: string };

  let memberships: PageResponse<MyMembership>;
  try {
    memberships = await appApiFetchWithToken<PageResponse<MyMembership>>(
      loginBody.accessToken,
      "/api/v1/organization-memberships/me?limit=1",
    );
  } catch {
    return { error: "Impossible de resoudre votre organisation." };
  }

  const organizationId = memberships.items[0]?.organization.id;
  if (!organizationId) {
    return { error: "Ce compte n'est associe a aucune organisation." };
  }

  const cookieStore = await cookies();
  const expires = new Date(loginBody.expiresAt);
  cookieStore.set(APP_SESSION_COOKIE, loginBody.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/app",
    expires,
  });
  cookieStore.set(APP_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/app",
    expires,
  });

  redirect("/app/tenders");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_SESSION_COOKIE)?.value;

  if (token) {
    await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => undefined);
  }

  cookieStore.delete(APP_SESSION_COOKIE);
  cookieStore.delete(APP_ORGANIZATION_COOKIE);
  redirect("/app/login");
}

export type FormActionState = { error?: string };

export async function createTenderAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const title = formData.get("title");
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Le titre est obligatoire." };
  }

  const submissionDeadline = formData.get("submissionDeadline");
  let tender: Tender;
  try {
    tender = await appApiFetch<Tender>("/api/v1/tenders", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        reference: optional(formData.get("reference")),
        buyerName: optional(formData.get("buyerName")),
        procedureType: optional(formData.get("procedureType")),
        marketType: optional(formData.get("marketType")),
        estimatedAmount: optional(formData.get("estimatedAmount")),
        submissionDeadline:
          typeof submissionDeadline === "string" && submissionDeadline
            ? new Date(submissionDeadline).toISOString()
            : undefined,
      }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath("/app/tenders");
  redirect(`/app/tenders/${tender.id}`);
}

function optional(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function updateTenderAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const submissionDeadline = formData.get("submissionDeadline");

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: optional(formData.get("title")),
        buyerName: optional(formData.get("buyerName")),
        description: optional(formData.get("description")),
        estimatedAmount: optional(formData.get("estimatedAmount")),
        submissionDeadline:
          typeof submissionDeadline === "string" && submissionDeadline
            ? new Date(submissionDeadline).toISOString()
            : undefined,
      }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function changeTenderStatusAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const status = formData.get("status");
  if (typeof status !== "string" || !status) {
    return { error: "Statut requis." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/status`, { method: "POST", body: JSON.stringify({ status }) });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function archiveTenderAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const reason = optional(formData.get("reason"));

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/archive`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  revalidatePath("/app/tenders");
  return {};
}

// ---- Lots ----

export async function createLotAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const lotNumber = formData.get("lotNumber");
  const title = formData.get("title");
  if (typeof lotNumber !== "string" || !lotNumber || typeof title !== "string" || !title) {
    return { error: "Numero et titre du lot requis." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/lots`, {
      method: "POST",
      body: JSON.stringify({ lotNumber, title, estimatedAmount: optional(formData.get("estimatedAmount")) }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Checklist ----

export async function createChecklistItemAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const title = formData.get("title");
  if (typeof title !== "string" || !title) {
    return { error: "Le titre est obligatoire." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/checklist`, {
      method: "POST",
      body: JSON.stringify({ title, required: formData.get("required") === "on" }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function changeChecklistItemStatusAction(
  tenderId: string,
  itemId: string,
  status: string,
): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/checklist/${itemId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Award criteria ----

export async function createAwardCriterionAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const name = formData.get("name");
  const weight = formData.get("weight");
  if (typeof name !== "string" || !name || typeof weight !== "string" || !weight) {
    return { error: "Nom et pondération requis." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/criteria`, {
      method: "POST",
      body: JSON.stringify({ name, weight }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Requested documents ----

export async function createRequestedDocumentAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const name = formData.get("name");
  if (typeof name !== "string" || !name) {
    return { error: "Le nom de la piece est obligatoire." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/requested-documents`, {
      method: "POST",
      body: JSON.stringify({
        name,
        category: optional(formData.get("category")),
        required: formData.get("required") === "on",
      }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Milestones ----

export async function createMilestoneAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const title = formData.get("title");
  const date = formData.get("date");
  const type = formData.get("type");
  if (typeof title !== "string" || !title || typeof date !== "string" || !date) {
    return { error: "Titre et date requis." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/milestones`, {
      method: "POST",
      body: JSON.stringify({ title, date: new Date(date).toISOString(), type: type || "CUSTOM" }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function markMilestoneDoneAction(tenderId: string, milestoneId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/milestones/${milestoneId}/done`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Risks ----

export async function createRiskAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const title = formData.get("title");
  const severity = formData.get("severity");
  if (typeof title !== "string" || !title || typeof severity !== "string" || !severity) {
    return { error: "Titre et gravite requis." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/risks`, { method: "POST", body: JSON.stringify({ title, severity }) });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function changeRiskStatusAction(
  tenderId: string,
  riskId: string,
  status: string,
): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/risks/${riskId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Alerts ----

export async function createAlertAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const message = formData.get("message");
  const severity = formData.get("severity");
  if (typeof message !== "string" || !message || typeof severity !== "string" || !severity) {
    return { error: "Message et gravite requis." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/alerts`, {
      method: "POST",
      body: JSON.stringify({ type: "MANUAL", severity, message, source: "MANUAL" }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function resolveAlertAction(tenderId: string, alertId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/alerts/${alertId}/resolve`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}
