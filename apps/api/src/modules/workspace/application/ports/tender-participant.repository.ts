import type { TenderParticipant } from "../../domain/tender-participant.entity";

export interface TenderParticipantRepository {
  findById(input: { organizationId: string; tenderId: string; participantId: string }): Promise<TenderParticipant | null>;
  /** Retourne le participant ACTIF (removedAt IS NULL) pour cet utilisateur sur ce Tender, s'il
   *  existe — jamais une ligne historique retirée (voir l'index partiel `tender_participants_active_unique`). */
  findActiveByUser(input: { organizationId: string; tenderId: string; userId: string }): Promise<TenderParticipant | null>;
  listActiveByTender(input: { organizationId: string; tenderId: string }): Promise<TenderParticipant[]>;
  save(participant: TenderParticipant): Promise<void>;
}

export const TENDER_PARTICIPANT_REPOSITORY = Symbol("TENDER_PARTICIPANT_REPOSITORY");
