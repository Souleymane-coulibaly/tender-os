export const PageGuideAction = {
  Complete: "COMPLETE",
  Dismiss: "DISMISS",
} as const;
export type PageGuideAction = (typeof PageGuideAction)[keyof typeof PageGuideAction];

/** Colonnes qu'une action modifie — et UNIQUEMENT elles. L'autre date n'est jamais réécrite. */
export type PageGuideStateChanges = Readonly<{ completedAt: Date } | { dismissedAt: Date }>;

export type PageGuideStateProps = {
  id: string;
  userId: string;
  guideKey: string;
  completedAt?: Date | undefined;
  dismissedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * TENDEROS-2.1 (guides de page) — état, pour UN utilisateur et UN guide, d'un guide contextuel.
 * User-scoped (jamais organization-scoped), même motif que `User.completeTour/dismissTour` :
 * horodatages indépendants, jamais un booléen, jamais une action qui efface l'autre date.
 *
 * La règle « quelle action touche quelle colonne » vit ici (`changesFor`) et n'est appliquée par le
 * repository qu'en une seule écriture atomique (upsert sur (utilisateur, guide)) : deux actions
 * concurrentes (ex. COMPLETE et DISMISS depuis deux onglets) ne peuvent jamais s'écraser l'une
 * l'autre, contrairement à un « lire → modifier → réécrire les deux dates ».
 */
export class PageGuideState {
  private constructor(private readonly props: PageGuideStateProps) {}

  static rehydrate(props: PageGuideStateProps): PageGuideState {
    return new PageGuideState(props);
  }

  /** COMPLETE → `completedAt` ; DISMISS → `dismissedAt`. Rejouer une action ne fait que
   *  rafraîchir son horodatage (upsert idempotent, jamais une erreur « déjà fait »). */
  static changesFor(action: PageGuideAction, occurredAt: Date): PageGuideStateChanges {
    switch (action) {
      case PageGuideAction.Complete:
        return { completedAt: occurredAt };
      case PageGuideAction.Dismiss:
        return { dismissedAt: occurredAt };
    }
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get guideKey(): string {
    return this.props.guideKey;
  }

  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }

  get dismissedAt(): Date | undefined {
    return this.props.dismissedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
