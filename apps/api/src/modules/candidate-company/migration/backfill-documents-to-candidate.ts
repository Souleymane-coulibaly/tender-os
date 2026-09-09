import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/**
 * Checkpoint TENDEROS-2.1-CCV2-E.1 — réconciliation des documents d'entreprise Legacy avec le
 * lifecycle documentaire `CandidateCompany` (ferme CCV2-D/P1-01).
 *
 * AUCUNE COPIE BINAIRE. Le fichier reste EXACTEMENT le même `Document`, avec les mêmes
 * `DocumentVersion`, les mêmes `storageKey` et les mêmes checksums : ce backfill n'écrit qu'une
 * LIGNE D'ASSOCIATION supplémentaire. Il ne touche ni le stockage objet, ni le versionnement.
 * L'historique est donc préservé par IDENTITÉ, pas par recopie — il n'existe aucun chemin par
 * lequel une version pourrait être perdue, réordonnée ou réécrite.
 *
 * ASSOCIATION, JAMAIS DÉPLACEMENT. La ligne `DocumentClientAccountAssociation` est conservée
 * intacte : les routes `/clients/:id/documents` continuent de fonctionner à l'identique jusqu'à
 * CCV2-I. Aucun dual-WRITE pour autant — il y a deux associations vers UN SEUL fichier, jamais deux
 * copies d'une même donnée.
 *
 * ATTRIBUTION NON AMBIGUË PAR CONSTRUCTION. `candidate_companies` porte
 * `UNIQUE(organization_id, source_client_account_id)` : un ClientAccount ne peut donc correspondre
 * qu'à ZÉRO ou UNE CandidateCompany, jamais plusieurs. Le cas « plusieurs candidats possibles » est
 * structurellement impossible, il n'y a donc jamais de choix arbitraire à faire. Reste le cas
 * « zéro candidat », qui n'est jamais migré et part au registre d'exceptions.
 *
 * IDEMPOTENCE. L'unicité `(document_id, candidate_company_id)` de la table cible, doublée d'un
 * contrôle d'existence, garantit qu'un second passage crée 0 association et 0 exception nouvelle.
 */

export type DocumentMigrationException = Readonly<{
  documentId: string;
  organizationId: string;
  clientAccountId: string;
  reason: "NO_CANDIDATE_COMPANY";
  /** Candidats envisageables pour ce ClientAccount. Toujours vide ici : par construction, une
   *  exception signifie qu'il n'en existe aucun. Le champ est conservé pour rendre le registre
   *  lisible sans connaître l'invariant. */
  candidateCandidates: readonly string[];
  recommendedAction: "PROMOTE_CLIENT_ACCOUNT_TO_CANDIDATE_COMPANY_THEN_REPLAY";
}>;

export type DocumentBackfillReport = Readonly<{
  organizationId: string;
  dryRun: boolean;
  legacyAssociationsScanned: number;
  associationsCreated: number;
  alreadyAssociated: number;
  exceptions: readonly DocumentMigrationException[];
  /** Invariant vérifiable : ce backfill n'écrit JAMAIS dans `documents` ni `document_versions`. */
  binaryCopies: 0;
  documentsBefore: number;
  documentsAfter: number;
  documentVersionsBefore: number;
  documentVersionsAfter: number;
}>;

export type DocumentBackfillOptions = Readonly<{ organizationId: string; dryRun?: boolean | undefined }>;

/**
 * Correspondance des catégories. Les 5 valeurs autorisées côté Legacy (CHECK
 * `document_client_account_associations_category_check`) sont un SOUS-ENSEMBLE STRICT des 11
 * valeurs candidate (CCV2-B) : la correspondance est l'IDENTITÉ, sans perte et sans repli sur
 * `OTHER`. Cette table existe pour rendre l'invariant explicite et le faire échouer bruyamment si
 * un futur checkpoint élargissait l'un des deux catalogues sans l'autre.
 */
const CATEGORY_MAPPING: Readonly<Record<string, string>> = {
  KBIS: "KBIS",
  TAX_CERTIFICATE: "TAX_CERTIFICATE",
  SOCIAL_CERTIFICATE: "SOCIAL_CERTIFICATE",
  ARTICLES_OF_ASSOCIATION: "ARTICLES_OF_ASSOCIATION",
  OTHER: "OTHER",
};

export function mapLegacyDocumentCategory(legacyCategory: string): string {
  const mapped = CATEGORY_MAPPING[legacyCategory];
  if (mapped === undefined) {
    // Jamais de dégradation silencieuse en `OTHER` : une catégorie inconnue signale que les deux
    // catalogues ont divergé, ce qui doit être corrigé, pas absorbé.
    throw new Error(`Unmapped legacy document category: ${legacyCategory}`);
  }
  return mapped;
}

export async function backfillDocumentsToCandidate(prisma: PrismaClient, options: DocumentBackfillOptions): Promise<DocumentBackfillReport> {
  const { organizationId } = options;
  const dryRun = options.dryRun ?? false;

  const documentsBefore = await prisma.document.count({ where: { organizationId } });
  const documentVersionsBefore = await prisma.documentVersion.count({ where: { organizationId } });

  const legacyAssociations = await prisma.documentClientAccountAssociation.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });

  const candidates = await prisma.candidateCompany.findMany({
    where: { organizationId, sourceClientAccountId: { not: null } },
    select: { id: true, sourceClientAccountId: true },
  });
  const candidateBySource = new Map(candidates.map((candidate) => [candidate.sourceClientAccountId as string, candidate.id]));

  let associationsCreated = 0;
  let alreadyAssociated = 0;
  const exceptions: DocumentMigrationException[] = [];

  for (const legacy of legacyAssociations) {
    const candidateCompanyId = candidateBySource.get(legacy.clientAccountId);

    if (candidateCompanyId === undefined) {
      exceptions.push({
        documentId: legacy.documentId,
        organizationId,
        clientAccountId: legacy.clientAccountId,
        reason: "NO_CANDIDATE_COMPANY",
        candidateCandidates: [],
        recommendedAction: "PROMOTE_CLIENT_ACCOUNT_TO_CANDIDATE_COMPANY_THEN_REPLAY",
      });
      continue;
    }

    const existing = await prisma.documentCandidateCompanyAssociation.findFirst({
      where: { organizationId, candidateCompanyId, documentId: legacy.documentId },
      select: { id: true },
    });
    if (existing) {
      alreadyAssociated += 1;
      continue;
    }

    if (dryRun) {
      associationsCreated += 1;
      continue;
    }

    await prisma.documentCandidateCompanyAssociation.create({
      data: {
        id: randomUUID(),
        organizationId,
        documentId: legacy.documentId,
        candidateCompanyId,
        category: mapLegacyDocumentCategory(legacy.category),
        // `label` et `validFrom` n'ont AUCUNE source Legacy : ils restent NULL. Les dériver d'un
        // titre de fichier ou d'une date de création serait inventer une donnée métier.
        label: null,
        issuedAt: legacy.issuedAt,
        validFrom: null,
        // `expiresAt` Legacy porte exactement la sémantique de `validUntil` : une échéance de
        // validité. Un document expiré le reste, à la milliseconde près.
        validUntil: legacy.expiresAt,
        createdByUserId: legacy.createdByUserId,
      },
    });
    associationsCreated += 1;
  }

  if (!dryRun) {
    await recordExceptionsInRegister(prisma, organizationId, exceptions);
  }

  return {
    organizationId,
    dryRun,
    legacyAssociationsScanned: legacyAssociations.length,
    associationsCreated,
    alreadyAssociated,
    exceptions,
    binaryCopies: 0,
    documentsBefore,
    documentsAfter: await prisma.document.count({ where: { organizationId } }),
    documentVersionsBefore,
    documentVersionsAfter: await prisma.documentVersion.count({ where: { organizationId } }),
  };
}

/**
 * Le registre PERSISTÉ reste à la granularité du ClientAccount (`candidate_migration_register`,
 * CCV2-B) : le motif d'exception est une propriété du CLIENT — « il n'a aucune CandidateCompany » —
 * et non de chaque document pris isolément. Créer une seconde table par document dupliquerait ce
 * même fait autant de fois qu'il y a de fichiers. Le détail par document, lui, est retourné dans le
 * rapport, exploitable par l'opérateur sans exposer la moindre donnée sensible (ni titre, ni clé de
 * stockage, ni contenu — uniquement des identifiants).
 */
async function recordExceptionsInRegister(prisma: PrismaClient, organizationId: string, exceptions: readonly DocumentMigrationException[]): Promise<void> {
  const documentCountByClient = new Map<string, number>();
  for (const exception of exceptions) {
    documentCountByClient.set(exception.clientAccountId, (documentCountByClient.get(exception.clientAccountId) ?? 0) + 1);
  }

  for (const [clientAccountId, legacyDocumentCount] of documentCountByClient) {
    await prisma.candidateMigrationRegisterEntry.upsert({
      where: { organizationId_clientAccountId: { organizationId, clientAccountId } },
      create: { organizationId, clientAccountId, reason: "NO_CANDIDATE_COMPANY", status: "PENDING_PRODUCT_DECISION", legacyDocumentCount },
      update: { reason: "NO_CANDIDATE_COMPANY", status: "PENDING_PRODUCT_DECISION", legacyDocumentCount },
    });
  }
}
