"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  PLATFORM_SESSION_COOKIE,
  platformApiFetch,
  platformApiFetchWithToken,
} from "../../lib/platform-api-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type LoginActionState = { error?: string };

/**
 * Encapsule la connexion : authentifie via Identity, PUIS vérifie immédiatement l'accès
 * plateforme — ne définit jamais de cookie de session plateforme pour un compte qui n'est
 * pas administrateur plateforme, même si le mot de passe est correct (deny by default).
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

  try {
    await platformApiFetchWithToken(loginBody.accessToken, "/api/v1/admin/metrics");
  } catch {
    return { error: "Ce compte n'a pas accès au back-office plateforme." };
  }

  const cookieStore = await cookies();
  cookieStore.set(PLATFORM_SESSION_COOKIE, loginBody.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/platform-admin",
    expires: new Date(loginBody.expiresAt),
  });

  redirect("/platform-admin");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLATFORM_SESSION_COOKIE)?.value;

  if (token) {
    await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => undefined);
  }

  cookieStore.delete(PLATFORM_SESSION_COOKIE);
  redirect("/platform-admin/login");
}

export type SuspendActionState = { error?: string };

export async function suspendOrganizationAction(
  organizationId: string,
  _prevState: SuspendActionState,
  formData: FormData,
): Promise<SuspendActionState> {
  const reason = formData.get("reason");

  try {
    await platformApiFetch(`/api/v1/admin/organizations/${organizationId}/suspend`, {
      method: "POST",
      body: JSON.stringify(typeof reason === "string" && reason.trim() ? { reason: reason.trim() } : {}),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Une erreur est survenue." };
  }

  revalidatePath(`/platform-admin/organizations/${organizationId}`);
  revalidatePath("/platform-admin/organizations");

  return {};
}

export async function reactivateOrganizationAction(organizationId: string): Promise<SuspendActionState> {
  try {
    await platformApiFetch(`/api/v1/admin/organizations/${organizationId}/reactivate`, { method: "POST" });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Une erreur est survenue." };
  }

  revalidatePath(`/platform-admin/organizations/${organizationId}`);
  revalidatePath("/platform-admin/organizations");

  return {};
}
