import { describe, expect, it } from "vitest";
import { buildStorageKey } from "./storage-key";

describe("buildStorageKey", () => {
  it("builds a key scoped by organizationId/documentId/versionId, never colliding across tenants", () => {
    const keyOrgA = buildStorageKey({ organizationId: "org-a", documentId: "doc-1", versionId: "version-1", extension: "pdf" });
    const keyOrgB = buildStorageKey({ organizationId: "org-b", documentId: "doc-1", versionId: "version-1", extension: "pdf" });

    expect(keyOrgA).toBe("org-a/doc-1/version-1.pdf");
    expect(keyOrgB).toBe("org-b/doc-1/version-1.pdf");
    expect(keyOrgA).not.toBe(keyOrgB);
  });

  it("omits the extension when none is provided", () => {
    const key = buildStorageKey({ organizationId: "org-a", documentId: "doc-1", versionId: "version-1", extension: "" });

    expect(key).toBe("org-a/doc-1/version-1");
  });

  it("sanitizes the extension, stripping anything that isn't alphanumeric", () => {
    const key = buildStorageKey({ organizationId: "org-a", documentId: "doc-1", versionId: "version-1", extension: "../../etc/passwd" });

    // Toute la partie non alphanumérique de l'extension est retirée — aucun séparateur de chemin
    // (`/`, `.`) ne peut survivre pour tenter une évasion, l'extension résultante reste un simple
    // suffixe alphanumérique collé après le dernier segment contrôlé par le serveur.
    expect(key).toBe("org-a/doc-1/version-1.etcpasswd");
    expect(key).not.toContain("..");
    expect(key).not.toContain("/etc/");
  });

  it("never derives any path segment from anything other than the four controlled inputs", () => {
    const key = buildStorageKey({ organizationId: "org-a", documentId: "doc-1", versionId: "version-1", extension: "pdf" });

    expect(key.split("/")).toEqual(["org-a", "doc-1", "version-1.pdf"]);
  });
});
