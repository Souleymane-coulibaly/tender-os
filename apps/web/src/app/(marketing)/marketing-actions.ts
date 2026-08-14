"use server";

import { publicApiPost, PublicApiError } from "../../lib/public-api-client";

export type DemoRequestActionState = { success?: boolean; error?: string };

const INITIAL_ERROR = "Une erreur est survenue. Veuillez réessayer ou nous contacter directement.";

/**
 * V2 Sprint 23 (landing) — mission §27. Server Action (jamais un fetch client direct : le CSP
 * `connect-src` marketing reste étroit, et l'API a `enableCors({ origin: false })`, mission Sprint
 * 21 — un appel navigateur serait de toute façon bloqué). Le honeypot rempli renvoie un succès
 * silencieux (même comportement que `SubmitDemoRequestUseCase` côté API, en double ici pour ne
 * jamais dépendre uniquement du serveur distant).
 */
export async function submitDemoRequestAction(_prevState: DemoRequestActionState, formData: FormData): Promise<DemoRequestActionState> {
  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot.length > 0) {
    return { success: true };
  }

  const name = formData.get("name");
  const email = formData.get("email");
  const company = formData.get("company");
  const phone = formData.get("phone");
  const message = formData.get("message");

  if (typeof name !== "string" || name.trim().length === 0) return { error: "Le nom est requis." };
  if (typeof email !== "string" || !email.includes("@")) return { error: "Un email professionnel valide est requis." };
  if (typeof company !== "string" || company.trim().length === 0) return { error: "Le nom de l'entreprise est requis." };

  try {
    await publicApiPost("/api/v1/marketing/demo-requests", {
      name: name.trim(),
      email: email.trim(),
      company: company.trim(),
      phone: typeof phone === "string" && phone.trim().length > 0 ? phone.trim() : undefined,
      message: typeof message === "string" && message.trim().length > 0 ? message.trim() : undefined,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 429) {
      return { error: "Trop de tentatives. Veuillez réessayer dans quelques minutes." };
    }
    console.error("[TenderOS] Demo request submission failed:", error);
    return { error: INITIAL_ERROR };
  }
}
