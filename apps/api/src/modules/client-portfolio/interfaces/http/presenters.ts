import type { ClientAccountSummary, ClientAssignmentSummary } from "../../application/dtos";
import type { ClientAssignmentView } from "../../application/use-cases/list-client-assignments.use-case";

// Passe-plat volontaire (même motif que Knowledge Base/Analysis/Documents) — les DTO n'exposent
// déjà jamais de détail interne.
export function presentClientAccount(client: ClientAccountSummary): ClientAccountSummary {
  return { ...client };
}

export function presentClientAssignment(assignment: ClientAssignmentSummary | ClientAssignmentView): ClientAssignmentSummary | ClientAssignmentView {
  return { ...assignment };
}

export function presentPage<T>(items: T[], nextCursor: string | null): { items: T[]; nextCursor: string | null } {
  return { items, nextCursor };
}
