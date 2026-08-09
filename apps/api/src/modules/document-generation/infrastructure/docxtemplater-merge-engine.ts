import { Injectable } from "@nestjs/common";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import type { DiscoveredPlaceholder } from "../domain/document-template-version.entity";
import { DocxMergeError, InvalidTemplateFileError } from "../domain/errors";
import type { DocxMergeEngine } from "../application/ports/docx-merge-engine";

const DELIMITERS = { start: "{{", end: "}}" };

interface TagTree {
  readonly [key: string]: TagTree;
}

/** Aplati l'arbre de tags renvoyé par `docxtemplater#getTags()` (structure imbriquée par boucle,
 *  voir `get-tags.js`) en une liste plate — un placeholder scalaire = objet vide `{}`, une boucle
 *  (tableau/liste) = objet AVEC des clés enfants. On enregistre la boucle elle-même comme UN SEUL
 *  placeholder (fieldKey = nom de la boucle), sans descendre dans ses champs internes : ceux-ci
 *  appartiennent à la FORME de chaque ligne fournie à la génération, pas à la surface de Field
 *  Mapping du document (mission "aucune logique métier — mapping générique"). */
function flattenTagTree(tree: TagTree): readonly string[] {
  return Object.keys(tree);
}

function mergeTagTrees(...trees: readonly TagTree[]): TagTree {
  const merged: Record<string, TagTree> = {};
  for (const tree of trees) {
    for (const [key, value] of Object.entries(tree)) {
      merged[key] = value;
    }
  }
  return merged;
}

function countOccurrences(fullText: string, fieldKey: string): number {
  const escaped = fieldKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}|\\{#\\s*${escaped}\\s*\\}`, "g");
  const matches = fullText.match(pattern);
  return matches ? matches.length : 1;
}

/** Adaptateur `docxtemplater` (+ `pizzip`) — implémente `DocxMergeEngine` (mission décision validée
 *  "encapsuler docxtemplater derrière une abstraction interne"). Gère nativement les placeholders
 *  fragmentés entre plusieurs runs Word (le parseur OOXML de docxtemplater reconstruit le texte
 *  avant résolution des tags — jamais un remplacement de chaîne naïf), les boucles/duplication de
 *  lignes de tableau (`{#field}...{/field}`), et les sauts de ligne réels pour le texte multiligne
 *  (`linebreaks: true`). Délimiteurs `{{ }}` (mission "placeholder comme {{tender.reference}}") —
 *  volontairement DIFFÉRents des accolades simples par défaut de docxtemplater, pour réduire le
 *  risque de collision avec du texte légal existant dans un formulaire officiel (Sprint 11). */
@Injectable()
export class DocxtemplaterMergeEngine implements DocxMergeEngine {
  // `docxtemplater`'s bundled `.d.ts` ne déclare pas `getTags()` (présent en réalité, voir
  // `get-tags.js`) et son typage générique par défaut (`Docxtemplater<unknown>`) est trop strict
  // pour cet usage réflexif — frontière d'infrastructure isolée, jamais un `any` qui fuiterait vers
  // le domaine/l'application (le port `DocxMergeEngine` reste, lui, entièrement typé).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private open(templateBuffer: Buffer): any {
    let zip: PizZip;
    try {
      zip = new PizZip(templateBuffer);
    } catch (error) {
      throw new InvalidTemplateFileError(`not a valid ZIP/DOCX container: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      return new Docxtemplater(zip, {
        delimiters: DELIMITERS,
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => "",
      });
    } catch (error) {
      throw new InvalidTemplateFileError(`not a valid DOCX template: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  scanPlaceholders(templateBuffer: Buffer): readonly DiscoveredPlaceholder[] {
    const doc = this.open(templateBuffer);

    const rawTags = doc.getTags() as { document?: { tags: TagTree }; headers: readonly { tags: TagTree }[]; footers: readonly { tags: TagTree }[] };
    const merged = mergeTagTrees(
      rawTags.document?.tags ?? {},
      ...rawTags.headers.map((h) => h.tags),
      ...rawTags.footers.map((f) => f.tags),
    );
    const fieldKeys = flattenTagTree(merged);

    const fullText = doc.getFullText();
    return fieldKeys.map((fieldKey) => ({ fieldKey, occurrences: countOccurrences(fullText, fieldKey) }));
  }

  render(input: { templateBuffer: Buffer; data: Readonly<Record<string, unknown>> }): Buffer {
    const doc = this.open(input.templateBuffer);
    try {
      doc.render(input.data as Record<string, unknown>);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new DocxMergeError(reason);
    }
    return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
  }
}
