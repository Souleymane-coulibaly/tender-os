import { Injectable } from "@nestjs/common";
import { PromptVariableMissingError } from "../domain/errors";
import type { PromptVersion } from "../domain/prompt-version.entity";
import type { PromptRenderer, RenderedPrompt } from "../application/ports/prompt-renderer";

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function render(template: string, variables: Readonly<Record<string, string>>): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    if (!(name in variables)) {
      throw new PromptVariableMissingError({ placeholder: name });
    }
    return variables[name] ?? "";
  });
}

/**
 * Substitution littérale `{{nom}}` — jamais un moteur de templating tiers, jamais une évaluation de
 * code (mission §"éviter l'injection de structure dans les placeholders"). Un placeholder non
 * résolu échoue explicitement au rendu, jamais un gap silencieux ni une variable arbitraire non
 * fournie par le contexte réellement construit (`generation-context-builder.ts`).
 *
 * Consolidation IA — Checkpoint B (§2) — POINT CRITIQUE : `version.systemPrompt` est rédigé
 * intégralement par un OWNER/ORGANIZATION_ADMIN de l'organisation (`PromptVersion`, aucun cadrage
 * moteur avant ce checkpoint). Correctif audit P2 "séparation de rôle" — ce texte admin n'est plus
 * concaténé au System Prompt plateforme ici : `OpenAiProvider.complete()` injecte
 * `TENDEROS_SYSTEM_PROMPT` comme son PROPRE message `{role: "system"}`, toujours en premier, jamais
 * modifiable par aucun tenant (voir `shared-kernel/tenderos-system-prompt.ts`) — le texte admin,
 * rendu ci-dessous, devient le SECOND message `{role: "system"}`, structurellement subordonné
 * (mission B.6/B.10), jamais l'intégralité du contexte système envoyé au provider comme c'était le
 * cas avant ce checkpoint.
 */
@Injectable()
export class SimplePlaceholderPromptRenderer implements PromptRenderer {
  render(version: PromptVersion, variables: Readonly<Record<string, string>>): RenderedPrompt {
    return {
      systemPrompt: render(version.systemPrompt, variables),
      userPrompt: render(version.userPromptTemplate, variables),
    };
  }
}
