import { Global, Module } from "@nestjs/common";
import { DOCUMENT_ACCESS_NARROWING } from "../documents/application/ports/document-access-narrowing";
import { CandidateDocumentAccessNarrowingService } from "../company-profile/application/services/candidate-document-access-narrowing.service";
import { PrismaDocumentCandidateCompanyAssociationRepository } from "../company-profile/infrastructure/prisma-document-candidate-company-association.repository";
import { DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY } from "../company-profile/application/ports/company-satellite.repository";

/**
 * Checkpoint TENDEROS-2.1-CCV2-D — branche le rétrécissement d'accès documentaire candidate sur le
 * module `documents`, SANS créer de cycle : `documents` ne connaît que son propre port, et ce
 * bridge `@Global()` fournit l'implémentation. Même motif exact que
 * `MembershipSeatLimitBridgeModule`, `AiSuggestionBridgeModule` et `TenderAnalysisStateBridgeModule`.
 *
 * Il déclare son PROPRE repository plutôt que d'importer `CompanyProfileModule` : importer ce
 * dernier ramènerait `DocumentsModule` dans le graphe et refermerait le cycle
 * `Documents -> CompanyProfile -> Documents`. Le repository est sans état et lit une seule table —
 * le dupliquer comme provider ne duplique aucune logique métier.
 */
@Global()
@Module({
  providers: [
    // Checkpoint TENDEROS-2.1-H.4 — `PrismaService` N'EST PLUS redeclare ici.
    //
    // `DatabaseModule` est deja `@Global()` et l'exporte : le redeclarer creait une SECONDE instance,
    // donc un second pool de connexions, en contradiction directe avec l'invariant que ce service
    // documente lui-meme (« aucun autre composant n'instancie PrismaClient directement »).
    //
    // Consequence observee : les deux instances etant enregistrees globalement, une injection
    // pouvait resoudre l'une ou l'autre. La preuve de bornage SQL du tableau de bord instrumentait
    // ainsi une instance que le code mesure n'utilisait pas, et ne capturait aucune requete — un
    // faux negatif silencieux. Le defaut etait donc bien PRODUIT ; le test ne faisait que le reveler.
    //
    // Le depot local, lui, reste declare ici : c'est ce qui evite le cycle
    // `Documents -> CompanyProfile -> Documents`, et il ne duplique aucune connexion.
    { provide: DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY, useClass: PrismaDocumentCandidateCompanyAssociationRepository },
    { provide: DOCUMENT_ACCESS_NARROWING, useClass: CandidateDocumentAccessNarrowingService },
  ],
  exports: [DOCUMENT_ACCESS_NARROWING],
})
export class CandidateDocumentAccessBridgeModule {}
