/**
 * V2 Sprint 12 — analyse structurelle d'un DOCX arbitraire uploadé par l'utilisateur, À L'EXÉCUTION
 * (contrairement à `administrative-dossier/scripts/docx-template-surgery.ts`, Sprint 11, qui
 * prépare UNE FOIS hors-ligne un formulaire gouvernemental connu et fixe). Ici le document n'est
 * JAMAIS connu à l'avance — impossible de cibler un index de paragraphe vérifié manuellement.
 * Stratégie retenue : détecter les titres via `<w:outlineLvl>` (signal Word natif, indépendant du
 * nom de style et de la langue — utilisé par le volet Navigation/Table des matières, présent sur
 * tout paragraphe considéré comme un titre quel que soit son style), avec repli sur les styles
 * intégrés `HeadingN`/`TitreN`. Les placeholders sont insérés comme de NOUVEAUX paragraphes après
 * chaque titre détecté, JAMAIS en réutilisant un paragraphe existant — la structure/le texte
 * d'origine ne sont jamais modifiés ni supprimés (mission §13).
 *
 * La logique de découpage bas niveau (`splitBody`/`findParagraphEnd`/`readParagraphOpenTag`) est
 * PORTÉE (pas importée — l'original est un outil de préparation hors-ligne non exporté) depuis
 * Sprint 11, déjà éprouvée par test d'identité round-trip sur 3 DOCX réels structurellement
 * différents (paragraphes imbriqués dans une zone de texte, paragraphes auto-fermants, contenu
 * final hors paragraphe).
 */
import PizZip from "pizzip";

export type BodySegment = { kind: "table" | "paragraph" | "raw"; xml: string };

function nextParagraphOpen(body: string, from: number): number {
  const a = body.indexOf("<w:p ", from);
  const b = body.indexOf("<w:p>", from);
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

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

export function joinBody(segments: readonly BodySegment[]): string {
  return segments.map((s) => s.xml).join("");
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function extractParagraphText(paragraphXml: string): string {
  const matches = paragraphXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [];
  return decodeXmlEntities(
    matches
      .map((m) => m.replace(/<w:t[^>]*>/, "").replace(/<\/w:t>/, ""))
      .join(""),
  ).trim();
}

/** `w:outlineLvl` est 0-indexé dans l'OOXML (0 = niveau de titre le plus haut) — converti ici en
 *  niveau 1-indexé (1 = "Titre 1") pour rester lisible côté métier/frontend. Repli sur le style
 *  intégré `HeadingN`/`TitreN` (identifiant de style INTERNE, indépendant de la langue d'affichage
 *  Word — "Titre 1" en français a le même `w:styleId="Heading1"` que "Heading 1" en anglais). */
function detectHeadingLevel(paragraphXml: string): number | undefined {
  const outlineMatch = paragraphXml.match(/<w:outlineLvl w:val="(\d)"\s*\/>/);
  if (outlineMatch) {
    const lvl = Number.parseInt(outlineMatch[1]!, 10);
    return lvl + 1;
  }
  const styleMatch = paragraphXml.match(/<w:pStyle w:val="Heading(\d)"\s*\/>/);
  if (styleMatch) return Number.parseInt(styleMatch[1]!, 10);
  return undefined;
}

export type OutlineHeading = {
  segmentIndex: number;
  level: number;
  title: string;
  parentSegmentIndex?: number | undefined;
  /** Concaténation courte du texte non-titre trouvé avant le prochain titre — consigne/instruction
   *  probable (mission §8 "textes d'instruction"), jamais réécrite, seulement lue. */
  instructionText?: string | undefined;
  /** Un tableau apparaît entre ce titre et le suivant — la zone de réponse est probablement
   *  tabulaire (mission §52). */
  isTable: boolean;
};

const MAX_INSTRUCTION_TEXT_LENGTH = 500;

/** Parcourt les segments dans l'ordre, détecte chaque titre, et rattache au titre le texte
 *  d'instruction / la présence d'un tableau trouvés avant le titre SUIVANT. Le parent d'un titre
 *  est le titre précédent de niveau STRICTEMENT inférieur (pile classique) — jamais deviné
 *  autrement. */
export function extractOutline(segments: readonly BodySegment[]): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  const stack: OutlineHeading[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment.kind !== "paragraph") continue;
    const level = detectHeadingLevel(segment.xml);
    if (level === undefined) continue;
    const title = extractParagraphText(segment.xml);
    if (!title) continue; // un titre sans texte n'est pas exploitable comme section nommée

    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    const parent = stack[stack.length - 1];
    const heading: OutlineHeading = { segmentIndex: i, level, title, parentSegmentIndex: parent?.segmentIndex, isTable: false };
    headings.push(heading);
    stack.push(heading);
  }

  // Deuxième passe : texte d'instruction / présence de tableau entre chaque titre et le suivant.
  for (let h = 0; h < headings.length; h++) {
    const heading = headings[h]!;
    const nextHeadingSegmentIndex = headings[h + 1]?.segmentIndex ?? segments.length;
    let collectedText = "";
    for (let i = heading.segmentIndex + 1; i < nextHeadingSegmentIndex; i++) {
      const segment = segments[i]!;
      if (segment.kind === "table") heading.isTable = true;
      if (segment.kind === "paragraph") {
        const text = extractParagraphText(segment.xml);
        if (text) collectedText = collectedText ? `${collectedText} ${text}` : text;
      }
    }
    if (collectedText) heading.instructionText = collectedText.slice(0, MAX_INSTRUCTION_TEXT_LENGTH);
  }

  return headings;
}

/** Insère un NOUVEAU paragraphe (jamais une modification d'un paragraphe existant, mission §13)
 *  contenant `{{fieldKey}}`, immédiatement après le segment `afterIndex` — mute `segments` en
 *  place et retourne le nouveau tableau (les index suivants décalent de +1, jamais réutilisés
 *  après cet appel sans recalcul). */
export function insertNewParagraphAfter(segments: readonly BodySegment[], afterIndex: number, fieldKey: string): BodySegment[] {
  const placeholderParagraph: BodySegment = { kind: "paragraph", xml: `<w:p><w:r><w:t xml:space="preserve">{{${fieldKey}}}</w:t></w:r></w:p>` };
  const next = [...segments];
  next.splice(afterIndex + 1, 0, placeholderParagraph);
  return next;
}

/** Insère un placeholder pour CHAQUE section fournie, en traitant les insertions par
 *  `segmentIndex` DÉCROISSANT (une insertion ne décale que les index STRICTEMENT supérieurs au
 *  point d'insertion — traiter du plus grand au plus petit garantit que chaque `segmentIndex`
 *  encore à traiter reste valide au moment où on l'utilise, sans recalcul d'offset). Utilisé par
 *  `PrepareTechnicalMemoTemplateUseCase` (mission §53-56 "préserver les zones protégées, jamais
 *  reconstruire arbitrairement le document"). */
export function insertPlaceholdersForSections(segments: readonly BodySegment[], placements: readonly { segmentIndex: number; fieldKey: string }[]): BodySegment[] {
  const sortedDescending = [...placements].sort((a, b) => b.segmentIndex - a.segmentIndex);
  let working = [...segments];
  for (const placement of sortedDescending) {
    working = insertNewParagraphAfter(working, placement.segmentIndex, placement.fieldKey);
  }
  return working;
}

/** Extrait le contenu de `<w:body>` d'un DOCX (ZIP OOXML) arbitraire — même regex que la fixture de
 *  test, seul point d'entrée réel pour lire un `.docx` uploadé par l'utilisateur (mission §9
 *  "lecture seule à l'analyse"). */
export function extractBodyXml(fileBuffer: Buffer): string {
  const zip = new PizZip(fileBuffer);
  const documentEntry = zip.file("word/document.xml");
  if (!documentEntry) {
    throw new Error("Not a valid DOCX file — word/document.xml not found.");
  }
  const xml = documentEntry.asText();
  const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch || bodyMatch[1] === undefined) {
    throw new Error("Not a valid DOCX file — <w:body> not found.");
  }
  return bodyMatch[1];
}

/** Reconstruit un DOCX complet à partir du buffer ORIGINAL et d'un nouveau contenu de `<w:body>` —
 *  seul le corps change, tout le reste du ZIP (styles, en-têtes/pieds de page, thème, logo/assets,
 *  relations) reste OCTET POUR OCTET celui de l'original (mission §57-59 "conserver autant que
 *  possible styles/logo/tables/headers/footers/charte"). Jamais une reconstruction depuis zéro via
 *  la bibliothèque `docx` — uniquement une substitution chirurgicale du corps dans le ZIP source. */
export function rebuildDocxWithBody(originalFileBuffer: Buffer, newBodyXml: string): Buffer {
  const zip = new PizZip(originalFileBuffer);
  const documentEntry = zip.file("word/document.xml");
  if (!documentEntry) {
    throw new Error("Not a valid DOCX file — word/document.xml not found.");
  }
  const xml = documentEntry.asText();
  const newXml = xml.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${newBodyXml}</w:body>`);
  zip.file("word/document.xml", newXml);
  return zip.generate({ type: "nodebuffer" });
}
