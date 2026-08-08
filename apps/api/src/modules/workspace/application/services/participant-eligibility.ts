import type { TenderParticipantRepository } from "../ports/tender-participant.repository";

/** V2 Sprint 7 (Décision 2 du plan) — vérification UNIQUE et bon marché réutilisée par
 *  `AssignTaskUseCase`/`CreateTaskUseCase`/`CreateMentionUseCase`/`RequestApprovalUseCase` : est-ce
 *  un `TenderParticipant` ACTIF de ce Tender ? Jamais une re-dérivation complète organisation+client
 *  à chaque assignation (celle-ci n'a lieu qu'une fois, à l'ajout du participant). */
export async function isActiveTenderParticipant(
  participantRepository: TenderParticipantRepository,
  input: { organizationId: string; tenderId: string; userId: string },
): Promise<boolean> {
  const participant = await participantRepository.findActiveByUser(input);
  return participant !== null;
}
