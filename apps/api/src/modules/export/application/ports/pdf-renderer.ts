import type { RenderableDocument } from "../services/renderable-document";

/** Mission Sprint 8A §13/§15/§24 — rendu PDF. Doit être RÉELLEMENT fiable pour être déclaré
 *  implémenté (mission "si le PDF n'atteint pas une qualité fiable, marque-le explicitement comme
 *  non finalisé") — voir `PdfmakeRenderer` (infrastructure) et ses tests d'intégrité. */
export interface PdfRendererPort {
  render(document: RenderableDocument): Promise<Buffer>;
}

export const PDF_RENDERER = Symbol("PDF_RENDERER");
