export type KnowledgeTagProps = {
  id: string;
  organizationId: string;
  /** Normalisé (voir `tag-normalizer.ts`) — c'est cette valeur qui porte la contrainte d'unicité
   *  tenant-aware (mission §4 "pas de doublons liés à la casse"). */
  label: string;
  /** Forme telle que saisie la première fois (mission §"affichage") — jamais utilisée pour la
   *  comparaison/l'unicité, uniquement pour l'affichage (ex. "ISO-27001" plutôt que "iso-27001"). */
  displayLabel: string;
  createdAt: Date;
};

/** Tag d'organisation (mission Sprint 5 §4) — jamais recréé sous un id distinct pour un même
 *  libellé normalisé au sein d'une organisation (voir `KnowledgeTagRepository.findOrCreate`). */
export class KnowledgeTag {
  private constructor(private readonly props: KnowledgeTagProps) {}

  static create(input: { id: string; organizationId: string; label: string; displayLabel: string; occurredAt: Date }): KnowledgeTag {
    return new KnowledgeTag({
      id: input.id,
      organizationId: input.organizationId,
      label: input.label,
      displayLabel: input.displayLabel,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: KnowledgeTagProps): KnowledgeTag {
    return new KnowledgeTag(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get label(): string {
    return this.props.label;
  }
  get displayLabel(): string {
    return this.props.displayLabel;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
