import { DceId } from "./dce-id.value-object";
import { DceStatus } from "./dce-status";

export type DceProps = {
  id: DceId;
  organizationId: string;
  tenderId: string;
  status: DceStatus;
  /** Checkpoint 2.1-P2.1-FIX-A — révision monotone du contenu sémantique du DCE. Jamais mutée par
   *  cet agrégat lui-même (voir `DceRepository.incrementRevision`, un `UPDATE ... SET revision =
   *  revision + 1` atomique côté base, jamais un read-then-write applicatif) : ce getter reflète
   *  uniquement la valeur lue, la seule source de vérité de son incrémentation reste la base. */
  revision: number;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Conteneur du dossier de consultation d'un Tender — un Tender ne porte jamais plus d'un DCE
 * (conception §4, mission Sprint 0). N'exécute lui-même aucune opération de fichier : le
 * stockage, le versionnement et le hash sont entièrement délégués au module Documents
 * (voir DceDocument, simple lien). Le Dce ne fait que suivre le cycle de vie global de l'import.
 */
export class Dce {
  private constructor(private props: DceProps) {}

  static create(input: {
    id: DceId;
    organizationId: string;
    tenderId: string;
    createdByUserId: string;
    occurredAt: Date;
  }): Dce {
    return new Dce({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      status: DceStatus.Draft,
      revision: 1,
      createdByUserId: input.createdByUserId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: DceProps): Dce {
    return new Dce(props);
  }

  /** Idempotent : n'échoue jamais si déjà IMPORTED, ne régresse jamais un DCE déjà avancé
   *  (appelé après chaque import réussi, potentiellement plusieurs fois de suite). */
  markImported(occurredAt: Date): void {
    if (this.props.status === DceStatus.Imported) {
      return;
    }
    this.props.status = DceStatus.Imported;
    this.props.updatedAt = occurredAt;
  }

  get id(): DceId {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get status(): DceStatus {
    return this.props.status;
  }
  get revision(): number {
    return this.props.revision;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
