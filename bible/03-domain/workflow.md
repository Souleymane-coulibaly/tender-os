# TenderOS — Business Workflows

Version : 1.0
Statut : Draft
Propriétaires : Product, Domain & Engineering

Ce document transforme les règles métier en processus concrets. Il décrit : les étapes, les acteurs, les décisions, les automatisations, les statuts, les erreurs possibles, les interventions de l'IA.

> **⚠️ Correction d'architecture (V2 Sprint 1)** — Certains workflows ci-dessous mentionnent un
> objet `Workspace` distinct du `Tender`. **Cet objet n'existe pas et ne sera pas créé** —
> `bible/04-architecture/system-architecture.md` §46-54 fait autorité : `Tender` est directement
> l'agrégat racine du travail de réponse. Toute mention de `Workspace` reste une cible non
> implémentée, pas une description de l'existant.

---

## 1. Objectif

Ce document définit les principaux workflows métier de TenderOS.

Un workflow décrit :

- son déclencheur ;
- ses acteurs ;
- ses préconditions ;
- ses étapes ;
- ses règles métier ;
- ses événements ;
- ses résultats ;
- ses cas d'exception.

Ces workflows doivent servir de référence pour :

- les écrans ;
- les APIs ;
- les agents IA ;
- les événements métier ;
- les tests ;
- les automatisations ;
- les permissions.

---

## 2. Cycle de vie global

```text
Tender découvert
        ↓
Matching avec l'entreprise
        ↓
Qualification
        ↓
Décision Go / No-Go
        ↓
Création du Workspace
        ↓
Import et analyse du DCE
        ↓
Planification de la réponse
        ↓
Production de la Proposal
        ↓
Relecture et validation
        ↓
Contrôle de conformité
        ↓
Préparation du Submission Package
        ↓
Soumission
        ↓
Résultat
        ↓
Capitalisation
```

---

## 3. Acteurs principaux

**Organization Admin** — Responsable de : la configuration de l'organisation, la gestion des utilisateurs, la sécurité, les intégrations, les paramètres IA.

**Bid Manager** — Responsable de : la qualification, la décision Go / No-Go, la création du Workspace, la coordination de la réponse, la validation du dossier final.

**Contributor** — Responsable de : la rédaction, l'ajout de documents, la réalisation des tâches, la résolution des commentaires.

**Reviewer** — Responsable de : la relecture, le contrôle de qualité, la création de demandes de modification.

**Approver** — Responsable de : l'approbation formelle, la validation du dossier avant soumission.

**Executive** — Intervient notamment pour : les décisions stratégiques, les dérogations, les engagements importants, les risques élevés.

**AI Agent** — Peut : analyser, recommander, générer, classer, extraire, comparer, signaler. L'AI Agent ne prend pas seul une décision contractuelle définitive.

---

## 4. Workflow WF-001 — Importer un Tender

**Objectif** — Importer un appel d'offres depuis une source externe.

**Déclencheurs** — synchronisation planifiée ; recherche manuelle ; webhook d'une source ; import manuel ; ajout par URL.

**Sources possibles** — BOAMP ; TED ; PLACE ; profil acheteur ; fichier ; saisie manuelle.

**Préconditions** — la source est activée ; le connecteur est configuré ; l'organisation dispose des permissions nécessaires.

**Étapes**

```text
Récupération des données sources
        ↓
Validation technique
        ↓
Conservation des données brutes
        ↓
Normalisation
        ↓
Recherche de doublons
        ↓
Création ou mise à jour du Tender
        ↓
Création des notices associées
        ↓
Calcul du matching
        ↓
Publication dans Discovery
```

**Règles** — l'import doit être idempotent ; les données brutes doivent être conservées ; les sources originales doivent rester traçables ; les doublons doivent être fusionnés sans perte d'information ; une modification importante doit générer un événement.

**Événements** — `TenderImportStarted`, `TenderImported`, `TenderUpdated`, `TenderDuplicateDetected`, `TenderImportFailed`, `TenderMatchRequested`

**Résultat attendu** — Le Tender est disponible dans le module Discovery.

**Exceptions**

- *Source indisponible* — Le système conserve l'erreur, planifie une nouvelle tentative, alerte l'administrateur si l'échec persiste.
- *Données incomplètes* — Le Tender peut être importé avec un statut de qualité partielle. Les champs manquants doivent être signalés.

---

## 5. Workflow WF-002 — Calculer la compatibilité

**Objectif** — Évaluer la pertinence d'un Tender pour une Organization.

**Déclencheurs** — import d'un nouveau Tender ; mise à jour d'un Tender ; modification du Company Profile ; demande manuelle ; changement d'un modèle de matching.

**Entrées** — données du Tender ; lots ; Company Profile ; références ; certifications ; exclusions ; préférences géographiques ; seuils financiers.

**Étapes**

```text
Chargement du Company Profile
        ↓
Analyse des critères de compatibilité
        ↓
Application des exclusions
        ↓
Calcul des sous-scores
        ↓
Calcul du score global
        ↓
Génération d'une explication
        ↓
Classement du Tender
```

**Sous-scores possibles** — adéquation métier ; compatibilité CPV ; couverture géographique ; capacité financière ; certifications ; références ; disponibilité ; contraintes contractuelles ; délai de réponse.

**Sortie**

```json
{
  "score": 82,
  "confidence": "HIGH",
  "strengths": [],
  "weaknesses": [],
  "blockingFactors": [],
  "recommendedAction": "QUALIFY"
}
```

**Règles** — le score doit être explicable ; les exclusions bloquantes doivent être visibles ; le score ne constitue pas une décision Go / No-Go ; chaque résultat doit indiquer ses sources et limites.

**Événements** — `TenderMatchRequested`, `TenderMatchCalculated`, `TenderMatchFailed`

---

## 6. Workflow WF-003 — Shortlister un Tender

**Objectif** — Marquer un Tender comme suffisamment intéressant pour être étudié.

**Déclencheur** — Action d'un utilisateur autorisé.

**Préconditions** — le Tender est actif ; la date limite n'est pas dépassée ; l'utilisateur possède la permission de qualification.

**Étapes**

```text
Ouverture du Tender
        ↓
Consultation du score de compatibilité
        ↓
Consultation des principaux risques
        ↓
Ajout éventuel d'une note
        ↓
Passage à SHORTLISTED
```

**Transition** — `DISCOVERED → SHORTLISTED`

**Événement** — `TenderShortlisted`

**Résultat** — Le Tender apparaît dans la file des opportunités à qualifier.

---

## 7. Workflow WF-004 — Qualifier un Tender

**Objectif** — Évaluer la faisabilité et l'intérêt commercial d'un Tender.

**Acteurs** — Bid Manager ; Executive ; experts techniques ; AI Qualification Agent.

**Préconditions** — le Tender est SHORTLISTED ou QUALIFYING ; les informations minimales sont disponibles.

**Critères** — adéquation stratégique ; références disponibles ; certifications requises ; capacité technique ; disponibilité des équipes ; rentabilité estimée ; budget ; délai ; risques contractuels ; concurrence ; charge de réponse ; probabilité de succès.

**Étapes**

```text
Passage à QUALIFYING
        ↓
Analyse automatique
        ↓
Identification des informations manquantes
        ↓
Collecte des avis internes
        ↓
Calcul du score de qualification
        ↓
Présentation de la recommandation IA
        ↓
Décision humaine
```

**Résultats possibles** — `GO`, `NO_GO`, `WATCHING`

**Règles** — l'IA produit une recommandation ; un utilisateur autorisé prend la décision ; un NO_GO doit être justifié ; un GO avec risque élevé nécessite une dérogation documentée ; les décisions doivent être auditées.

**Événements** — `TenderQualificationStarted`, `TenderQualificationCompleted`, `GoNoGoDecisionRecorded`, `GoNoGoOverrideRecorded`

---

## 8. Workflow WF-005 — Créer un Tender Workspace [NON IMPLÉMENTÉ]

**Non implémenté** : à la décision GO, le code réel ne crée aucun objet "Workspace" séparé — le
`Tender` existant EST l'espace de travail, sans étape de création distincte.

**Objectif *(conception initiale)*** — Créer l'espace de travail interne destiné à traiter le Tender.

**Déclencheur** — Décision GO.

**Préconditions** — une décision GO est enregistrée ; un Bid Manager est désigné ; le Tender n'est pas expiré ; aucun Workspace actif identique n'existe.

**Étapes**

```text
Sélection du Tender ou du lot
        ↓
Désignation du Bid Manager
        ↓
Sélection d'un modèle de Workspace
        ↓
Ajout des premiers membres
        ↓
Création du planning initial
        ↓
Création des tâches de démarrage
        ↓
Création du Workspace
```

**Données créées** — Tender Workspace ; membres ; rôles locaux ; échéances ; checklist initiale ; activités ; paramètres IA ; tâches initiales.

**Statut initial** — `QUALIFICATION`, ou `PREPARATION` si la qualification est déjà finalisée.

**Événements** — `WorkspaceCreationRequested`, `WorkspaceCreated`, `WorkspaceMembersAdded`, `WorkspacePlanningInitialized`

---

## 9. Workflow WF-006 — Importer le DCE

**Objectif** — Ajouter les documents de consultation dans le Workspace.

**Déclencheurs** — téléchargement depuis une source ; import ZIP ; import manuel ; synchronisation avec un profil acheteur.

**Étapes**

```text
Import des fichiers
        ↓
Analyse antivirus
        ↓
Calcul des empreintes
        ↓
Décompression éventuelle
        ↓
Détection des doublons
        ↓
Classification documentaire
        ↓
Extraction du texte
        ↓
Création des versions
        ↓
Indexation
        ↓
Déclenchement de l'analyse IA
```

**Types reconnus** — RC ; CCTP ; CCAP ; AE ; BPU ; DQE ; DPGF ; cadre de réponse ; annexes ; rectificatifs ; questions-réponses.

**Règles** — le fichier original doit être conservé ; chaque version doit être immuable ; chaque document doit être lié à son origine ; les fichiers non lisibles doivent être signalés ; les documents confidentiels doivent respecter les permissions.

**Événements** — `DCEImportStarted`, `ConsultationDocumentUploaded`, `ConsultationDocumentClassified`, `ConsultationDocumentIndexed`, `DCEImportCompleted`, `DCEImportFailed`

---

## 10. Workflow WF-007 — Analyser le DCE

**Objectif** — Extraire les informations nécessaires à la préparation de la réponse.

**Agent principal** — DCE Analyzer Agent

**Entrées** — documents du DCE ; métadonnées du Tender ; contexte du lot ; règles métier ; Company Profile, si nécessaire.

**Analyses attendues** — résumé ; calendrier ; date limite ; critères d'évaluation ; pièces obligatoires ; exigences techniques ; obligations administratives ; risques ; pénalités ; modalités de paiement ; critères éliminatoires ; format de réponse ; questions à poser ; incohérences documentaires.

**Étapes**

```text
Sélection des documents actifs
        ↓
Segmentation
        ↓
Extraction structurée
        ↓
Résolution des références croisées
        ↓
Détection des contradictions
        ↓
Création des Requirements
        ↓
Création des Evaluation Criteria
        ↓
Création des Risks
        ↓
Génération des citations
        ↓
Validation automatique
        ↓
Publication du résultat
```

**Règles IA** — Chaque résultat doit contenir : la source ; la version ; la page ou section ; le niveau de confiance ; les ambiguïtés ; les informations absentes.

**Sorties** — `AIAnalysis` ; `Requirement[]` ; `EvaluationCriterion[]` ; `TenderRisk[]` ; `ComplianceCheck[]` ; tâches proposées.

**Événements** — `DCEAnalysisRequested`, `DCEAnalysisStarted`, `RequirementExtracted`, `EvaluationCriterionExtracted`, `RiskIdentified`, `DCEAnalysisCompleted`, `DCEAnalysisFailed`

---

## 11. Workflow WF-008 — Gérer un rectificatif

**Objectif** — Mettre à jour le Workspace après publication d'un nouveau document ou d'une modification officielle.

**Déclencheur** — Détection d'un `TenderAmendment`.

**Étapes**

```text
Import du rectificatif
        ↓
Création d'une nouvelle version
        ↓
Comparaison avec les versions précédentes
        ↓
Détection des changements
        ↓
Classification par impact
        ↓
Nouvelle analyse ciblée
        ↓
Mise à jour des Requirements
        ↓
Mise à jour des tâches et échéances
        ↓
Notification des membres
```

**Impacts possibles** — date limite modifiée ; critère modifié ; pièce ajoutée ; exigence supprimée ; prix modifié ; format de dépôt modifié ; réponse déjà rédigée devenue obsolète.

**Règles** — aucune information précédente ne doit être écrasée ; les analyses obsolètes doivent être marquées ; les contenus affectés doivent être identifiés ; l'utilisateur doit pouvoir comparer les versions.

**Événements** — `TenderAmendmentDetected`, `DocumentVersionCreated`, `TenderChangesDetected`, `AnalysisInvalidated`, `WorkspaceImpactAssessmentCompleted`

---

## 12. Workflow WF-009 — Construire le plan de réponse

**Objectif** — Créer la structure de la Proposal.

**Entrées** — critères d'évaluation ; exigences ; cadre de réponse ; modèle interne ; réponses antérieures ; préférences de l'organisation.

**Étapes**

```text
Analyse du cadre imposé
        ↓
Analyse des critères de notation
        ↓
Création d'un plan proposé
        ↓
Association des exigences aux sections
        ↓
Association des preuves disponibles
        ↓
Estimation de la charge
        ↓
Validation du plan par le Bid Manager
```

**Règles** — le cadre imposé par l'acheteur prévaut ; chaque critère important doit être couvert ; chaque section doit avoir un objectif ; les exigences doivent être traçables jusqu'à la section correspondante ; le plan généré reste un brouillon.

**Événements** — `ProposalOutlineRequested`, `ProposalOutlineGenerated`, `ProposalOutlineApproved`, `ProposalOutlineRejected`

---

## 13. Workflow WF-010 — Planifier la réponse

**Objectif** — Transformer les exigences et sections en tâches assignables.

**Agent possible** — Task Planner Agent

**Étapes**

```text
Analyse des sections
        ↓
Analyse des échéances
        ↓
Estimation de la charge
        ↓
Identification des compétences nécessaires
        ↓
Création des tâches
        ↓
Détection des dépendances
        ↓
Proposition d'attribution
        ↓
Validation par le Bid Manager
```

**Données d'une tâche** — titre ; description ; responsable ; contributeurs ; échéance ; priorité ; dépendances ; section associée ; exigence associée ; statut.

**Règles** — une tâche critique ne doit pas dépasser la date limite ; les dépendances circulaires sont interdites ; toute attribution IA est modifiable ; les tâches bloquantes doivent être identifiées.

**Événements** — `WorkspacePlanningRequested`, `TaskSuggested`, `TaskCreated`, `TaskAssigned`, `TaskDueDateChanged`

---

## 14. Workflow WF-011 — Générer une section de réponse

**Objectif** — Produire un brouillon de section à partir du DCE et du Company Brain.

**Agent principal** — Proposal Writer Agent

**Préconditions** — la section existe ; les sources autorisées sont disponibles ; l'utilisateur possède les permissions ; le DCE actif a été analysé.

**Étapes**

```text
Lecture de l'objectif de la section
        ↓
Lecture des Requirements associés
        ↓
Recherche dans le Company Brain
        ↓
Sélection des preuves
        ↓
Génération du brouillon
        ↓
Ajout des citations internes
        ↓
Détection des affirmations non prouvées
        ↓
Création d'une Proposal Version
```

**Règles** — aucun fait ne doit être inventé ; les références et certifications doivent être valides ; les sources utilisées doivent être visibles ; le contenu généré doit être marqué DRAFT ; les données confidentielles doivent respecter les permissions.

**Événements** — `ProposalSectionGenerationRequested`, `CompanyKnowledgeRetrieved`, `ProposalSectionGenerated`, `UnsupportedClaimDetected`, `ProposalVersionCreated`

---

## 15. Workflow WF-012 — Collaborer sur une Proposal

**Objectif** — Permettre aux membres de rédiger, commenter et résoudre les modifications.

**Étapes**

```text
Ouverture d'une section
        ↓
Modification du contenu
        ↓
Création d'une version ou sauvegarde
        ↓
Ajout de commentaires
        ↓
Mentions des collaborateurs
        ↓
Résolution des commentaires
        ↓
Passage en revue
```

**Règles** — les modifications doivent être attribuées ; les commentaires peuvent être bloquants ou non bloquants ; la suppression d'un commentaire résolu doit rester traçable ; les conflits d'édition doivent être gérés ; les versions approuvées ne peuvent pas être modifiées directement.

**Événements** — `ProposalSectionUpdated`, `CommentAdded`, `UserMentioned`, `CommentResolved`, `ProposalSubmittedForReview`

---

## 16. Workflow WF-013 — Relecture

**Objectif** — Contrôler la qualité d'une Proposal avant approbation.

**Acteur principal** — Reviewer.

**Contrôles** — couverture des exigences ; cohérence ; précision ; qualité rédactionnelle ; conformité ; preuves ; contradictions ; répétitions ; respect du format ; respect des limites de pages.

**Étapes**

```text
Passage à IN_REVIEW
        ↓
Contrôle humain
        ↓
Contrôle IA complémentaire
        ↓
Ajout de commentaires
        ↓
Décision du Reviewer
```

**Résultats possibles** — `APPROVED`, `CHANGES_REQUESTED`

**Règles** — un Reviewer ne doit pas approuver son propre contenu lorsque la séparation des rôles est exigée ; les commentaires bloquants doivent être résolus ; une nouvelle modification importante invalide la revue précédente.

**Événements** — `ProposalReviewStarted`, `ReviewCommentAdded`, `ProposalChangesRequested`, `ProposalReviewCompleted`

---

## 17. Workflow WF-014 — Vérifier la conformité

**Objectif** — S'assurer que le dossier respecte toutes les exigences identifiées.

**Agent principal** — Compliance Agent

**Entrées** — Requirements ; Proposal ; Company Documents ; Submission Package ; règles internes.

**Étapes**

```text
Chargement des exigences actives
        ↓
Recherche des réponses correspondantes
        ↓
Contrôle des pièces
        ↓
Contrôle des versions
        ↓
Contrôle des dates de validité
        ↓
Détection des absences
        ↓
Classification des problèmes
        ↓
Génération du rapport
```

**Classification** — `BLOCKING`, `WARNING`, `RECOMMENDATION`

**États des contrôles** — `NOT_STARTED`, `IN_PROGRESS`, `COMPLIANT`, `NON_COMPLIANT`, `NOT_APPLICABLE`, `WAIVED`

**Règles** — chaque contrôle doit avoir une origine ; une dérogation doit être justifiée ; une erreur bloquante empêche le passage à `READY_FOR_SUBMISSION` ; la conformité IA doit pouvoir être vérifiée humainement.

**Événements** — `ComplianceCheckStarted`, `ComplianceIssueDetected`, `ComplianceWaiverRequested`, `ComplianceWaiverApproved`, `ComplianceCheckCompleted`

---

## 18. Workflow WF-015 — Approuver la Proposal

**Objectif** — Autoriser formellement l'utilisation de la Proposal pour le dossier final.

**Préconditions** — la Proposal est en revue ; les commentaires bloquants sont résolus ; la conformité est acceptable ; l'Approver possède la permission.

**Étapes**

```text
Consultation du rapport de revue
        ↓
Consultation du rapport de conformité
        ↓
Consultation des risques résiduels
        ↓
Approbation ou rejet
```

**Résultats** — `APPROVED`, `CHANGES_REQUESTED`

**Effets d'une approbation** — création d'une version approuvée ; verrouillage éventuel ; journalisation ; autorisation de créer le Submission Package.

**Événements** — `ProposalApprovalRequested`, `ProposalApproved`, `ProposalApprovalRejected`, `ProposalLocked`

---

## 19. Workflow WF-016 — Préparer le Submission Package

**Objectif** — Créer le dossier final prêt à être déposé.

**Préconditions** — Proposal approuvée ; pièces obligatoires présentes ; absence d'erreurs bloquantes ; date limite valide.

**Étapes**

```text
Sélection des documents
        ↓
Sélection des versions approuvées
        ↓
Vérification des noms de fichiers
        ↓
Vérification des formats
        ↓
Vérification des tailles
        ↓
Vérification des signatures requises
        ↓
Création du manifeste
        ↓
Génération de l'archive
        ↓
Contrôle final
```

**Contenu du manifeste** — Tender ; lot ; Organization ; fichiers ; versions ; empreintes ; auteur ; date ; checklist ; statut de conformité.

**Règles** — le package doit être reproductible ; les fichiers doivent correspondre aux versions approuvées ; le package ne doit pas modifier les documents sources ; toute régénération crée une nouvelle version.

**Événements** — `SubmissionPackagePreparationStarted`, `SubmissionFileValidated`, `SubmissionPackageGenerated`, `SubmissionPackageValidationFailed`

---

## 20. Workflow WF-017 — Enregistrer la soumission

**Objectif** — Enregistrer qu'un dossier a été déposé auprès de l'acheteur.

**MVP** — TenderOS assiste la préparation du dépôt. Le dépôt peut être effectué manuellement sur la plateforme de l'acheteur.

**Étapes**

```text
Dépôt externe
        ↓
Saisie de la date et de l'heure
        ↓
Saisie de la plateforme
        ↓
Ajout de la preuve de dépôt
        ↓
Vérification par l'utilisateur
        ↓
Passage à SUBMITTED
```

**Données obligatoires** — date et heure ; plateforme ; utilisateur ; Submission Package utilisé ; preuve ou référence de dépôt.

**Règles** — la preuve de dépôt est immuable ; toute correction crée une nouvelle entrée ; le changement de statut est audité ; le fuseau horaire doit être conservé.

**Événements** — `SubmissionRecordingStarted`, `SubmissionEvidenceUploaded`, `SubmissionRecorded`, `WorkspaceSubmitted`

---

## 21. Workflow WF-018 — Suivre le résultat

**Objectif** — Enregistrer le résultat de la procédure.

**Déclencheurs** — notification de l'acheteur ; avis d'attribution ; saisie manuelle ; synchronisation avec une source.

**Résultats possibles** — `WON`, `LOST`, `CANCELLED`, `UNKNOWN`

**Étapes**

```text
Réception du résultat
        ↓
Vérification de la source
        ↓
Enregistrement de l'Outcome
        ↓
Ajout des données d'attribution
        ↓
Ajout du feedback
        ↓
Passage du Workspace au statut final
```

**Données possibles** — montant attribué ; titulaire ; score ; classement ; motifs ; commentaires de l'acheteur ; écarts avec le gagnant.

**Événements** — `TenderOutcomeReceived`, `WorkspaceWon`, `WorkspaceLost`, `TenderCancelled`, `AwardRecorded`

---

## 22. Workflow WF-019 — Capitaliser

**Objectif** — Transformer l'expérience du Workspace en connaissance réutilisable.

**Déclencheur** — Enregistrement du résultat ou clôture du Workspace.

**Étapes**

```text
Collecte des données du Workspace
        ↓
Analyse des éléments réutilisables
        ↓
Identification des bonnes pratiques
        ↓
Identification des faiblesses
        ↓
Proposition de connaissances
        ↓
Validation humaine
        ↓
Ajout au Company Brain
```

**Éléments capitalisables** — sections approuvées ; références ; méthodologies ; arguments ; réponses efficaces ; objections ; commentaires ; retours acheteur ; causes de perte ; facteurs de succès.

**Règles** — seuls les contenus validés peuvent devenir des connaissances de référence ; les informations spécifiques à un acheteur doivent être identifiées ; les données confidentielles ne doivent pas être généralisées sans contrôle ; les enseignements IA nécessitent une validation humaine.

**Événements** — `WorkspaceCapitalizationStarted`, `KnowledgeCandidateCreated`, `KnowledgeCandidateApproved`, `CompanyBrainUpdated`, `WorkspaceArchived`

---

## 23. Workflow WF-020 — Gérer un document expirant

**Objectif** — Éviter l'utilisation de pièces administratives obsolètes.

**Déclencheur** — Approche de la date d'expiration.

**Étapes**

```text
Détection de l'expiration prochaine
        ↓
Identification des Workspaces impactés
        ↓
Notification du propriétaire
        ↓
Création éventuelle d'une tâche
        ↓
Import d'une nouvelle version
        ↓
Validation
        ↓
Remplacement de la version active
```

**Règles** — l'ancienne version reste conservée ; les Workspaces utilisant l'ancienne version sont signalés ; une nouvelle version ne devient active qu'après validation ; un document expiré doit générer un avertissement ou une erreur selon son importance.

**Événements** — `CompanyDocumentExpiring`, `CompanyDocumentExpired`, `DocumentRenewalTaskCreated`, `DocumentVersionActivated`

---

## 24. Workflow WF-021 — Inviter un membre

**Objectif** — Ajouter un collaborateur à une Organization ou un Workspace.

**Étapes**

```text
Saisie de l'adresse email
        ↓
Sélection du rôle
        ↓
Sélection du périmètre
        ↓
Envoi de l'invitation
        ↓
Acceptation
        ↓
Création du Membership
```

**Règles** — l'invitation expire ; le rôle doit respecter le moindre privilège ; les consultants externes ont un accès limité ; les invitations et acceptations sont auditées.

**Événements** — `OrganizationInvitationCreated`, `OrganizationInvitationSent`, `OrganizationInvitationAccepted`, `WorkspaceMemberAdded`

---

## 25. Workflow WF-022 — Utiliser le Copilote IA

**Objectif** — Permettre à l'utilisateur d'interagir avec les capacités IA depuis une interface conversationnelle.

**Exemples de demandes**

- « Résume ce marché. »
- « Quels sont les risques ? »
- « Prépare le plan du mémoire technique. »
- « Quels documents manquent ? »
- « Compare les deux versions du RC. »
- « Crée les tâches de réponse. »

**Étapes**

```text
Réception de la demande
        ↓
Identification de l'intention
        ↓
Vérification des permissions
        ↓
Sélection de l'Agent
        ↓
Sélection des outils
        ↓
Exécution
        ↓
Présentation du résultat
        ↓
Demande de confirmation si action sensible
```

**Règles** — le Copilote ne contourne jamais les permissions ; toute action sensible nécessite une confirmation ; les résultats doivent être sourcés ; les limites et incertitudes doivent être visibles ; les actions sont journalisées.

**Événements** — `CopilotRequestReceived`, `AgentSelected`, `ToolExecutionRequested`, `CopilotResponseGenerated`, `CopilotActionConfirmed`, `CopilotActionRejected`

---

## 26. Workflow WF-023 — Archiver un Workspace [NON IMPLÉMENTÉ]

**Non implémenté** : l'archivage réel porte sur `Tender` directement (voir module `tenders`),
jamais sur un objet "Workspace" séparé.

**Objectif *(conception initiale)*** — Clôturer un Workspace sans supprimer ses données.

**Préconditions** — le Workspace est terminé ou annulé ; les tâches critiques sont traitées ; les connaissances utiles ont été évaluées ; l'utilisateur possède la permission.

**Étapes**

```text
Demande d'archivage
        ↓
Vérification des éléments ouverts
        ↓
Avertissement
        ↓
Confirmation
        ↓
Passage à ARCHIVED
```

**Règles** — un Workspace archivé devient principalement en lecture seule ; les données restent consultables selon les permissions ; la restauration doit être possible ; l'archivage est audité.

**Événements** — `WorkspaceArchiveRequested`, `WorkspaceArchived`, `WorkspaceRestored`

---

## 27. Gestion des erreurs

**Erreurs fonctionnelles** — décision Go absente ; document obligatoire manquant ; date limite dépassée ; permission insuffisante ; Proposal non approuvée ; erreur bloquante non résolue.

Ces erreurs doivent être présentées avec : un message clair ; la règle violée ; l'action corrective ; le niveau de gravité.

**Erreurs techniques** — connecteur indisponible ; échec d'extraction ; fichier corrompu ; timeout IA ; erreur de stockage.

Le système doit : journaliser ; réessayer lorsque pertinent ; éviter les doublons ; conserver les données déjà traitées ; informer l'utilisateur si nécessaire.

---

## 28. Gestion des statuts

**Tender**

```text
DISCOVERED
SHORTLISTED
QUALIFYING
GO
NO_GO
WATCHING
EXPIRED
CANCELLED
AWARDED
ARCHIVED
```

**Tender Workspace**

```text
DRAFT
QUALIFICATION
PREPARATION
REVIEW
APPROVED
READY_FOR_SUBMISSION
SUBMITTED
WON
LOST
CANCELLED
ARCHIVED
```

**Proposal**

```text
DRAFT
IN_PROGRESS
IN_REVIEW
CHANGES_REQUESTED
APPROVED
LOCKED
ARCHIVED
```

**Task**

```text
TODO
IN_PROGRESS
BLOCKED
IN_REVIEW
DONE
CANCELLED
```

**Compliance Check**

```text
NOT_STARTED
IN_PROGRESS
COMPLIANT
NON_COMPLIANT
NOT_APPLICABLE
WAIVED
```

---

## 29. Matrice simplifiée des responsabilités

| Workflow | Admin | Bid Manager | Contributor | Reviewer | Approver | IA |
|---|---|---|---|---|---|---|
| Import Tender | Configurer | Consulter | Consulter | Consulter | Consulter | Assister |
| Qualification | Consulter | Piloter | Contribuer | Consulter | Décider si requis | Recommander |
| Création Workspace | Configurer | Créer | — | — | — | Initialiser |
| Analyse DCE | Consulter | Déclencher | Consulter | Vérifier | Consulter | Exécuter |
| Rédaction | — | Piloter | Rédiger | Relire | Consulter | Générer |
| Conformité | — | Piloter | Corriger | Vérifier | Approuver | Contrôler |
| Submission Package | — | Préparer | Contribuer | Vérifier | Autoriser | Vérifier |
| Soumission | — | Enregistrer | — | — | Autoriser | Assister |
| Capitalisation | Configurer | Valider | Proposer | Relire | Valider | Extraire |

---

## 30. Critères d'acceptation d'un workflow

Chaque workflow implémenté doit posséder :

- un identifiant stable ;
- un déclencheur ;
- des préconditions ;
- des permissions ;
- des transitions autorisées ;
- des événements ;
- des cas d'erreur ;
- des tests ;
- une piste d'audit ;
- un comportement IA documenté ;
- une stratégie d'idempotence lorsque nécessaire.

---

## 31. Conventions

Les workflows utilisent l'identifiant :

```text
WF-<NUMÉRO>
```

Exemples :

- WF-001 — Importer un Tender
- WF-007 — Analyser le DCE
- WF-016 — Préparer le Submission Package

Les tests peuvent référencer ces identifiants :

- WF-007-AC-001
- WF-007-AC-002
- WF-016-AC-001
