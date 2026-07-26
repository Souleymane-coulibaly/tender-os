# TenderOS — Domain Events Catalogue

Version : 1.0
Statut : Draft
Propriétaires : Product, Domain & Engineering
Document parent : `bible/03-domain/workflow.md`
Documents associés : `bible/03-domain/domain-model.md`, `bible/03-domain/business-rules.md`, `skills/platform-foundation/ARCHITECTURE_RULES.md` §23, `skills/platform-foundation/DATABASE_PATTERNS.md` §38

---

## 1. Objectif

Ce document consolide en un catalogue unique les événements de domaine déjà décrits, workflow par workflow, dans `bible/03-domain/workflow.md`.

Il ne définit **aucun nouvel événement** : chaque entrée provient d'une section « Événements » explicitement présente dans un workflow (`WF-001` à `WF-023`). Là où `workflow.md` ne précise pas un élément (schéma de payload, statut public/privé, version), ce document le signale comme non défini plutôt que de l'inventer — voir §16.

Ce catalogue sert de référence pour : les contrats d'événements (`ARCHITECTURE_RULES.md` §23), l'Outbox (`DATABASE_PATTERNS.md` §38-40), les webhooks sortants (`API_PATTERNS.md` §26), et les tests (`TESTING_PATTERNS.md` §30).

---

## 2. Convention de nommage

Un événement décrit un fait passé, au participe passé, en `PascalCase` (`ARCHITECTURE_RULES.md` §23) :

```text
TenderShortlisted
GoNoGoDecisionRecorded
ProposalApproved
```

Les identifiants de workflow (`WF-NNN`) référencés ci-dessous suivent la convention de `workflow.md` §31.

---

## 3. Enveloppe technique

Ce document ne redéfinit pas l'enveloppe technique d'un événement (identifiant, version, `organizationId`, horodatage, corrélation) : elle est définie par `ARCHITECTURE_RULES.md` §23 et le schéma `outbox_events` de `DATABASE_DESIGN.md`/`DATABASE_PATTERNS.md` §38. Ce catalogue liste uniquement les **noms d'événements métier** et leur origine.

---

## 4. Tender Discovery et Matching

Source : `workflow.md` WF-001, WF-002.

| Événement | Workflow | Description |
|---|---|---|
| `TenderImportStarted` | WF-001 | Un import de Tender depuis une source externe a débuté. |
| `TenderImported` | WF-001 | Un Tender a été créé à partir d'une source externe. |
| `TenderUpdated` | WF-001 | Un Tender existant a été mis à jour lors d'un import. |
| `TenderDuplicateDetected` | WF-001 | Un doublon a été détecté lors de l'import et fusionné. |
| `TenderImportFailed` | WF-001 | L'import d'un Tender a échoué. |
| `TenderMatchRequested` | WF-001, WF-002 | Un calcul de compatibilité a été demandé pour un Tender. |
| `TenderMatchCalculated` | WF-002 | Le score de compatibilité d'un Tender a été calculé. |
| `TenderMatchFailed` | WF-002 | Le calcul de compatibilité a échoué. |

---

## 5. Qualification et décision Go / No-Go

Source : `workflow.md` WF-003, WF-004.

| Événement | Workflow | Description |
|---|---|---|
| `TenderShortlisted` | WF-003 | Un Tender est passé de `DISCOVERED` à `SHORTLISTED`. |
| `TenderQualificationStarted` | WF-004 | La qualification d'un Tender a débuté (`QUALIFYING`). |
| `TenderQualificationCompleted` | WF-004 | La qualification d'un Tender est terminée. |
| `GoNoGoDecisionRecorded` | WF-004 | Une décision `GO`, `NO_GO` ou `WATCHING` a été enregistrée. |
| `GoNoGoOverrideRecorded` | WF-004 | Une décision Go/No-Go antérieure a été corrigée par une nouvelle décision. |

---

## 6. Workspace

Source : `workflow.md` WF-005, WF-023.

| Événement | Workflow | Description |
|---|---|---|
| `WorkspaceCreationRequested` | WF-005 | La création d'un Tender Workspace a été demandée suite à une décision GO. |
| `WorkspaceCreated` | WF-005 | Le Tender Workspace a été créé. |
| `WorkspaceMembersAdded` | WF-005 | Les premiers membres ont été ajoutés au Workspace. |
| `WorkspacePlanningInitialized` | WF-005 | Le planning initial et les tâches de démarrage ont été créés. |
| `WorkspaceArchiveRequested` | WF-023 | L'archivage d'un Workspace a été demandé. |
| `WorkspaceArchived` | WF-019, WF-023 | Le Workspace est passé au statut `ARCHIVED`. |
| `WorkspaceRestored` | WF-023 | Un Workspace archivé a été restauré. |

---

## 7. DCE et documents

Source : `workflow.md` WF-006, WF-007, WF-008, WF-020.

| Événement | Workflow | Description |
|---|---|---|
| `DCEImportStarted` | WF-006 | L'import des documents de consultation a débuté. |
| `ConsultationDocumentUploaded` | WF-006 | Un document du DCE a été téléversé. |
| `ConsultationDocumentClassified` | WF-006 | Un document a été classifié (RC, CCTP, CCAP, AE, BPU, DQE, DPGF, etc.). |
| `ConsultationDocumentIndexed` | WF-006 | Un document a été indexé après extraction du texte. |
| `DCEImportCompleted` | WF-006 | L'import du DCE est terminé. |
| `DCEImportFailed` | WF-006 | L'import du DCE a échoué. |
| `DCEAnalysisRequested` | WF-007 | Une analyse IA du DCE a été demandée. |
| `DCEAnalysisStarted` | WF-007 | L'analyse IA du DCE a débuté. |
| `RequirementExtracted` | WF-007 | Une exigence a été extraite du DCE. |
| `EvaluationCriterionExtracted` | WF-007 | Un critère d'évaluation a été extrait. |
| `RiskIdentified` | WF-007 | Un risque a été identifié. |
| `DCEAnalysisCompleted` | WF-007 | L'analyse IA du DCE est terminée. |
| `DCEAnalysisFailed` | WF-007 | L'analyse IA du DCE a échoué. |
| `TenderAmendmentDetected` | WF-008 | Un rectificatif (`TenderAmendment`) a été détecté. |
| `DocumentVersionCreated` | WF-008 | Une nouvelle version de document a été créée suite à un rectificatif. |
| `TenderChangesDetected` | WF-008 | Des changements ont été détectés par comparaison avec la version précédente. |
| `AnalysisInvalidated` | WF-008 | Une analyse devenue obsolète a été invalidée. |
| `WorkspaceImpactAssessmentCompleted` | WF-008 | L'évaluation de l'impact du rectificatif sur le Workspace est terminée. |
| `CompanyDocumentExpiring` | WF-020 | Un document d'entreprise approche de sa date d'expiration. |
| `CompanyDocumentExpired` | WF-020 | Un document d'entreprise a expiré. |
| `DocumentRenewalTaskCreated` | WF-020 | Une tâche de renouvellement de document a été créée. |
| `DocumentVersionActivated` | WF-020 | Une nouvelle version de document est devenue active après validation. |

---

## 8. Proposal — plan, rédaction, collaboration, relecture, approbation

Source : `workflow.md` WF-009 à WF-013, WF-015.

| Événement | Workflow | Description |
|---|---|---|
| `ProposalOutlineRequested` | WF-009 | La génération du plan de la Proposal a été demandée. |
| `ProposalOutlineGenerated` | WF-009 | Un plan de Proposal a été généré. |
| `ProposalOutlineApproved` | WF-009 | Le plan a été validé par le Bid Manager. |
| `ProposalOutlineRejected` | WF-009 | Le plan a été rejeté par le Bid Manager. |
| `WorkspacePlanningRequested` | WF-010 | La planification des tâches de réponse a été demandée. |
| `TaskSuggested` | WF-010 | Une tâche a été suggérée (potentiellement par le Task Planner Agent). |
| `TaskCreated` | WF-010 | Une tâche a été créée. |
| `TaskAssigned` | WF-010 | Une tâche a été attribuée à un responsable. |
| `TaskDueDateChanged` | WF-010 | L'échéance d'une tâche a été modifiée. |
| `ProposalSectionGenerationRequested` | WF-011 | La génération d'un brouillon de section a été demandée. |
| `CompanyKnowledgeRetrieved` | WF-011 | Des connaissances du Company Brain ont été utilisées pour la génération. |
| `ProposalSectionGenerated` | WF-011 | Un brouillon de section a été généré par le Proposal Writer Agent. |
| `UnsupportedClaimDetected` | WF-011 | Une affirmation non sourcée a été détectée dans un brouillon. |
| `ProposalVersionCreated` | WF-011 | Une nouvelle version de la Proposal a été créée. |
| `ProposalSectionUpdated` | WF-012 | Le contenu d'une section a été modifié. |
| `CommentAdded` | WF-012 | Un commentaire a été ajouté. |
| `UserMentioned` | WF-012 | Un collaborateur a été mentionné dans un commentaire. |
| `CommentResolved` | WF-012 | Un commentaire a été résolu. |
| `ProposalSubmittedForReview` | WF-012 | La Proposal a été soumise pour relecture. |
| `ProposalReviewStarted` | WF-013 | La Proposal est passée à `IN_REVIEW`. |
| `ReviewCommentAdded` | WF-013 | Un commentaire de relecture a été ajouté. |
| `ProposalChangesRequested` | WF-013 | Le Reviewer a demandé des modifications. |
| `ProposalReviewCompleted` | WF-013 | La relecture est terminée (`APPROVED` ou `CHANGES_REQUESTED`). |
| `ProposalApprovalRequested` | WF-015 | Une approbation formelle de la Proposal a été demandée. |
| `ProposalApproved` | WF-015 | La Proposal a été approuvée formellement. |
| `ProposalApprovalRejected` | WF-015 | L'approbation a été refusée. |
| `ProposalLocked` | WF-015 | La Proposal approuvée a été verrouillée. |

---

## 9. Compliance

Source : `workflow.md` WF-014.

| Événement | Workflow | Description |
|---|---|---|
| `ComplianceCheckStarted` | WF-014 | Le contrôle de conformité a débuté. |
| `ComplianceIssueDetected` | WF-014 | Un problème de conformité a été détecté (`BLOCKING`, `WARNING`, `RECOMMENDATION`). |
| `ComplianceWaiverRequested` | WF-014 | Une dérogation à une exigence de conformité a été demandée. |
| `ComplianceWaiverApproved` | WF-014 | Une dérogation a été approuvée. |
| `ComplianceCheckCompleted` | WF-014 | Le contrôle de conformité est terminé et le rapport généré. |

---

## 10. Submission

Source : `workflow.md` WF-016, WF-017.

| Événement | Workflow | Description |
|---|---|---|
| `SubmissionPackagePreparationStarted` | WF-016 | La préparation du dossier final a débuté. |
| `SubmissionFileValidated` | WF-016 | Un fichier du dossier a été validé (nom, format, taille, signature). |
| `SubmissionPackageGenerated` | WF-016 | Le Submission Package (manifeste + archive) a été généré. |
| `SubmissionPackageValidationFailed` | WF-016 | La validation du Submission Package a échoué. |
| `SubmissionRecordingStarted` | WF-017 | L'enregistrement d'une soumission déposée a débuté. |
| `SubmissionEvidenceUploaded` | WF-017 | Une preuve de dépôt a été téléversée. |
| `SubmissionRecorded` | WF-017 | La soumission a été enregistrée (immuable, `SUBMITTED`). |
| `WorkspaceSubmitted` | WF-017 | Le Workspace est passé au statut `SUBMITTED`. |

---

## 11. Outcome

Source : `workflow.md` WF-018.

| Événement | Workflow | Description |
|---|---|---|
| `TenderOutcomeReceived` | WF-018 | Un résultat de procédure a été reçu ou saisi. |
| `WorkspaceWon` | WF-018 | Le Workspace est passé au statut `WON`. |
| `WorkspaceLost` | WF-018 | Le Workspace est passé au statut `LOST`. |
| `TenderCancelled` | WF-018 | La procédure a été annulée. |
| `AwardRecorded` | WF-018 | Les données d'attribution (montant, titulaire, classement) ont été enregistrées. |

---

## 12. Capitalisation et Company Brain

Source : `workflow.md` WF-019.

| Événement | Workflow | Description |
|---|---|---|
| `WorkspaceCapitalizationStarted` | WF-019 | La capitalisation d'un Workspace clôturé a débuté. |
| `KnowledgeCandidateCreated` | WF-019 | Une connaissance candidate a été proposée à partir du Workspace. |
| `KnowledgeCandidateApproved` | WF-019 | Une connaissance candidate a été validée humainement. |
| `CompanyBrainUpdated` | WF-019 | Le Company Brain a été enrichi d'une connaissance validée. |

`WorkspaceArchived` (déclenché également par ce workflow) est déjà catalogué en §6.

---

## 13. Organization et Membership

Source : `workflow.md` WF-021.

| Événement | Workflow | Description |
|---|---|---|
| `OrganizationInvitationCreated` | WF-021 | Une invitation à rejoindre l'Organization ou un Workspace a été créée. |
| `OrganizationInvitationSent` | WF-021 | L'invitation a été envoyée. |
| `OrganizationInvitationAccepted` | WF-021 | L'invitation a été acceptée. |
| `WorkspaceMemberAdded` | WF-021 | Un Membership a été créé suite à l'acceptation. |

---

## 14. AI Copilot

Source : `workflow.md` WF-022.

| Événement | Workflow | Description |
|---|---|---|
| `CopilotRequestReceived` | WF-022 | Une demande a été reçue par le Copilote conversationnel. |
| `AgentSelected` | WF-022 | Un Agent a été sélectionné pour traiter la demande. |
| `ToolExecutionRequested` | WF-022 | L'exécution d'un outil a été demandée par l'Agent. |
| `CopilotResponseGenerated` | WF-022 | Une réponse a été générée et présentée à l'utilisateur. |
| `CopilotActionConfirmed` | WF-022 | Une action sensible proposée par le Copilote a été confirmée par l'utilisateur. |
| `CopilotActionRejected` | WF-022 | Une action sensible proposée a été refusée. |

---

## 15. Table récapitulative

```text
Tender Discovery & Matching   →  8 événements (§4)
Qualification & Go/No-Go       →  5 événements (§5)
Workspace                       →  7 événements (§6)
DCE & Documents                  → 21 événements (§7)
Proposal                          → 26 événements (§8)
Compliance                         →  5 événements (§9)
Submission                          →  8 événements (§10)
Outcome                              →  5 événements (§11)
Capitalisation & Company Brain        →  4 événements (§12, + 1 partagé avec §6)
Organization & Membership              →  4 événements (§13)
AI Copilot                              →  6 événements (§14)
```

Soit 23 workflows et une centaine d'événements métier, tous directement issus de `workflow.md`.

---

## 16. Ce qui n'est pas encore défini

Ce catalogue liste des **noms** d'événements. Restent à définir, hors périmètre de ce document car nécessitant des décisions produit et techniques non encore prises :

- le schéma de payload détaillé de chaque événement (champs, types) ;
- la version initiale (`eventVersion`) de chacun ;
- le statut public/privé de chacun au sens de `ARCHITECTURE_RULES.md` §23.1 (événement interne au module, interne à la plateforme, ou contrat d'intégration externe) ;
- les consommateurs prévus pour chaque événement ;
- la politique de rétention et de compatibilité par événement.

Ces éléments doivent être définis au moment de l'implémentation du module concerné, en cohérence avec `ARCHITECTURE_RULES.md` §23 et `MODULE_TEMPLATE.md` §49 (contrat d'événement), sans contredire les noms et déclencheurs déjà fixés ici.

---

## 17. Critères d'acceptation

Ce catalogue est correctement appliqué lorsque :

- aucun événement utilisé dans le code ne porte un nom absent de ce catalogue sans mise à jour préalable du catalogue ;
- tout nouvel événement proposé est d'abord ajouté ici, avec son workflow d'origine, avant d'être implémenté ;
- ce document reste synchronisé avec `workflow.md` — toute évolution d'un workflow entraînant un nouvel événement met à jour ce catalogue dans le même changement ;
- les schémas de payload, une fois définis, sont documentés dans le module propriétaire (`contracts/events/`, `MODULE_TEMPLATE.md` §49), pas dans ce catalogue.
