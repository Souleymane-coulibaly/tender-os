# TenderOS — Business Rules

Version : 1.0
Statut : Draft
Propriétaire : Product & Engineering

Ce document fixe les règles fonctionnelles que Claude devra respecter dans tous les Skills. Il sert de contrat métier entre le produit, le design et le code.

---

## 1. Objectif

Ce document définit les règles métier communes de TenderOS.

Toute fonctionnalité, API, automatisation ou décision IA doit respecter ces règles.

En cas de conflit entre une implémentation et ce document, le présent document prévaut jusqu'à mise à jour officielle.

---

## 2. Principes généraux

### BR-GEN-001 — Isolation des organisations

Toutes les données appartiennent à une `Organization`.

Un utilisateur ne peut jamais accéder aux données d'une autre organisation, sauf mécanisme explicite et audité de partage inter-organisation.

### BR-GEN-002 — Traçabilité

Toute action sensible doit être journalisée :

- création ;
- modification ;
- suppression ;
- export ;
- changement de statut ;
- validation ;
- action IA importante ;
- changement de permissions.

### BR-GEN-003 — Suppression logique

Les données métier importantes ne sont pas supprimées immédiatement.

Elles sont archivées ou marquées comme supprimées, avec possibilité de restauration selon la politique de rétention.

### BR-GEN-004 — Source de vérité

Pour chaque donnée critique, TenderOS doit conserver :

- sa source ;
- sa date d'import ;
- sa date de dernière mise à jour ;
- son niveau de confiance ;
- son historique de modification.

---

## 3. Organization

### BR-ORG-001 — Organisation racine

Une organisation représente une entreprise cliente de TenderOS.

Elle possède :

- ses utilisateurs ;
- ses rôles ;
- ses documents ;
- ses références ;
- ses certifications ;
- ses appels d'offres suivis ;
- ses espaces de travail ;
- son abonnement ;
- ses paramètres IA.

### BR-ORG-002 — Administrateur obligatoire

Chaque organisation doit avoir au moins un utilisateur avec le rôle `Organization Admin`.

Le dernier administrateur ne peut pas être supprimé ou rétrogradé sans transfert préalable.

### BR-ORG-003 — Profil entreprise

Le profil entreprise peut contenir :

- activités ;
- codes CPV ciblés ;
- zones géographiques ;
- chiffre d'affaires ;
- effectif ;
- certifications ;
- références ;
- capacités techniques ;
- secteurs exclus ;
- seuils de budget.

Ces informations alimentent le matching et la qualification IA.

---

## 4. Utilisateurs, rôles et permissions

### Rôles initiaux

- `Organization Admin`
- `Bid Manager`
- `Contributor`
- `Reviewer`
- `Executive`
- `External Consultant`
- `Read Only`

### BR-USER-001 — Principe du moindre privilège

Chaque utilisateur reçoit uniquement les permissions nécessaires à son activité.

### BR-USER-002 — Invitation

Un utilisateur rejoint une organisation uniquement après acceptation d'une invitation valide.

### BR-USER-003 — Accès externe

Un consultant externe peut recevoir un accès limité :

- à certains Workspaces ;
- pour une durée déterminée ;
- sans accès global au Company Brain, sauf autorisation explicite.

### BR-USER-004 — Actions sensibles

Les actions suivantes nécessitent une permission dédiée :

- supprimer ou archiver un Workspace ;
- exporter des données sensibles ;
- modifier les rôles ;
- valider définitivement une proposition ;
- préparer une soumission finale ;
- modifier la configuration IA.

---

## 5. Tender

### BR-TENDER-001 — Identité d'un appel d'offres

Un `Tender` représente une opportunité publiée par un acheteur.

Il doit conserver :

- identifiant interne ;
- identifiant source ;
- source ;
- titre ;
- acheteur ;
- date de publication ;
- date limite ;
- codes CPV ;
- zone géographique ;
- lots ;
- URL source ;
- statut de publication.

### BR-TENDER-002 — Unicité par source

Deux appels d'offres provenant de la même source ne peuvent pas partager le même identifiant source.

### BR-TENDER-003 — Déduplication multi-sources

Les annonces provenant de plusieurs sources peuvent être regroupées lorsqu'elles représentent le même marché.

La fusion doit conserver toutes les références d'origine.

### BR-TENDER-004 — Données originales

Les données originales importées doivent être conservées sans modification.

Les données normalisées sont stockées séparément.

### BR-TENDER-005 — Mise à jour

Une annonce déjà importée doit être mise à jour de manière idempotente.

L'import ne doit pas créer de doublon lors d'une nouvelle synchronisation.

### BR-TENDER-006 — Date limite

Toute modification de la date limite doit déclencher :

- une mise à jour du Workspace lié ;
- une réévaluation des alertes ;
- une notification aux membres concernés ;
- une entrée dans l'Audit Log.

---

## 6. Lots

### BR-LOT-001 — Gestion indépendante

Un marché peut contenir un ou plusieurs lots.

Chaque lot peut posséder :

- son propre budget ;
- ses propres critères ;
- ses propres documents ;
- sa propre décision Go/No-Go ;
- sa propre proposition.

### BR-LOT-002 — Candidature partielle

L'organisation peut décider de répondre à certains lots seulement.

---

## 7. Cycle de vie d'un Tender

### Statuts possibles

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

### Transitions autorisées

```text
DISCOVERED → SHORTLISTED
DISCOVERED → NO_GO
DISCOVERED → WATCHING

SHORTLISTED → QUALIFYING
SHORTLISTED → NO_GO

QUALIFYING → GO
QUALIFYING → NO_GO
QUALIFYING → WATCHING

GO → AWARDED
GO → EXPIRED
GO → CANCELLED

WATCHING → SHORTLISTED
WATCHING → EXPIRED

Toute transition terminale → ARCHIVED
```

### BR-TENDER-STATUS-001

Chaque changement de statut doit enregistrer :

- l'ancien statut ;
- le nouveau statut ;
- l'auteur ;
- la date ;
- la justification éventuelle.

---

## 8. Workspace

### BR-WS-001 — Création

Un Workspace est créé lorsqu'une organisation décide d'étudier ou de traiter un appel d'offres.

### BR-WS-002 — Unicité

Une organisation ne peut avoir qu'un seul Workspace actif par Tender et par lot, sauf duplication explicitement autorisée pour simulation.

### BR-WS-003 — Responsable

Chaque Workspace doit avoir un Bid Manager responsable.

### BR-WS-004 — Statuts

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

### BR-WS-005 — Passage en préparation

Un Workspace ne peut passer à `PREPARATION` que si une décision `GO` a été enregistrée.

### BR-WS-006 — Passage en revue

Un Workspace ne peut passer à `REVIEW` que si :

- les sections obligatoires existent ;
- les tâches bloquantes sont terminées ou dérogées ;
- les pièces critiques sont présentes ou signalées.

### BR-WS-007 — Prêt à soumettre

Le statut `READY_FOR_SUBMISSION` nécessite :

- proposition validée ;
- checklist de conformité complète ;
- absence d'erreur bloquante ;
- approbation par un utilisateur autorisé.

---

## 9. DCE et documents de consultation

### BR-DCE-001 — Versionnement

Chaque import ou modification du DCE crée une version.

### BR-DCE-002 — Classification

Les documents doivent pouvoir être classés comme :

- RC ;
- CCTP ;
- CCAP ;
- AE ;
- BPU ;
- DQE ;
- DPGF ;
- cadre de mémoire technique ;
- annexe ;
- question-réponse ;
- rectificatif ;
- autre.

### BR-DCE-003 — Rectificatif

Un rectificatif doit déclencher :

- une nouvelle analyse ;
- une comparaison avec la version précédente ;
- une notification ;
- l'invalidation éventuelle de résultats IA devenus obsolètes.

### BR-DCE-004 — Intégrité

Le système doit conserver l'empreinte du fichier original pour détecter les modifications et doublons.

---

## 10. Documents de l'entreprise

### BR-DOC-001 — Propriété

Chaque document appartient à une organisation.

### BR-DOC-002 — Métadonnées

Un document peut inclure :

- type ;
- version ;
- date d'émission ;
- date d'expiration ;
- propriétaire ;
- niveau de confidentialité ;
- tags ;
- entités associées.

### BR-DOC-003 — Expiration

Les documents ayant une date d'expiration doivent générer des alertes configurables.

### BR-DOC-004 — Réutilisation contrôlée

L'IA ne peut utiliser un document dans une proposition que si :

- l'utilisateur y a accès ;
- le document est autorisé pour cet usage ;
- sa version est valide ;
- son origine est traçable.

### BR-DOC-005 — Version active

Une seule version d'un document peut être désignée comme version active, sans supprimer les anciennes versions.

---

## 11. Company Brain

### BR-BRAIN-001 — Contenu

Le Company Brain regroupe notamment :

- documents ;
- références clients ;
- certifications ;
- CV ;
- méthodologies ;
- réponses antérieures ;
- arguments commerciaux ;
- éléments de preuve ;
- retours gagnés/perdus.

### BR-BRAIN-002 — Cloisonnement

Le Company Brain est strictement isolé par organisation.

### BR-BRAIN-003 — Preuves

Chaque contenu généré à partir du Company Brain doit pouvoir citer les sources internes utilisées.

### BR-BRAIN-004 — Obsolescence

Les contenus expirés, archivés ou non validés ne doivent pas être utilisés comme sources fiables sans avertissement explicite.

---

## 12. Analyse IA

### BR-AI-001 — Non-substitution

L'IA assiste la décision humaine. Elle ne prend pas seule une décision contractuelle ou juridique définitive.

### BR-AI-002 — Explicabilité

Toute analyse importante doit contenir :

- résultat ;
- justification ;
- sources ;
- niveau de confiance ;
- limites identifiées.

### BR-AI-003 — Citations

Les affirmations issues du DCE doivent citer :

- le document ;
- la version ;
- la page ou section, lorsque disponible.

### BR-AI-004 — Incertitude

Lorsque l'information est absente ou ambiguë, l'IA doit l'indiquer clairement et ne pas l'inventer.

### BR-AI-005 — Validation humaine

Les contenus générés sont considérés comme des brouillons jusqu'à validation humaine.

### BR-AI-006 — Reproductibilité

Chaque exécution significative doit conserver :

- modèle utilisé ;
- version du prompt ;
- paramètres ;
- sources ;
- date ;
- résultat ;
- évaluations éventuelles.

---

## 13. Qualification Go / No-Go

### Critères possibles

- adéquation métier ;
- références disponibles ;
- certifications ;
- capacité géographique ;
- budget ;
- charge estimée ;
- délai ;
- risque contractuel ;
- concurrence ;
- rentabilité ;
- disponibilité des équipes.

### BR-GNG-001 — Score explicable

Le score doit être décomposé par critère.

### BR-GNG-002 — Décision humaine

La décision finale `GO`, `NO_GO` ou `WATCHING` appartient à un utilisateur autorisé.

### BR-GNG-003 — Justification

Toute décision doit comporter une justification, obligatoire pour `NO_GO`.

### BR-GNG-004 — Dérogation

Un utilisateur autorisé peut choisir `GO` malgré un score faible, à condition de documenter la dérogation.

---

## 14. Proposal

### BR-PROP-001 — Brouillon initial

Toute génération IA crée une version brouillon.

### BR-PROP-002 — Versionnement

Chaque modification importante crée une version identifiable.

### BR-PROP-003 — Sections

Une proposition peut être structurée par :

- critères de notation ;
- exigences du cadre de réponse ;
- plan personnalisé ;
- lots ;
- livrables.

### BR-PROP-004 — Statuts

```text
DRAFT
IN_PROGRESS
IN_REVIEW
CHANGES_REQUESTED
APPROVED
LOCKED
ARCHIVED
```

### BR-PROP-005 — Approbation

Une proposition ne peut passer à `APPROVED` que si :

- toutes les sections obligatoires sont présentes ;
- les commentaires bloquants sont résolus ;
- un Reviewer autorisé l'approuve.

### BR-PROP-006 — Verrouillage

Une proposition approuvée peut être verrouillée avant soumission.

Toute modification ultérieure doit créer une nouvelle version et invalider l'approbation précédente.

---

## 15. Tâches et collaboration

### BR-TASK-001 — Propriétaire

Une tâche doit avoir au maximum un responsable principal, mais peut avoir plusieurs contributeurs.

### BR-TASK-002 — Statuts

```text
TODO
IN_PROGRESS
BLOCKED
IN_REVIEW
DONE
CANCELLED
```

### BR-TASK-003 — Blocage

Une tâche bloquée doit indiquer :

- la cause ;
- la personne ou ressource attendue ;
- l'impact ;
- la prochaine action.

### BR-TASK-004 — Échéances

Une tâche critique dont l'échéance dépasse la date limite du Tender doit générer une alerte.

### BR-TASK-005 — Automatisation IA

L'IA peut proposer ou créer des tâches selon les permissions, mais l'attribution automatique doit rester modifiable.

---

## 16. Compliance Checklist

### BR-COMP-001 — Origine des exigences

Chaque élément de checklist doit être relié à une exigence identifiable du DCE ou à une règle interne.

### BR-COMP-002 — États

```text
NOT_STARTED
IN_PROGRESS
COMPLIANT
NON_COMPLIANT
NOT_APPLICABLE
WAIVED
```

### BR-COMP-003 — Dérogations

Une exigence bloquante ne peut être marquée `WAIVED` que par un utilisateur autorisé, avec justification.

### BR-COMP-004 — Contrôle final

Le système doit distinguer :

- erreurs bloquantes ;
- avertissements ;
- recommandations.

Seules les erreurs bloquantes empêchent le passage à `READY_FOR_SUBMISSION`.

---

## 17. Submission

### BR-SUB-001 — Assistance, pas dépôt autonome

Dans le MVP, TenderOS prépare le dossier mais ne dépose pas automatiquement sur les profils acheteurs, sauf intégration officiellement autorisée.

### BR-SUB-002 — Package final

Le package doit contenir :

- les fichiers sélectionnés ;
- leurs versions ;
- un manifeste ;
- la checklist finale ;
- la date de génération ;
- l'auteur.

### BR-SUB-003 — Soumission déclarée

Le statut `SUBMITTED` doit enregistrer :

- date et heure ;
- plateforme ;
- référence ou preuve de dépôt ;
- utilisateur déclarant la soumission.

### BR-SUB-004 — Immutabilité

La preuve de dépôt ne peut pas être modifiée sans création d'une nouvelle entrée d'audit.

---

## 18. Notifications

### Événements prioritaires

- nouvel appel d'offres correspondant ;
- modification de date limite ;
- rectificatif ;
- document expirant ;
- tâche en retard ;
- validation requise ;
- erreur de conformité ;
- changement de statut ;
- analyse IA terminée.

### BR-NOTIF-001 — Préférences

L'utilisateur peut configurer ses canaux et fréquences, sauf alertes critiques imposées par l'organisation.

### BR-NOTIF-002 — Anti-spam

Les notifications similaires doivent être regroupées lorsque cela est pertinent.

---

## 19. Résultats gagnés et perdus

### BR-OUTCOME-001 — Résultat

Un Workspace soumis peut être marqué :

```text
WON
LOST
CANCELLED
UNKNOWN
```

### BR-OUTCOME-002 — Capitalisation

Lorsqu'un résultat est enregistré, le système doit permettre de renseigner :

- montant attribué ;
- titulaire ;
- score obtenu ;
- motifs ;
- points forts ;
- points faibles ;
- enseignements.

### BR-OUTCOME-003 — Apprentissage

Les enseignements validés peuvent enrichir le Company Brain.

Ils ne doivent pas modifier automatiquement les règles de décision sans validation.

---

## 20. Données, confidentialité et rétention

### BR-DATA-001 — Export

Une organisation doit pouvoir exporter ses données selon ses permissions et son contrat.

### BR-DATA-002 — Confidentialité

Les documents peuvent être classés :

- Internal ;
- Confidential ;
- Restricted.

### BR-DATA-003 — Données IA

Les données client ne doivent pas être utilisées pour entraîner un modèle tiers sans accord contractuel explicite.

### BR-DATA-004 — Rétention

La durée de conservation doit être configurable selon le type de données et les exigences contractuelles.

---

## 21. Règles temporelles

### BR-TIME-001 — Fuseau horaire

Les dates sont stockées en UTC et affichées selon le fuseau de l'utilisateur ou de l'organisation.

### BR-TIME-002 — Date limite officielle

La date limite affichée doit préciser le fuseau horaire officiel lorsqu'il est connu.

### BR-TIME-003 — Compte à rebours

Le compte à rebours doit se baser sur la dernière date limite officielle connue.

---

## 22. Règles financières

### BR-FIN-001 — Devise

Le montant doit toujours conserver sa devise d'origine.

### BR-FIN-002 — Montant inconnu

Le système doit distinguer :

- montant non publié ;
- montant estimé ;
- montant minimum ;
- montant maximum ;
- montant attribué.

### BR-FIN-003 — Lots

Les montants par lot ne doivent pas être additionnés sans vérifier leur nature contractuelle.

---

## 23. Critères de qualité obligatoires

Chaque Skill doit :

- respecter le multi-tenant ;
- appliquer les permissions ;
- produire des logs structurés ;
- gérer les erreurs ;
- être idempotent lorsque nécessaire ;
- avoir des tests unitaires ;
- avoir des tests d'intégration ;
- documenter ses événements ;
- documenter ses données ;
- respecter les règles IA applicables ;
- maintenir une piste d'audit.

---

## 24. Gestion des exceptions

Toute exception à une règle doit être :

- explicite ;
- justifiée ;
- autorisée ;
- limitée dans le temps si nécessaire ;
- auditée.

Aucune exception métier ne doit être cachée directement dans le code sans documentation.

---

## 25. Convention d'identification

Les règles utilisent des identifiants stables :

```text
BR-<DOMAINE>-<NUMÉRO>
```

Exemples :

- BR-TENDER-006
- BR-AI-003
- BR-PROP-005

Ces identifiants doivent être référencés dans :

- les PRD ;
- les Skills ;
- les tests ;
- les décisions d'architecture ;
- les tickets de développement.
