import type { RenderableDocument } from "../services/renderable-document";

/** Mission Sprint 8A §13/§15 — rendu DOCX. Le domaine/l'application ne dépendent que de cette
 *  interface, jamais de la bibliothèque `docx` concrète (implémentée en infrastructure). */
export interface DocumentRendererPort {
  render(document: RenderableDocument): Promise<Buffer>;
}

export const DOCUMENT_RENDERER = Symbol("DOCUMENT_RENDERER");
