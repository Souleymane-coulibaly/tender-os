# TenderOS — Ubiquitous Language

Version : 1.0
Statut : Draft
Propriétaires : Product, Domain & Engineering

Ce document fixe le vocabulaire officiel de TenderOS.

Le même terme devra être utilisé dans :

- l'interface ;
- la base de données ;
- les API ;
- la documentation ;
- les prompts IA ;
- les tests ;
- les échanges produit et techniques.

---

## 1. Objectif

Ce document définit le langage métier officiel de TenderOS.

Chaque concept possède :

- un terme officiel ;
- une définition précise ;
- des synonymes interdits ou déconseillés ;
- une représentation technique recommandée.

Le but est d'éviter qu'un même concept soit appelé différemment selon les écrans, les Skills ou les développeurs.

---

## 2. Règles de langage

### UL-001 — Un concept, un terme

Un concept métier doit avoir un seul nom officiel.

```text
Correct   : Workspace
Incorrect : Projet, dossier, affaire, opportunité active
```

### UL-002 — Langage métier dans le code

Les noms techniques doivent refléter le vocabulaire métier.

- `Tender`
- `TenderWorkspace`
- `Proposal`
- `Submission`
- `Buyer`

Éviter les noms génériques :

- `Item`
- `Object`
- `Data`
- `ProjectEntity`
- `BusinessRecord`

### UL-003 — Anglais technique, français dans l'interface

Le domaine et le code utilisent principalement des termes anglais stables.

L'interface utilisateur peut afficher leur traduction française.

```text
Code      : TenderWorkspace
Interface : Espace de réponse
```

### UL-004 — Pas d'abréviation ambiguë

Les abréviations sont autorisées uniquement lorsqu'elles sont reconnues dans le domaine.

Exemples autorisés : DCE, RC, CCTP, CCAP, AE, BPU, DQE, DPGF, CPV.

---

## 3. Concepts principaux

### Organization

**Définition** — Entreprise cliente utilisant TenderOS. Une Organization constitue la frontière principale d'isolation des données.

**Traduction interface** — Organisation ou entreprise.

**Termes à éviter** — Tenant dans l'interface ; Client ; Account ; Company Account.

**Représentation technique** — `Organization`, `organizationId`

---

### Organization Member

**Définition** — Utilisateur appartenant à une organisation. Un utilisateur peut disposer de rôles et de permissions propres à cette organisation.

**Traduction interface** — Membre ou collaborateur.

**Termes à éviter** — Employee ; Agent ; Team User.

**Représentation technique** — `OrganizationMember`, `membershipId`

---

### User

**Définition** — Identité d'une personne pouvant accéder à TenderOS. Le User représente l'identité globale. Son appartenance à une organisation est représentée par OrganizationMember.

**Traduction interface** — Utilisateur.

**Distinction importante** — `User` = identité ; `OrganizationMember` = appartenance à une organisation.

---

### Buyer

**Définition** — Entité publique ou privée qui publie un marché. Exemples : commune, ministère, région, hôpital, établissement public, opérateur public.

**Traduction interface** — Acheteur.

**Termes à éviter** — Client ; Publisher ; Contracting Client.

**Représentation technique** — `Buyer`, `buyerId`

---

### Tender

**Définition** — Opportunité de marché publiée par un acheteur. Un Tender représente l'annonce et ses informations officielles, indépendamment de la décision d'une organisation d'y répondre.

**Traduction interface** — Appel d'offres ou marché.

**Termes à éviter** — Projet ; Lead ; Deal ; Opportunity (sauf contexte commercial externe) ; Consultation (lorsque l'on désigne l'entité complète).

**Représentation technique** — `Tender`, `tenderId`

---

### Tender Source

**Définition** — Système externe à partir duquel un Tender est importé. Exemples : BOAMP, TED, PLACE, profil acheteur, import manuel.

**Traduction interface** — Source.

**Représentation technique** — `TenderSource`, `sourceTenderId`

---

### Tender Notice

**Définition** — Publication officielle associée à un Tender. Un Tender peut comporter plusieurs notices : avis initial, rectificatif, avis d'attribution, avis d'annulation.

**Traduction interface** — Avis.

**Distinction importante** — `Tender` = marché normalisé dans TenderOS ; `Tender Notice` = publication officielle individuelle.

---

### Lot

**Définition** — Partie autonome d'un Tender à laquelle une entreprise peut répondre séparément.

**Traduction interface** — Lot.

**Représentation technique** — `TenderLot`, `lotId`

Le terme technique recommandé est `TenderLot` afin d'éviter les ambiguïtés.

---

### Tender Match

**Définition** — Évaluation de la compatibilité entre un Tender et le profil d'une Organization. Le match peut prendre en compte : activité, CPV, localisation, budget, références, certifications, capacité, exclusions.

**Traduction interface** — Compatibilité ou score de correspondance.

**Termes à éviter** — AI Score sans précision ; Win Score ; Ranking global.

**Représentation technique** — `TenderMatch`, `matchScore`

---

### Qualification

**Définition** — Processus d'évaluation permettant de déterminer si une organisation doit étudier ou poursuivre un Tender.

**Traduction interface** — Qualification.

**Résultats possibles** — `GO`, `NO_GO`, `WATCHING`

**Termes à éviter** — Validation ; Approbation ; Sélection finale.

---

### Go/No-Go Decision

**Définition** — Décision humaine déterminant si l'organisation poursuit la réponse au Tender.

**Traduction interface** — Décision Go / No-Go.

**Représentation technique** — `GoNoGoDecision`

**Distinction importante** — Le score IA est une recommandation. La décision Go/No-Go est une décision métier humaine.

---

### Tender Workspace

**Définition** — Espace de travail créé par une organisation pour étudier et préparer une réponse à un Tender ou à un lot. Il regroupe notamment : membres, DCE, analyses, tâches, propositions, validations, checklist, soumission.

**Traduction interface** — Espace de réponse.

**Nom court autorisé** — `Workspace`, lorsque le contexte ne crée aucune ambiguïté.

**Termes à éviter** — Projet ; Dossier ; Affaire ; Board ; Room.

**Représentation technique** — `TenderWorkspace`, `workspaceId`

---

### DCE

**Définition** — Dossier de consultation des entreprises publié par l'acheteur. Le DCE regroupe les documents nécessaires pour comprendre le marché et préparer une réponse.

**Forme complète** — Dossier de consultation des entreprises.

**Représentation technique** — `ConsultationPackage`, `dceId`

Dans le langage produit, le terme DCE reste autorisé et recommandé.

---

### Consultation Document

**Définition** — Document individuel appartenant au DCE. Exemples : RC, CCTP, CCAP, AE, BPU, DQE, DPGF, annexes.

**Traduction interface** — Document de consultation.

**Termes à éviter** — Company Document ; Attachment générique.

**Représentation technique** — `ConsultationDocument`

---

### Company Document

**Définition** — Document interne appartenant à l'organisation et réutilisable dans les réponses. Exemples : extrait Kbis, attestation, certification, CV, mémoire technique précédent, référence client.

**Traduction interface** — Document d'entreprise.

**Distinction importante** — `Consultation Document` = fourni par l'acheteur ; `Company Document` = fourni par l'entreprise candidate.

---

### Document Version

**Définition** — État immuable d'un document à un moment donné. Chaque modification importante produit une nouvelle version.

**Traduction interface** — Version du document.

**Représentation technique** — `DocumentVersion`, `versionNumber`

---

### Company Brain

**Définition** — Base de connaissances privée de l'organisation. Elle contient les connaissances, documents et contenus validés pouvant être mobilisés pour analyser et produire des réponses.

**Traduction interface** — Mémoire d'entreprise.

**Termes à éviter** — Knowledge Base (sauf documentation technique) ; Drive ; Bibliothèque simple ; Data Lake.

**Représentation technique** — `CompanyKnowledgeBase`

Le nom produit reste Company Brain.

---

### Company Profile

**Définition** — Description structurée de l'organisation utilisée pour la qualification et la génération. Elle peut inclure : activités, zones d'intervention, effectifs, expertises, CPV ciblés, certifications, références, limites commerciales.

**Traduction interface** — Profil entreprise.

**Représentation technique** — `CompanyProfile`

---

### Reference

**Définition** — Expérience ou mission antérieure démontrant la capacité de l'organisation.

**Traduction interface** — Référence client ou référence projet.

**Termes à éviter** — Testimonial ; Case (sans précision) ; Project (sans contexte).

**Représentation technique** — `CompanyReference`

---

### Certification

**Définition** — Accréditation ou certification détenue par une organisation ou un collaborateur. Exemples : ISO 9001, ISO 27001, Qualiopi, qualification professionnelle.

**Représentation technique** — `Certification`

---

### AI Analysis

**Définition** — Résultat structuré produit par une intelligence artificielle à partir d'un Tender, d'un DCE ou de données de l'organisation. Exemples : résumé, risques, exigences, critères, planning, score, recommandations.

**Traduction interface** — Analyse IA.

**Termes à éviter** — Insight générique ; Answer ; Result sans type précis.

**Représentation technique** — `AIAnalysis`, `analysisType`

---

### Requirement

**Définition** — Condition, obligation ou attente identifiée dans le DCE. Une exigence doit idéalement être liée à une source précise.

**Traduction interface** — Exigence.

**Types possibles** — administrative, technique, financière, contractuelle, documentaire, environnementale, sociale.

**Termes à éviter** — Rule ; Task ; Checklist Item (sauf lorsque l'exigence a été transformée en contrôle).

**Représentation technique** — `Requirement`, `requirementId`

---

### Evaluation Criterion

**Définition** — Critère utilisé par l'acheteur pour évaluer les offres. Exemples : prix, valeur technique, délai, performance environnementale.

**Traduction interface** — Critère d'évaluation ou critère de notation.

**Représentation technique** — `EvaluationCriterion`, `weight`

---

### Risk

**Définition** — Élément susceptible de réduire la faisabilité, la conformité, la rentabilité ou la probabilité de succès.

**Traduction interface** — Risque.

**Types possibles** — juridique, contractuel, technique, financier, planning, conformité, ressource.

**Représentation technique** — `TenderRisk`, `riskLevel`

---

### Proposal

**Définition** — Contenu produit par l'organisation en réponse au Tender. La Proposal peut inclure : mémoire technique, réponses structurées, méthodologie, engagements, annexes internes.

**Traduction interface** — Proposition ou réponse.

**Terme privilégié dans l'interface** — Réponse.

**Termes à éviter** — Offer (lorsque le terme englobe aussi la partie financière) ; Submission ; Final Document.

**Représentation technique** — `Proposal`, `proposalId`

---

### Proposal Section

**Définition** — Partie structurée d'une Proposal. Une section peut correspondre à une exigence, à un critère de notation, à un chapitre, ou à une question du cadre de réponse.

**Traduction interface** — Section de réponse.

**Représentation technique** — `ProposalSection`

---

### Proposal Version

**Définition** — Version immuable d'une Proposal. Une nouvelle version est créée après une modification significative ou une nouvelle génération.

**Traduction interface** — Version de la réponse.

**Représentation technique** — `ProposalVersion`

---

### Draft

**Définition** — Contenu non validé pouvant encore être modifié. Tout contenu généré par l'IA est initialement un Draft.

**Traduction interface** — Brouillon.

**Représentation technique** — `DRAFT`

---

### Review

**Définition** — Processus de contrôle humain d'un contenu ou d'un Workspace.

**Traduction interface** — Relecture ou revue.

**Termes à éviter** — Validation (tant qu'aucune décision formelle n'est prise) ; Audit (sauf contrôle formel distinct).

---

### Approval

**Définition** — Décision formelle autorisant un contenu ou un Workspace à passer à l'étape suivante.

**Traduction interface** — Approbation ou validation.

**Distinction importante** — `Review` = examiner ; `Approval` = autoriser.

---

### Task

**Définition** — Action assignable à un membre dans un Workspace.

**Traduction interface** — Tâche.

**Représentation technique** — `WorkspaceTask`, `taskId`

---

### Comment

**Définition** — Message collaboratif attaché à une entité métier. Un commentaire peut être attaché à : une Proposal, une section, un document, une tâche, une analyse.

**Traduction interface** — Commentaire.

**Représentation technique** — `Comment`

---

### Mention

**Définition** — Référence explicite à un utilisateur dans un commentaire ou une activité. Exemple : `@Utilisateur`

**Représentation technique** — `Mention`

---

### Compliance Checklist

**Définition** — Liste de contrôles permettant de vérifier que la réponse respecte les exigences du DCE et les règles internes.

**Traduction interface** — Checklist de conformité.

**Représentation technique** — `ComplianceChecklist`

---

### Checklist Item

**Définition** — Contrôle individuel d'une Compliance Checklist. Il peut provenir d'une exigence du DCE, d'une politique interne, d'une règle réglementaire, ou d'une vérification documentaire.

**Traduction interface** — Point de contrôle.

**Représentation technique** — `ComplianceCheck`

---

### Blocking Issue

**Définition** — Problème empêchant une approbation ou une soumission.

**Traduction interface** — Erreur bloquante.

**Termes à éviter** — Critical Warning ; Alert ; Bug (sauf problème logiciel).

**Représentation technique** — `BlockingIssue`

---

### Warning

**Définition** — Problème non bloquant nécessitant une attention humaine.

**Traduction interface** — Avertissement.

**Représentation technique** — `Warning`

---

### Submission

**Définition** — Acte ou enregistrement final de dépôt d'une réponse auprès de l'acheteur.

**Traduction interface** — Soumission ou dépôt.

**Distinction importante** — `Proposal` = contenu de la réponse ; `Submission Package` = ensemble des fichiers prêts à déposer ; `Submission` = dépôt enregistré.

**Représentation technique** — `Submission`, `submissionId`

---

### Submission Package

**Définition** — Ensemble final des documents préparés pour le dépôt. Il inclut notamment : fichiers, versions, manifeste, contrôles, métadonnées de génération.

**Traduction interface** — Dossier de dépôt.

**Représentation technique** — `SubmissionPackage`

---

### Submission Evidence

**Définition** — Preuve confirmant qu'une réponse a été déposée. Exemples : accusé de réception, référence de dépôt, capture, récépissé, horodatage.

**Traduction interface** — Preuve de dépôt.

**Représentation technique** — `SubmissionEvidence`

---

### Outcome

**Définition** — Résultat connu après la soumission.

**Valeurs possibles** — `WON`, `LOST`, `CANCELLED`, `UNKNOWN`

**Traduction interface** — Résultat.

**Représentation technique** — `TenderOutcome`

---

### Award

**Définition** — Attribution officielle d'un marché à un opérateur économique.

**Traduction interface** — Attribution.

**Distinction importante** — `Outcome` = résultat pour l'organisation ; `Award` = décision officielle de l'acheteur.

---

### Notification

**Définition** — Information adressée à un utilisateur à la suite d'un événement métier.

**Traduction interface** — Notification.

**Représentation technique** — `Notification`

---

### Alert

**Définition** — Notification nécessitant une attention particulière. Exemples : date limite proche, rectificatif, document expiré, tâche bloquée, erreur de conformité.

**Traduction interface** — Alerte.

**Distinction importante** — Toutes les alertes sont des notifications. Toutes les notifications ne sont pas des alertes.

---

### Audit Log

**Définition** — Journal immuable des actions sensibles effectuées dans le système.

**Traduction interface** — Journal d'audit ou historique de sécurité.

**Termes à éviter** — Activity Feed ; History (lorsque la traçabilité réglementaire est concernée).

**Représentation technique** — `AuditLogEntry`

---

### Activity

**Définition** — Événement visible dans le fil d'activité d'un Workspace. Exemples : tâche terminée, commentaire ajouté, document importé, changement de statut.

**Traduction interface** — Activité.

**Distinction importante** — `Activity` = historique collaboratif ; `Audit Log` = traçabilité sensible et sécurisée.

---

### Domain Event

**Définition** — Événement métier immuable signalant qu'un fait important s'est produit. Exemples : `TenderImported`, `WorkspaceCreated`, `ProposalApproved`, `SubmissionRecorded`.

**Traduction documentation** — Événement métier.

**Représentation technique** — `DomainEvent`

---

### AI Agent

**Définition** — Composant IA spécialisé capable d'exécuter une mission déterminée à l'aide d'outils autorisés. Exemples : DCE Analyzer Agent, Qualification Agent, Proposal Writer Agent, Compliance Agent.

**Traduction interface** — Agent IA, lorsque l'agent est exposé à l'utilisateur.

**Termes à éviter** — Bot ; Assistant générique ; Model.

---

### AI Copilot

**Définition** — Interface conversationnelle unifiée permettant à l'utilisateur d'interagir avec les capacités IA de TenderOS.

**Traduction interface** — Copilote IA.

**Distinction importante** — `AI Agent` = capacité spécialisée ; `AI Copilot` = interface qui orchestre ces capacités.

---

### AI Run

**Définition** — Exécution individuelle d'une fonctionnalité ou d'un Agent IA. Elle conserve : entrées, sources, modèle, prompt, paramètres, résultat, statut, coûts éventuels.

**Traduction interface** — Exécution IA.

**Représentation technique** — `AIRun`

---

### Citation

**Définition** — Référence permettant de relier une affirmation IA à une source.

```text
Document : RC.pdf
Page     : 12
Section  : 4.2
```

**Traduction interface** — Source ou citation.

**Représentation technique** — `SourceCitation`

---

### Confidence Level

**Définition** — Indication du degré de confiance associé à un résultat IA.

**Valeurs recommandées** — `LOW`, `MEDIUM`, `HIGH`

**Traduction interface** — Niveau de confiance.

**Règle** — Un niveau de confiance ne doit jamais être présenté comme une probabilité scientifique sans méthode d'évaluation documentée.

---

## 4. Documents du DCE

**RC** — Règlement de la consultation. Décrit notamment : procédure, délais, documents demandés, critères, modalités de dépôt.

**CCTP** — Cahier des clauses techniques particulières. Décrit les exigences techniques du marché.

**CCAP** — Cahier des clauses administratives particulières. Décrit les conditions administratives, contractuelles et financières.

**AE** — Acte d'engagement. Document contractuel formalisant l'engagement du candidat.

**BPU** — Bordereau des prix unitaires. Liste des prix appliqués à des unités de prestation.

**DQE** — Détail quantitatif estimatif. Simulation permettant d'évaluer une offre à partir de quantités estimées.

**DPGF** — Décomposition du prix global et forfaitaire. Ventilation d'un prix forfaitaire par postes.

**Cadre de réponse** — Document imposant la structure ou le format de la réponse attendue. Représentation technique : `ResponseTemplate`

**Rectificatif** — Publication modifiant une information ou un document du Tender. Représentation technique : `TenderAmendment`

**Questions-réponses** — Échanges officiels entre l'acheteur et les candidats. Représentation technique : `BuyerClarification`

---

## 5. Termes relatifs aux acteurs

**Bid Manager** — Personne responsable du pilotage d'un Workspace. Traduction interface : Responsable de la réponse ou responsable appels d'offres.

**Contributor** — Personne qui produit ou modifie du contenu. Traduction interface : Contributeur.

**Reviewer** — Personne chargée de relire et de demander des modifications. Traduction interface : Relecteur.

**Approver** — Personne autorisée à approuver formellement un contenu ou une étape. Traduction interface : Validateur.

**Organization Admin** — Personne administrant l'organisation, les utilisateurs et les paramètres. Traduction interface : Administrateur de l'organisation.

**External Consultant** — Utilisateur externe disposant d'un accès limité. Traduction interface : Consultant externe.

---

## 6. Termes à ne pas confondre

**Tender et Tender Workspace** — `Tender` = opportunité publiée par l'acheteur ; `Tender Workspace` = espace interne créé par une organisation pour traiter cette opportunité.

**Buyer et Organization** — `Buyer` = organisme qui publie le marché ; `Organization` = entreprise cliente utilisant TenderOS.

**Proposal et Submission** — `Proposal` = contenu rédigé pour répondre ; `Submission` = dépôt officiel de la réponse.

**Requirement et Task** — `Requirement` = obligation identifiée dans le DCE ; `Task` = action interne créée pour traiter une obligation ou produire un livrable.

**Review et Approval** — `Review` = examen et commentaires ; `Approval` = décision formelle d'autorisation.

**Notification et Alert** — `Notification` = information envoyée à l'utilisateur ; `Alert` = information nécessitant une attention particulière.

**Activity et Audit Log** — `Activity` = historique collaboratif visible ; `Audit Log` = journal de sécurité et de conformité.

**Match Score et Go/No-Go Decision** — `Match Score` = recommandation calculée ; `Go/No-Go Decision` = décision humaine officielle.

---

## 7. Conventions de nommage technique

**Entités** — Singulier en PascalCase : `Organization`, `Tender`, `TenderWorkspace`, `Proposal`, `Submission`

**Tables** — Pluriel en snake_case : `organizations`, `tenders`, `tender_workspaces`, `proposals`, `submissions`

**Identifiants** — `organization_id`, `tender_id`, `workspace_id`, `proposal_id`

**Événements** — Passé : `TenderImported`, `WorkspaceCreated`, `ProposalApproved`, `SubmissionRecorded`

**Commandes** — Verbe à l'impératif : `ImportTender`, `CreateWorkspace`, `ApproveProposal`, `RecordSubmission`

**Requêtes** — Formulation descriptive : `GetTender`, `ListTenderWorkspaces`, `SearchCompanyDocuments`

**États** — Majuscules en snake_case : `IN_PROGRESS`, `READY_FOR_SUBMISSION`, `CHANGES_REQUESTED`

---

## 8. Glossaire d'interface recommandé

| Terme métier | Libellé français recommandé |
|---|---|
| Tender | Appel d'offres |
| Buyer | Acheteur |
| Tender Workspace | Espace de réponse |
| Tender Match | Compatibilité |
| Qualification | Qualification |
| Go/No-Go Decision | Décision Go / No-Go |
| Company Brain | Mémoire d'entreprise |
| Proposal | Réponse |
| Proposal Section | Section de réponse |
| Review | Relecture |
| Approval | Validation |
| Compliance Checklist | Checklist de conformité |
| Submission Package | Dossier de dépôt |
| Submission | Soumission |
| Outcome | Résultat |
| Award | Attribution |
| AI Copilot | Copilote IA |

---

## 9. Termes interdits dans le domaine

Les termes suivants ne doivent pas apparaître sans définition contextuelle :

Item, Object, Record, Entity, Content, Data, Project, File, Result, Score, Status, Client, Account.

Ils sont trop génériques et doivent être remplacés par un terme métier précis.

Exemples :

- Incorrect : `project status` → Correct : `workspace status`
- Incorrect : `AI result` → Correct : `qualification analysis`
- Incorrect : `client document` → Correct : `company document`

---

## 10. Gouvernance du vocabulaire

Toute création ou modification d'un terme métier doit :

- être proposée dans ce document ;
- inclure une définition ;
- préciser les concepts proches ;
- identifier les impacts API, base de données et interface ;
- être validée par Product et Engineering.

Aucun Skill ne doit introduire silencieusement un nouveau terme métier.
