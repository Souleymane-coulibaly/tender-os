"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { appApiFetch } from "../../lib/app-api-client";
import type {
  KnowledgeDocumentDetail,
  KnowledgeDocumentSummary,
  KnowledgeEntrySummary,
  KnowledgeEntryVersionSummary,
} from "../../lib/knowledge-types";

export type FormActionState = { error?: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}

function optional(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalTags(value: FormDataEntryValue | null): string[] | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return tags.length > 0 ? tags : undefined;
}

function requiredFile(formData: FormData): File | undefined {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : undefined;
}

/** Ne collecte que les champs de metadonnees documentes par la mission (§"structured metadata"
 *  par categorie) — jamais un moteur de formulaire dynamique generique. */
function collectMetadata(formData: FormData): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};
  const dateOnlyFields = new Set(["startDate", "endDate", "issueDate", "expiryDate"]);
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("metadata.") || typeof value !== "string" || !value.trim()) continue;
    const field = key.slice("metadata.".length);
    if (field === "yearsOfExperience" || field === "amount") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) metadata[field] = parsed;
      continue;
    }
    if (field === "contactAvailable" || field === "proofAvailable") {
      metadata[field] = value === "true";
      continue;
    }
    if (field === "technologies" || field === "skills" || field === "certifications" || field === "languages") {
      metadata[field] = value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      continue;
    }
    // Les <input type="date"> renvoient "AAAA-MM-JJ" — le schéma backend exige un datetime ISO
    // complet (z.string().datetime()), jamais une date seule.
    if (dateOnlyFields.has(field)) {
      metadata[field] = `${value.trim()}T00:00:00.000Z`;
      continue;
    }
    metadata[field] = value.trim();
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export async function createKnowledgeEntryAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const title = formData.get("title");
  const category = formData.get("category");

  if (typeof title !== "string" || !title.trim()) {
    return { error: "Le titre est obligatoire." };
  }
  if (typeof category !== "string" || !category) {
    return { error: "La catégorie est obligatoire." };
  }

  let entry: KnowledgeEntrySummary;
  try {
    entry = await appApiFetch<KnowledgeEntrySummary>("/api/v1/knowledge/entries", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        description: optional(formData.get("description")),
        category,
        language: optional(formData.get("language")),
        metadata: collectMetadata(formData),
        tags: optionalTags(formData.get("tags")),
      }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath("/app/knowledge");
  redirect(`/app/knowledge/${entry.id}`);
}

export async function importKnowledgeDocumentAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const title = formData.get("title");
  const category = formData.get("category");
  const file = requiredFile(formData);

  if (typeof title !== "string" || !title.trim()) {
    return { error: "Le titre est obligatoire." };
  }
  if (typeof category !== "string" || !category) {
    return { error: "La catégorie est obligatoire." };
  }
  if (!file) {
    return { error: "Un fichier est requis." };
  }

  const body = new FormData();
  body.set("title", title.trim());
  body.set("category", category);
  const description = optional(formData.get("description"));
  const language = optional(formData.get("language"));
  const tags = optional(formData.get("tags"));
  const metadata = collectMetadata(formData);
  if (description) body.set("description", description);
  if (language) body.set("language", language);
  if (tags) body.set("tags", tags);
  if (metadata) body.set("metadata", JSON.stringify(metadata));
  body.set("file", file);

  let entry: KnowledgeEntrySummary;
  try {
    entry = await appApiFetch<KnowledgeEntrySummary>("/api/v1/knowledge/documents", { method: "POST", body });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath("/app/knowledge");
  redirect(`/app/knowledge/${entry.id}`);
}

export async function addDocumentToEntryAction(
  entryId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const file = requiredFile(formData);
  if (!file) {
    return { error: "Un fichier est requis." };
  }

  const body = new FormData();
  const tags = optional(formData.get("tags"));
  if (tags) body.set("tags", tags);
  body.set("file", file);

  try {
    await appApiFetch(`/api/v1/knowledge/entries/${entryId}/documents`, { method: "POST", body });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/knowledge/${entryId}`);
  return {};
}

export async function updateKnowledgeEntryAction(
  entryId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/knowledge/entries/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: optional(formData.get("title")),
        description: optional(formData.get("description")),
        language: optional(formData.get("language")),
        metadata: collectMetadata(formData),
      }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/knowledge/${entryId}`);
  return {};
}

export async function archiveKnowledgeEntryAction(entryId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/knowledge/entries/${entryId}/archive`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/knowledge/${entryId}`);
  revalidatePath("/app/knowledge");
  return {};
}

export async function restoreKnowledgeEntryAction(entryId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/knowledge/entries/${entryId}/restore`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/knowledge/${entryId}`);
  revalidatePath("/app/knowledge");
  return {};
}

export async function deleteKnowledgeEntryAction(entryId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/knowledge/entries/${entryId}`, { method: "DELETE" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath("/app/knowledge");
  redirect("/app/knowledge");
}

export async function addKnowledgeTagAction(entryId: string, label: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/knowledge/entries/${entryId}/tags`, { method: "POST", body: JSON.stringify({ label }) });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/knowledge/${entryId}`);
  return {};
}

export async function removeKnowledgeTagAction(entryId: string, tagId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/knowledge/entries/${entryId}/tags/${tagId}`, { method: "DELETE" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/knowledge/${entryId}`);
  return {};
}

export async function restoreKnowledgeVersionAction(entryId: string, versionNumber: number): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/knowledge/entries/${entryId}/versions/${versionNumber}/restore`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/knowledge/${entryId}`);
  return {};
}

export async function reprocessKnowledgeDocumentAction(entryId: string, documentId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/knowledge/entries/${entryId}/documents/${documentId}/reprocess`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/knowledge/${entryId}`);
  return {};
}

export type KnowledgeEntryDetailData = {
  entry: KnowledgeEntrySummary;
  documents: KnowledgeDocumentSummary[];
  versions: KnowledgeEntryVersionSummary[];
};

/** Combine les lectures necessaires a la fiche d'une entree (mission Sprint 5 §"consulter
 *  l'historique" + "consulter les documents") — utilisee par le rendu serveur initial et par
 *  le bouton "Actualiser" (meme motif que fetchAnalysisSectionData). */
export async function fetchKnowledgeEntryDetailData(entryId: string): Promise<KnowledgeEntryDetailData> {
  const [entry, documents, versions] = await Promise.all([
    appApiFetch<KnowledgeEntrySummary>(`/api/v1/knowledge/entries/${entryId}`),
    appApiFetch<KnowledgeDocumentSummary[]>(`/api/v1/knowledge/entries/${entryId}/documents`),
    appApiFetch<KnowledgeEntryVersionSummary[]>(`/api/v1/knowledge/entries/${entryId}/versions`),
  ]);

  return { entry, documents, versions };
}

/** Contenu extrait + provenance d'un document de connaissance (mission Sprint 5 §"visualiser le
 *  contenu extrait" / "voir la provenance") — chargé à la demande (dépliage), jamais au chargement
 *  initial de la fiche (mission §"performance" : éviter de charger tous les chunks d'un coup). */
export async function fetchKnowledgeDocumentDetail(entryId: string, documentId: string): Promise<KnowledgeDocumentDetail> {
  return appApiFetch<KnowledgeDocumentDetail>(`/api/v1/knowledge/entries/${entryId}/documents/${documentId}`);
}
