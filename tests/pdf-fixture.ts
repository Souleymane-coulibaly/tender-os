/**
 * Mission Sprint 8A.2 — même construction que
 * `apps/api/src/modules/extraction/test-support/pdf-fixture-builder.ts` (dupliquée ici plutôt
 * qu'importée : `tests/` reste un workspace Playwright indépendant, jamais un import cross-
 * workspace vers `apps/api`). Produit un PDF minimal mais structurellement valide, avec un texte
 * natif réel — nécessaire pour que l'extraction automatique (bug #2) atteigne réellement
 * READY_FOR_ANALYSIS dans les parcours Playwright, jamais un octet arbitraire qui échouerait en
 * FAILED/corrompu.
 */
export function buildMinimalPdf(pagesText: readonly string[]): Buffer {
  const objects: string[] = [];
  const pageCount = pagesText.length;

  objects.push(`1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n`);
  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(" ");
  objects.push(`2 0 obj\n<</Type/Pages/Kids[${kids}]/Count ${pageCount}>>\nendobj\n`);

  const fontObjNum = 3 + pageCount * 2;
  for (let i = 0; i < pageCount; i++) {
    const pageObjNum = 3 + i;
    const contentObjNum = 3 + pageCount + i;
    objects.push(
      `${pageObjNum} 0 obj\n<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 ${fontObjNum} 0 R>>>>/MediaBox[0 0 300 300]/Contents ${contentObjNum} 0 R>>\nendobj\n`,
    );
  }
  for (let i = 0; i < pageCount; i++) {
    const contentObjNum = 3 + pageCount + i;
    const text = pagesText[i]!.replace(/[()\\]/g, "\\$&");
    const stream = text.length > 0 ? `BT /F1 18 Tf 20 250 Td (${text}) Tj ET` : "";
    objects.push(`${contentObjNum} 0 obj\n<</Length ${stream.length}>>\nstream\n${stream}\nendstream\nendobj\n`);
  }
  objects.push(`${fontObjNum} 0 obj\n<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>\nendobj\n`);

  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body));
    body += obj;
  }
  const xrefStart = Buffer.byteLength(body);
  const totalObjs = objects.length + 1;
  let xref = `xref\n0 ${totalObjs}\n0000000000 65535 f \n`;
  for (let i = 1; i < totalObjs; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer\n<</Size ${totalObjs}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(body, "latin1");
}
