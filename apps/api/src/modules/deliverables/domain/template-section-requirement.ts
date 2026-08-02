/** Mission §4 — une section de template peut être obligatoire/facultative/conditionnelle
 *  ("masquée"/"verrouillée" sont des faits portés directement par `DeliverableSection.hidden`/
 *  `locked`, jamais des valeurs de cette énumération). */
export const TemplateSectionRequirement = {
  Mandatory: "MANDATORY",
  Optional: "OPTIONAL",
  Conditional: "CONDITIONAL",
} as const;

export type TemplateSectionRequirement = (typeof TemplateSectionRequirement)[keyof typeof TemplateSectionRequirement];

export function isTemplateSectionRequirement(value: string): value is TemplateSectionRequirement {
  return Object.values(TemplateSectionRequirement).includes(value as TemplateSectionRequirement);
}
