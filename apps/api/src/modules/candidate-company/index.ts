export { CandidateCompanyModule } from "./candidate-company.module";

export { CandidateCompanyStatus } from "./domain/candidate-company-status";
export { CandidateCompanyNotFoundError, CandidateCompanyArchivedError } from "./domain/errors";
export type { CandidateCompanySummary, CandidateEstablishmentSummary } from "./application/dtos";

// V2 Sprint 26 (Checkpoint 2.1-A3) — réexporté UNIQUEMENT pour `opportunity`/`tenders` : vérifier
// qu'une CandidateCompany fournie existe, appartient à l'organisation et n'est pas archivée avant de
// la rattacher à une Opportunity/un Tender, même motif que `GetClientAccountUseCase` réexporté par
// `client-portfolio`. Jamais un second chemin de lecture/écriture direct au repository.
export { GetCandidateCompanyUseCase } from "./application/use-cases/get-candidate-company.use-case";
export type { GetCandidateCompanyQuery } from "./application/use-cases/get-candidate-company.use-case";

// V2 Sprint 26 (Checkpoint 2.1-A4) — point d'accès canonique UNIQUE à l'identité candidate d'un
// Tender (mission A4 §10 "Candidate Context"), réexporté pour tout consumer métier (administrative-
// dossier, opportunity, checklist-intelligence, technical-memo...). Jamais un second chemin de
// résolution ad hoc par consumer.
export { CandidateIdentitySource, ResolveCandidateIdentityUseCase } from "./application/use-cases/resolve-candidate-identity.use-case";
export type { CandidateIdentitySummary, ResolveCandidateIdentityQuery } from "./application/use-cases/resolve-candidate-identity.use-case";
