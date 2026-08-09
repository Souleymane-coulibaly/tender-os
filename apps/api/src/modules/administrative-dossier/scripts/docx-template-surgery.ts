/**
 * Outils de PRÉPARATION (ponctuelle, jamais exécutée au runtime applicatif) d'une copie dérivée
 * TenderOS à partir d'un modèle DOCX officiel réel (mission V2 Sprint 11 — décision validée
 * "OfficialSourceDocument -> DerivedTenderOSTemplate -> DocumentTemplateVersion"). Le fichier
 * OFFICIEL fourni n'est JAMAIS modifié : ces fonctions opèrent sur un buffer en mémoire et
 * produisent un NOUVEAU buffer, écrit séparément par chaque script `prepare-dcX-template.ts`.
 *
 * Chaque insertion cible une position vérifiée par inspection RÉELLE du document (voir le
 * commentaire de chaque script appelant citant le texte exact du DOCX officiel) — jamais une
 * position devinée depuis une connaissance théorique du formulaire.
 */

/** Une case à cocher Word héritée (`w:ffData`/`FORMCHECKBOX`) — construction EXACTE à 3 runs
 *  vérifiée dans les fichiers réels fournis (`<w:r><w:fldChar begin><w:ffData>...<w:checkBox>...
 *  </w:fldChar></w:r><w:r><w:instrText> FORMCHECKBOX </w:instrText></w:r><w:r><w:fldChar end/>
 *  </w:r>`). */
const CHECKBOX_TRIPLET_RE = /<w:r><w:fldChar w:fldCharType="begin"><w:ffData>[\s\S]*?<\/w:ffData><\/w:fldChar><\/w:r><w:r><w:instrText[^>]*> FORMCHECKBOX <\/w:instrText><\/w:r><w:r><w:fldChar w:fldCharType="end"\/><\/w:r>/g;

function placeholderRun(fieldKey: string): string {
  return `<w:r><w:t xml:space="preserve">{{${fieldKey}}}</w:t></w:r>`;
}

/** Remplace, DANS L'ORDRE D'APPARITION DANS LE DOCUMENT, chaque case à cocher héritée par un run
 *  de texte `{{fieldKey}}` — le moteur `docxtemplater` (Sprint 10, CHECKBOX fieldType) le
 *  transforme ensuite en glyphe ☒/☐ contrôlé à la génération, jamais un remplacement naïf.
 *  `fieldKeysInOrder.length` DOIT correspondre exactement au nombre de cases détectées — une
 *  différence indique que la structure supposée du document ne correspond plus à la réalité
 *  (jamais une correspondance approximative silencieuse). */
export function replaceCheckboxesInOrder(xml: string, fieldKeysInOrder: readonly string[]): string {
  let index = 0;
  const replaced = xml.replace(CHECKBOX_TRIPLET_RE, () => {
    if (index >= fieldKeysInOrder.length) {
      throw new Error(`More checkboxes found in the document than expected fieldKeys (expected ${fieldKeysInOrder.length}).`);
    }
    const fieldKey = fieldKeysInOrder[index]!;
    index += 1;
    return placeholderRun(fieldKey);
  });
  if (index !== fieldKeysInOrder.length) {
    throw new Error(`Expected ${fieldKeysInOrder.length} checkboxes, only found ${index} in the document.`);
  }
  return replaced;
}

export type BodySegment = Readonly<{ kind: "table" | "paragraph" | "raw"; xml: string }>;

/** Trouve la fin RÉELLE du paragraphe qui commence à `openIndex` (où `body[openIndex..]` débute
 *  par `<w:p>`/`<w:p ...>`) — en comptant la profondeur d'imbrication. Correctif d'un bug réel
 *  découvert sur le DC4 officiel : un `<w:p>` peut apparaître IMBRIQUÉ à l'intérieur d'une zone de
 *  texte flottante (`<w:drawing>`/`mc:AlternateContent`/`wps:txbx`/`w:txbxContent`), qui contient
 *  elle-même ses propres paragraphes internes. Une recherche naïve du premier `</w:p>` suivant
 *  fermait alors le paragraphe AU MAUVAIS ENDROIT (sur la fermeture du paragraphe interne à la
 *  zone de texte), tronquant silencieusement le contenu réel du document (~26 Ko perdus,
 *  détecté par une vérification round-trip mammoth avant toute préparation réelle des templates
 *  DC2/DC4). Jamais une recherche `indexOf` seule pour délimiter un paragraphe. */
/** Prochaine ouverture `<w:p>`/`<w:p ...>` à partir de `from` — recherche `indexOf` simple
 *  (jamais un regex global à état, source d'un bug réel déjà rencontré ici : `lastIndex` mal
 *  synchronisé entre itérations). Retourne -1 si aucune. */
function nextParagraphOpen(body: string, from: number): number {
  const a = body.indexOf("<w:p ", from);
  const b = body.indexOf("<w:p>", from);
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

/** Un paragraphe VIDE peut être auto-fermé par Word (`<w:p .../>`, sans `</w:p>` séparé) — bug
 *  réel rencontré sur DC1 (4 occurrences) : le confondre avec une ouverture "normale" laisse une
 *  profondeur fantôme jamais refermée. Retourne l'offset juste après le `>`/`/>` de la balise
 *  d'ouverture ELLE-MÊME (jamais après un `>` trouvé à l'intérieur d'un attribut, improbable ici
 *  car les valeurs d'attribut de `<w:p>` sont de simples identifiants sans `>` littéral) et si
 *  elle est auto-fermante. */
function readParagraphOpenTag(body: string, openIndex: number): { tagEnd: number; selfClosing: boolean } {
  const tagClose = body.indexOf(">", openIndex);
  if (tagClose === -1) throw new Error(`Unterminated <w:p> opening tag at offset ${openIndex}.`);
  const selfClosing = body[tagClose - 1] === "/";
  return { tagEnd: tagClose + 1, selfClosing };
}

function findParagraphEnd(body: string, openIndex: number): number {
  const CLOSE = "</w:p>";
  const first = readParagraphOpenTag(body, openIndex);
  if (first.selfClosing) return first.tagEnd;

  let depth = 1;
  let idx = first.tagEnd;
  while (idx < body.length) {
    const openIdx = nextParagraphOpen(body, idx);
    const nextClose = body.indexOf(CLOSE, idx);
    if (nextClose === -1) throw new Error(`Unbalanced <w:p> starting at offset ${openIndex} — no matching </w:p> found (depth was ${depth} at offset ${idx}).`);
    if (openIdx !== -1 && openIdx < nextClose) {
      const inner = readParagraphOpenTag(body, openIdx);
      if (!inner.selfClosing) depth += 1;
      idx = inner.tagEnd;
    } else {
      depth -= 1;
      idx = nextClose + CLOSE.length;
      if (depth === 0) return idx;
    }
  }
  throw new Error(`Unbalanced <w:p> starting at offset ${openIndex} — reached end of document before depth returned to 0.`);
}

/** Découpe le contenu de `<w:body>` en segments de plus haut niveau, dans l'ordre du document —
 *  chaque `<w:tbl>` (non imbriqué, vérifié sur les 3 fichiers réels) est un segment "table", tout
 *  le reste regroupé en segments "paragraph" (un par `<w:p>` DE PREMIER NIVEAU — voir
 *  `findParagraphEnd` pour la gestion des paragraphes imbriqués dans une zone de texte). Base
 *  commune de toute insertion ciblée par index, jamais une manipulation de chaîne brute sans
 *  repère vérifiable. */
export function splitBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let idx = 0;
  while (idx < body.length) {
    const nextTbl = body.indexOf("<w:tbl>", idx);
    const nextPa = body.indexOf("<w:p ", idx);
    const nextPb = body.indexOf("<w:p>", idx);
    const nextP = nextPa === -1 ? nextPb : nextPb === -1 ? nextPa : Math.min(nextPa, nextPb);
    if (nextTbl === -1 && nextP === -1) break;
    const segmentStart = nextTbl !== -1 && (nextP === -1 || nextTbl < nextP) ? nextTbl : nextP;
    // Contenu directement enfant de <w:body> hors paragraphe/tableau (ex. le `<w:sectPr>` de la
    // dernière section, qui n'est PAS enveloppé dans un `<w:p>` — bug réel rencontré ici : sans ce
    // segment "raw", ce contenu de fin de document disparaissait silencieusement du résultat).
    if (segmentStart > idx) {
      segments.push({ kind: "raw", xml: body.slice(idx, segmentStart) });
    }
    if (nextTbl !== -1 && (nextP === -1 || nextTbl < nextP)) {
      const end = body.indexOf("</w:tbl>", nextTbl) + "</w:tbl>".length;
      segments.push({ kind: "table", xml: body.slice(nextTbl, end) });
      idx = end;
    } else {
      const end = findParagraphEnd(body, nextP);
      segments.push({ kind: "paragraph", xml: body.slice(nextP, end) });
      idx = end;
    }
  }
  if (idx < body.length) {
    segments.push({ kind: "raw", xml: body.slice(idx) });
  }
  return segments;
}

/** Insère un run `{{fieldKey}}` juste avant la fermeture du Nième paragraphe (0-indexé dans
 *  l'ordre du document, EXACTEMENT comme numéroté par le script d'inspection) — le paragraphe
 *  cible doit être vide de tout texte (`w:t`) au moment de l'appel, vérifié pour éviter d'insérer
 *  silencieusement dans le mauvais paragraphe après une modification amont du fichier officiel. */
export function insertIntoParagraph(segments: BodySegment[], paragraphIndex: number, fieldKey: string): void {
  let seen = -1;
  for (const segment of segments) {
    if (segment.kind !== "paragraph") continue;
    seen += 1;
    if (seen !== paragraphIndex) continue;
    const existingText = (segment.xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).join("");
    if (existingText.trim().length > 0) {
      throw new Error(`Paragraph ${paragraphIndex} is not empty (contains "${existingText.trim()}") — refusing to insert "${fieldKey}" (structure may have shifted).`);
    }
    const insertPos = segment.xml.lastIndexOf("</w:p>");
    (segment as { xml: string }).xml = segment.xml.slice(0, insertPos) + placeholderRun(fieldKey) + segment.xml.slice(insertPos);
    return;
  }
  throw new Error(`Paragraph ${paragraphIndex} not found (document only has ${seen + 1} paragraphs).`);
}

export function joinBody(segments: readonly BodySegment[]): string {
  return segments.map((s) => s.xml).join("");
}
