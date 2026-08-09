import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import { splitBody } from "./docx-template-surgery";

const OUT_DIR = "C:/Users/couli/AppData/Local/Temp/claude/c--Users-couli-tender-os/159bd4b0-f287-4b50-85cf-854473a65549/scratchpad/dc-inspect/";

function extractText(xmlFragment: string): string {
  const matches = xmlFragment.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [];
  return matches.map((m) => m.replace(/<w:t[^>]*>/, "").replace("</w:t>", "")).join("");
}

function dump(fileName: string, label: string): void {
  const sourcePath = join(__dirname, "..", "..", "..", "..", "..", "..", "lm11-formulaires-dc-docx-xml", fileName);
  const buffer = readFileSync(sourcePath);
  const zip = new PizZip(buffer);
  const xml = zip.file("word/document.xml")!.asText();
  const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) throw new Error("no body");
  const segments = splitBody(bodyMatch[1]!);

  const rejoined = segments.map((s) => s.xml).join("");
  const identical = rejoined === bodyMatch[1];
  console.log(label, "round-trip identical to original body:", identical, identical ? "" : `(orig ${bodyMatch[1]!.length} vs rejoined ${rejoined.length})`);

  const lines: string[] = [];
  let pIdx = 0;
  let tIdx = 0;
  for (const segment of segments) {
    if (segment.kind === "table") {
      lines.push(`[TABLE ${tIdx}]`);
      tIdx += 1;
    } else if (segment.kind === "paragraph") {
      const text = extractText(segment.xml).trim();
      const hasNestedP = (segment.xml.match(/<w:p[ >]/g) ?? []).length > 1;
      lines.push(`P${pIdx}${hasNestedP ? " [NESTED-P]" : ""}: ${JSON.stringify(text.slice(0, 90))}`);
      pIdx += 1;
    } else {
      lines.push(`[RAW ${segment.xml.length} chars]: ${JSON.stringify(segment.xml.slice(0, 80))}`);
    }
  }
  writeFileSync(OUT_DIR + label + "-verified.txt", lines.join("\n"));
  console.log(label, ":", pIdx, "paragraphs,", tIdx, "tables — written to", label + "-verified.txt");
}

dump("dc1-lettre-de-candidature-2019.docx", "dc1");
dump("dc2-declaration-du-candidat-2023.docx", "dc2");
dump("dc4-declaration-de-sous-traitance-2023.docx", "dc4");
