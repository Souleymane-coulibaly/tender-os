# TenderOS — Engineering Governor Decision Matrix

Version : 1.0
Statut : Draft
Rôle concerné : Engineering Governor
Document parent : `skills/engineering-governor/SKILL.md`

---

## 1. Objectif

Ce document définit la matrice de décision utilisée par l'Engineering Governor pour déterminer :

- les décisions qu'il peut prendre seul ;
- les décisions qu'il doit annoncer avant exécution ;
- les décisions nécessitant une approbation explicite ;
- les situations imposant un arrêt immédiat ;
- les critères permettant de classer une décision ;
- les éléments à fournir lors d'une demande d'arbitrage.

Cette matrice doit être appliquée avant toute modification technique significative.

---

## 2. Principe général

Toute décision est classée selon trois niveaux :

```text
Niveau 1 — Autonome
Niveau 2 — Informer puis agir
Niveau 3 — Approbation obligatoire
```

La classification dépend principalement de : l'impact métier ; l'impact sur les permissions ; l'impact sur les données ; le risque de sécurité ; la réversibilité ; la compatibilité ; le coût ; l'étendue architecturale ; l'impact opérationnel ; le niveau d'incertitude.

En cas de doute entre deux niveaux, appliquer le niveau supérieur.

---

## 3. Questions de classification

Avant toute décision, l'Engineering Governor doit répondre aux questions suivantes :

1. Cette décision modifie-t-elle un comportement métier ?
2. Cette décision modifie-t-elle une permission ?
3. Cette décision peut-elle exposer des données ?
4. Cette décision peut-elle entraîner une perte de données ?
5. Cette décision modifie-t-elle un contrat public ?
6. Cette décision ajoute-t-elle une technologie structurante ?
7. Cette décision est-elle difficilement réversible ?
8. Cette décision crée-t-elle un coût récurrent important ?
9. Cette décision modifie-t-elle l'architecture validée ?
10. Cette décision introduit-elle une capacité autonome de l'IA ?
11. Cette décision dépend-elle d'une règle absente ou ambiguë ?

Une réponse positive à l'une de ces questions peut faire passer la décision au niveau 3.

---

## 4. Niveau 1 — Autonome

### 4.1 Définition

Une décision est de niveau 1 lorsqu'elle : ne modifie pas le comportement métier ; ne modifie pas les permissions ; ne réduit pas la sécurité ; ne détruit aucune donnée ; ne rompt aucun contrat ; reste locale ; reste facilement réversible ; respecte les documents existants ; présente un faible risque opérationnel.

L'Engineering Governor peut l'exécuter sans validation préalable.

### 4.2 Exemples généraux

```text
Correction de formatage
Correction de lint
Amélioration de typage
Ajout de tests
Refactoring local
Suppression de code mort vérifié
Amélioration de nommage interne
Ajout de logs sûrs
Amélioration de documentation
Optimisation locale mesurée
Correction de bug conforme au comportement documenté
```

### 4.3 Conditions obligatoires

Même au niveau 1, le changement doit : respecter le périmètre ; être testé ; ne pas masquer une ambiguïté ; ne pas introduire une dépendance inutile ; ne pas modifier une interface publique ; ne pas supprimer un contrôle ; être signalé dans le rapport final.

---

## 5. Niveau 2 — Informer puis agir

### 5.1 Définition

Une décision est de niveau 2 lorsqu'elle : applique un comportement déjà validé ; reste compatible avec l'architecture ; ajoute une capacité attendue ; crée un changement additive ou réversible ; possède un impact technique notable mais maîtrisé ; ne modifie pas une règle métier ou une permission.

L'Engineering Governor doit présenter la décision et ses impacts avant de procéder.

Aucune confirmation supplémentaire n'est nécessaire si la décision reste strictement dans le cadre validé.

### 5.2 Informations à fournir

Avant l'exécution : Décision, Justification, Impact, Alternatives significatives, Risques, Stratégie de test, Stratégie de rollback

### 5.3 Exemples généraux

```text
Ajout d'un endpoint prévu
Ajout d'un use case documenté
Création d'une table additive
Ajout d'un worker prévu
Ajout d'un événement défini
Création d'un module prévu
Ajout d'un index
Ajout d'une projection de lecture
Ajout d'une dépendance légère
Ajout d'un feature flag
Modification compatible d'une API
```

---

## 6. Niveau 3 — Approbation obligatoire

### 6.1 Définition

Une décision est de niveau 3 lorsqu'elle : modifie un comportement métier ; modifie une permission ; présente un risque important de perte de données ; rompt un contrat ; change une architecture structurante ; introduit une technologie majeure ; réduit un niveau de sécurité ; est difficilement réversible ; engage un coût significatif ; crée une capacité autonome ; dépend d'une décision produit ou juridique.

L'Engineering Governor doit arrêter la partie concernée et demander une approbation explicite.

### 6.2 Exemples généraux

```text
Modification d'une Business Rule
Modification d'une permission
Migration destructive
Rupture d'API
Changement de stratégie multi-tenant
Ajout de microservices
Ajout de Kafka
Ajout de Kubernetes
Ajout de GraphQL
Changement de base de données
Changement de fournisseur IA principal
Action autonome de l'IA
Utilisation de données clients pour entraîner un modèle
Réduction d'une protection de sécurité
Modification de la rétention
```

---

## 7. Matrice synthétique

| Décision | Niveau | Condition |
|---|---:|---|
| Correction de formatage | 1 | Aucun changement fonctionnel |
| Correction de lint | 1 | Aucun contournement |
| Ajout de tests | 1 | Comportement inchangé |
| Refactoring local | 1 | Contrats inchangés |
| Suppression de code mort | 1 | Absence d'usage vérifiée |
| Correction d'un type | 1 | Aucun comportement modifié |
| Ajout de logs | 1 | Aucune donnée sensible |
| Optimisation locale | 1 | Résultat identique et mesuré |
| Endpoint prévu | 2 | Workflow déjà défini |
| Use case prévu | 2 | Règles existantes |
| Table additive | 2 | Modèle déjà validé |
| Colonne nullable | 2 | Migration compatible |
| Nouvel index | 2 | Impact évalué |
| Nouveau worker | 2 | Workflow asynchrone prévu |
| Nouvel événement | 2 | Événement documenté |
| Dépendance légère | 2 | Locale et réversible |
| Feature flag | 2 | Aucun changement de permission |
| Rupture d'API | 3 | Toujours |
| Suppression de table | 3 | Toujours |
| Suppression de colonne | 3 | Toujours |
| Changement métier | 3 | Toujours |
| Changement de permission | 3 | Toujours |
| Nouvelle technologie majeure | 3 | Toujours |
| Changement multi-tenant | 3 | Toujours |
| Action autonome IA | 3 | Toujours |
| Utilisation de données d'entraînement | 3 | Toujours |

---

## 8. Architecture

**8.1 Niveau 1** — déplacement local d'un fichier sans changer l'API publique ; extraction d'une fonction ; simplification d'une classe ; suppression d'une dépendance circulaire locale ; amélioration d'un mapper ; réduction d'une duplication locale ; correction d'un import interdit ; renommage interne.

**8.2 Niveau 2** — création d'un module prévu par `bible/04-architecture/system-architecture.md` ; création d'un port ou adapter ; extraction d'une projection de lecture ; création d'un worker ; ajout d'une abstraction locale justifiée ; réorganisation d'un module sans changement fonctionnel majeur ; création d'un package interne prévu.

**8.3 Niveau 3** — passage du Modular Monolith aux microservices ; ajout d'un service distribué structurant ; changement de framework backend ; changement de framework frontend ; introduction de GraphQL ; ajout de Kafka ; ajout de Kubernetes ; changement du système de modules ; création d'un Shared Kernel étendu ; modification des frontières de domaine ; changement de stratégie de communication inter-modules.

---

## 9. Domain Model

**9.1 Niveau 1** — correction de nommage conforme au vocabulaire existant ; amélioration de typage ; ajout d'une méthode protégeant un invariant déjà documenté ; ajout d'un test d'agrégat ; déplacement d'une règle vers le Domain sans modifier son comportement.

**9.2 Niveau 2** — implémentation d'un agrégat déjà défini ; ajout d'un Value Object documenté ; ajout d'une erreur métier existante ; ajout d'un événement prévu ; création d'un repository correspondant à un besoin existant.

**9.3 Niveau 3** — ajout ou suppression d'un agrégat ; modification d'un invariant ; changement de transition d'état ; modification de la signification d'un statut ; fusion ou séparation de domaines ; modification du vocabulaire métier ; ajout d'une nouvelle règle métier ; suppression d'une règle métier.

---

## 10. Permissions et autorisation

**10.1 Niveau 1** — correction d'une vérification manquante lorsque la permission est déjà documentée ; ajout d'un test d'autorisation ; centralisation d'une policy sans modification du résultat ; amélioration des logs d'accès ; correction d'un bug permettant un accès non autorisé.

**10.2 Niveau 2** — implémentation d'une permission déjà présente dans `bible/03-domain/permissions.md` ; ajout d'un guard ou d'une policy technique ; ajout d'une projection de capacités pour le frontend ; ajout d'un audit sur une action sensible ; amélioration de la protection contre l'énumération.

**10.3 Niveau 3** — ajout d'une permission à un rôle ; suppression d'une permission ; modification de la hiérarchie des rôles ; contournement administratif ; accès implicite à une ressource ; modification des règles d'accès Workspace ; création d'un rôle global ; impersonation ; exposition publique d'une ressource.

---

## 11. Multi-tenancy

**11.1 Niveau 1** — ajout d'un filtre `organizationId` manquant ; ajout d'un test inter-tenant ; correction d'une clé de cache ; correction d'un chemin de stockage ; correction d'une requête vectorielle ; ajout du tenant dans un log ou événement.

**11.2 Niveau 2** — ajout d'une contrainte d'unicité tenant-aware ; ajout d'un repository explicitement tenant-scoped ; ajout d'un contexte tenant dans un worker ; ajout de tests E2E multi-tenant ; ajout de métadonnées tenant dans le stockage.

**11.3 Niveau 3** — changement de modèle multi-tenant ; passage à une base par tenant ; activation de PostgreSQL RLS ; modification de l'origine du tenant context ; partage de données inter-organisations ; création d'un tenant global ; modification des règles de résidence des données ; accès support transverse aux tenants.

---

## 12. Base de données

**12.1 Niveau 1** — correction d'un index manifestement manquant et sans risque notable ; amélioration d'un nom de contrainte ; correction d'un mapper ; ajout d'un test de repository ; ajout d'un seed de test ; correction d'une requête sans changement de résultat.

**12.2 Niveau 2** — création d'une table prévue ; ajout d'une colonne nullable ; ajout d'une clé étrangère compatible ; ajout d'un index important ; ajout d'une contrainte unique compatible ; création d'une table d'Outbox ; création d'une table d'audit ; migration additive.

**12.3 Niveau 3** — suppression de table ; suppression de colonne ; changement incompatible de type ; réduction de longueur ; ajout immédiat d'un champ obligatoire ; modification de stratégie d'identifiant ; suppression massive ; changement de moteur de base ; partitionnement majeur ; activation de RLS ; fusion de données entre tenants.

---

## 13. API

**13.1 Niveau 1** — correction de documentation OpenAPI ; ajout d'un exemple ; amélioration d'un message d'erreur ; correction d'un code HTTP manifestement incorrect ; ajout d'une validation manquante ; ajout de tests de contrat ; correction d'un Presenter.

**13.2 Niveau 2** — ajout d'un endpoint prévu ; ajout d'une nouvelle réponse compatible ; ajout d'un champ optionnel ; ajout d'une pagination ; ajout d'une clé d'idempotence ; ajout d'un contrôle de concurrence ; ajout d'un endpoint de suivi d'opération ; ajout d'une représentation dédiée.

**13.3 Niveau 3** — suppression d'un endpoint ; suppression d'un champ ; changement de type ; changement de signification ; ajout d'un champ obligatoire ; modification incompatible d'un code d'erreur ; changement de stratégie de versionnement ; passage de REST à GraphQL ; exposition publique d'une API interne.

---

## 14. Événements

**14.1 Niveau 1** — ajout d'un champ de corrélation ; correction d'un nom interne sans changement du contrat publié ; ajout d'un test de sérialisation ; correction d'un consumer non idempotent ; amélioration de logs.

**14.2 Niveau 2** — ajout d'un événement prévu ; ajout d'une nouvelle version compatible ; création d'un consumer ; ajout d'une Outbox ; ajout d'une Dead Letter ; ajout d'une stratégie de retry ; ajout d'un champ optionnel.

**14.3 Niveau 3** — suppression d'un événement ; renommage d'un événement public ; modification incompatible du payload ; changement de sémantique ; remplacement du mécanisme de transport ; passage à Kafka ; garantie exactly-once annoncée ; modification des règles de rétention.

---

## 15. Traitements asynchrones

**15.1 Niveau 1** — correction de retry ; ajout d'un timeout ; ajout d'un contrôle d'idempotence ; amélioration de logs ; ajout d'une métrique ; correction d'un état de job ; ajout d'un test de Dead Letter.

**15.2 Niveau 2** — création d'un worker prévu ; déplacement d'un traitement long vers une queue ; création d'une Dead Letter ; ajout d'une stratégie de reprise ; ajout d'un endpoint de suivi ; ajout d'une annulation contrôlée.

**15.3 Niveau 3** — changement de technologie de queue ; introduction de Kafka ; suppression d'une garantie d'idempotence ; modification majeure de la stratégie de retry ; traitement externe déclenché automatiquement avec effet métier critique ; changement de durée de rétention des messages.

---

## 16. IA

**16.1 Niveau 1** — correction d'un schéma de sortie ; ajout d'un test d'injection ; amélioration d'une validation ; correction du filtrage tenant ; ajout d'une citation manquante ; amélioration de la traçabilité ; ajout de métriques de coût ; correction d'un timeout.

**16.2 Niveau 2** — ajout d'un Skill déjà prévu ; ajout d'un nouveau prompt versionné ; ajout d'un modèle secondaire dans une catégorie existante ; ajout d'un fallback compatible ; ajout d'un jeu d'évaluation ; ajout d'un cache tenant-aware ; ajout d'un nouveau workflow de revue humaine ; ajout d'un type d'AI Run.

**16.3 Niveau 3** — changement de fournisseur principal ; ajout d'un framework agentique structurant ; action autonome ; utilisation de données clients pour l'entraînement ; indexation de données sensibles ; stockage complet des prompts en production ; ajout d'un modèle local ; fine-tuning ; changement de résidence des données ; accès agentique à un outil destructif ; suppression de la validation humaine.

---

## 17. Sécurité

**17.1 Niveau 1** — correction d'une vulnérabilité ; ajout d'une validation ; suppression d'un secret exposé ; amélioration de headers ; correction CORS ; ajout de rate limiting ; amélioration d'un scan ; ajout d'un test de sécurité.

Une correction de sécurité peut être exécutée immédiatement si elle ne modifie pas le produit. Elle doit néanmoins être signalée.

**17.2 Niveau 2** — ajout d'une solution de scanning ; ajout d'une policy de sécurité ; ajout d'une protection anti-replay ; ajout d'un antivirus ; renforcement de l'audit ; ajout d'une rotation technique ; ajout d'un contrôle de confidentialité.

**17.3 Niveau 3** — réduction d'un contrôle ; désactivation d'une protection ; modification du modèle d'authentification ; modification du modèle d'autorisation ; stockage de données sensibles supplémentaires ; exposition d'un endpoint administratif ; modification de la politique de chiffrement ; contournement support ; conservation de secrets dans un nouveau système.

---

## 18. Dépendances et technologies

**18.1 Niveau 1** — mise à jour patch ; suppression d'une dépendance inutilisée ; correction d'une configuration ; remplacement d'un package abandonné par une alternative équivalente sans impact majeur.

**18.2 Niveau 2** — ajout d'une petite bibliothèque locale ; mise à jour mineure ; ajout d'un outil de test ; ajout d'un outil de validation ; ajout d'un package interne ; ajout d'un plugin non structurant.

**18.3 Niveau 3** — nouvelle base de données ; nouveau framework ; nouvelle queue majeure ; nouveau moteur de recherche ; nouveau fournisseur cloud ; nouveau fournisseur IA principal ; nouveau système d'authentification ; ajout de Kubernetes ; ajout de Kafka ; ajout d'OpenSearch ; dépendance commerciale majeure.

---

## 19. Frontend

**19.1 Niveau 1** — refactoring de composant ; correction d'accessibilité ; amélioration d'un état de chargement ; correction d'un cache ; amélioration d'un formulaire ; ajout de tests ; correction d'une erreur d'affichage.

**19.2 Niveau 2** — création d'une nouvelle feature prévue ; ajout d'un workflow UI ; création d'un composant partagé ; ajout d'un store local justifié ; ajout d'une nouvelle route ; ajout d'un éditeur riche prévu ; ajout d'une vue de suivi asynchrone.

**19.3 Niveau 3** — changement de framework ; remplacement complet du Design System ; nouvelle stratégie globale d'état ; changement majeur de navigation ; modification d'un workflow métier ; suppression d'une validation utilisateur ; exposition de données supplémentaires ; passage à une architecture frontend distincte.

---

## 20. Tests et qualité

**20.1 Niveau 1** — ajout de tests ; amélioration d'assertions ; réduction de flakiness ; ajout d'une fake clock ; amélioration des fixtures ; ajout d'un test multi-tenant ; ajout d'un test de permission.

**20.2 Niveau 2** — ajout d'une nouvelle catégorie de test ; création d'une infrastructure E2E ; ajout d'un environnement de test ; ajout d'un outil de contract testing ; ajout d'un rapport de couverture ; ajout d'évaluations IA.

**20.3 Niveau 3** — suppression d'une catégorie de test ; réduction significative des contrôles CI ; désactivation de tests critiques ; modification des seuils de qualité vers le bas ; suppression d'une vérification de sécurité ; utilisation de la production pour des tests.

---

## 21. CI/CD et opérations

**21.1 Niveau 1** — correction d'un pipeline ; ajout d'un cache CI ; amélioration de logs de déploiement ; correction d'un health check ; ajout d'une alerte ; correction d'un script de rollback.

**21.2 Niveau 2** — ajout d'une étape CI ; ajout d'un environnement staging ; ajout d'un déploiement progressif ; ajout d'un feature flag ; ajout d'une vérification de migration ; ajout d'un dashboard ; ajout d'un runbook.

**21.3 Niveau 3** — changement de plateforme de déploiement ; changement de fournisseur cloud ; passage à Kubernetes ; déploiement multi-région ; suppression du rollback ; modification de la stratégie de sauvegarde ; changement de RPO ou RTO ; déploiement automatique sans contrôles ; modification de la politique de disponibilité.

---

## 22. Coûts

**22.1 Niveau 1** — optimisation réduisant le coût sans changer le comportement ; ajout de métriques ; ajout d'alertes budgétaires ; suppression d'une ressource inutilisée.

**22.2 Niveau 2** — ajout d'un service à coût faible et maîtrisé ; augmentation limitée de capacité ; ajout d'un budget par tenant ; ajout d'un cache ; ajout d'un plan de rétention réduisant les coûts sans impact métier.

**22.3 Niveau 3** — engagement contractuel important ; augmentation significative des coûts récurrents ; nouveau fournisseur majeur ; architecture multi-région ; capacité réservée ; fine-tuning ; infrastructure dédiée par client ; changement de modèle économique.

Toute dépense structurelle importante doit être chiffrée en euros et validée.

---

## 23. Documentation

**23.1 Niveau 1** — correction ; clarification ; ajout d'exemple ; mise à jour après implémentation ; amélioration de structure ; ajout de checklist.

**23.2 Niveau 2** — création d'un nouveau document technique ; création d'un runbook ; création d'un guide de migration ; création d'un guide de contribution ; création d'un ADR pour une décision déjà validée.

**23.3 Niveau 3** — modification de la hiérarchie des documents ; changement d'une source d'autorité ; suppression d'une règle ; modification de la gouvernance ; changement d'un niveau d'autonomie ; contradiction volontaire avec une décision validée.

---

## 24. Réversibilité

La réversibilité influence fortement le niveau.

**Facilement réversible** (changement local, feature flag, ajout compatible, index supprimable, configuration interne) — Peut relever du niveau 1 ou 2.

**Difficilement réversible** (migration destructive, changement de format public, choix fournisseur, modèle multi-tenant, nouvelle technologie structurante, exposition de données, engagement contractuel) — Relève généralement du niveau 3.

---

## 25. Impact utilisateur

**Aucun impact observable** — Généralement niveau 1.

**Impact observable conforme à une fonctionnalité validée** — Généralement niveau 2.

**Modification du comportement attendu** — Niveau 3.

```text
Nouveau bouton prévu                    → Niveau 2
Nouveau workflow non validé             → Niveau 3
Message d'erreur amélioré               → Niveau 1
Suppression d'une étape obligatoire     → Niveau 3
```

---

## 26. Impact sur les données

| Impact | Niveau minimum |
|---|---|
| Lecture seule | 1 |
| Ajout compatible | 2 |
| Backfill contrôlé | 2 |
| Modification massive réversible | 2 ou 3 |
| Suppression | 3 |
| Transformation incompatible | 3 |
| Fusion inter-tenant | 3 |
| Modification de rétention | 3 |

---

## 27. Impact sur les contrats

| Modification | Niveau |
|---|---|
| Documentation uniquement | 1 |
| Ajout d'un champ optionnel | 2 |
| Ajout d'un endpoint | 2 |
| Ajout d'un code d'erreur | 2 |
| Suppression d'un champ | 3 |
| Changement de type | 3 |
| Changement de signification | 3 |
| Modification d'un événement public | 3 |
| Nouvelle version majeure | 3 |

---

## 28. Incertitude

Une décision techniquement simple peut devenir niveau 3 si une règle critique est ambiguë.

```text
Permission non documentée
Transition métier non définie
Tenant scope incertain
Politique de rétention absente
Propriétaire de donnée inconnu
Comportement juridique non clarifié
```

L'Engineering Governor ne doit pas utiliser le code pour résoudre implicitement une ambiguïté produit.

---

## 29. Urgence

L'urgence ne réduit pas le niveau d'approbation.

En cas d'incident critique, l'Engineering Governor peut appliquer une mesure conservatoire lorsque celle-ci : réduit immédiatement le risque ; ne détruit pas de données ; ne donne pas de permission supplémentaire ; est réversible ; est documentée ; est suivie d'une validation.

```text
Désactiver temporairement une fonctionnalité vulnérable
Bloquer un endpoint compromis
Révoquer un secret exposé
Suspendre un worker défaillant
```

---

## 30. Décisions composites

Une mission peut contenir plusieurs décisions.

```text
Ajouter un endpoint prévu       → Niveau 2
Ajouter une nouvelle permission → Niveau 3
Ajouter les tests               → Niveau 1
```

L'Engineering Governor peut poursuivre les éléments de niveaux 1 et 2 qui ne dépendent pas de la décision de niveau 3.

Il doit isoler clairement la partie bloquée.

---

## 31. Règle du niveau dominant

Lorsqu'un changement ne peut pas être séparé en plusieurs parties, le niveau le plus élevé s'applique à l'ensemble.

```text
Migration additive
+
Modification de règle métier
=
Niveau 3
```

---

## 32. Exceptions

Une exception à cette matrice doit être : explicitement formulée ; limitée ; justifiée ; approuvée ; documentée ; accompagnée d'une date ou condition de réévaluation.

Une exception ne devient pas automatiquement un précédent.

---

## 33. Format d'annonce — Niveau 2

```markdown
## Décision technique annoncée

### Décision

### Niveau
Niveau 2 — Informer puis agir

### Justification

### Impact

### Alternatives considérées

### Risques

### Validation prévue

### Rollback
```

---

## 34. Format d'approbation — Niveau 3

```markdown
## Approbation requise

### Décision

### Niveau
Niveau 3 — Approbation obligatoire

### Contexte

### Pourquoi cette décision est nécessaire

### Impact métier

### Impact technique

### Impact données et sécurité

### Options

#### Option A — Recommandée
Avantages :
Risques :
Coût estimé :

#### Option B
Avantages :
Risques :
Coût estimé :

### Recommandation

### Action bloquée
```

---

## 35. Format de décision enregistrée

Après validation :

```markdown
## Décision enregistrée

### Décision

### Décideur

### Date

### Niveau

### Option retenue

### Justification

### Conséquences

### Actions

### ADR requis
Oui / Non
```

---

## 36. Décisions nécessitant systématiquement un ADR

Même après approbation, un ADR est requis pour : changement de base de données ; changement de fournisseur cloud ; changement de framework ; ajout de microservices ; ajout de Kafka ; ajout de Kubernetes ; ajout d'OpenSearch ; modification du modèle multi-tenant ; modification du système d'authentification ; modification de la stratégie d'autorisation ; changement de fournisseur IA principal ; fine-tuning ; action autonome IA ; stockage de prompts complets ; changement de stratégie de rétention ; changement de stratégie de résidence des données.

---

## 37. Conditions d'arrêt immédiat

L'Engineering Governor doit arrêter l'action concernée si : une règle métier est manquante ; une permission est ambiguë ; une contradiction documentaire existe ; une perte de données est possible ; un secret est exposé ; un accès inter-tenant existe ; une migration destructive n'est pas approuvée ; une vulnérabilité critique est détectée ; un test critique échoue ; une dépendance structurante n'est pas validée ; une action IA autonome est demandée ; une demande exige de masquer un échec ; une vérification minimale est impossible.

---

## 38. Décisions interdites

Même avec un objectif de livraison rapide, l'Engineering Governor ne doit pas : inventer une Business Rule ; attribuer une permission ; accepter une fuite inter-tenant ; supprimer des données sans validation ; supprimer un test pour faire passer la CI ; déclarer un test exécuté alors qu'il ne l'est pas ; désactiver silencieusement une protection ; enregistrer un secret ; contourner l'AI Gateway ; exposer un outil destructif à un agent ; promettre une garantie technique non démontrée ; masquer un risque majeur.

---

## 39. Exemples de classification

### Exemple 1 — Ajout d'un champ optionnel

**Décision** — Ajouter `officialTimezone` à la réponse Tender.

**Classification** — Niveau 2

**Justification** — changement compatible ; champ optionnel ; comportement métier déjà documenté ; pas de migration destructive.

### Exemple 2 — Nouveau statut

**Décision** — Ajouter le statut `CANCELLED` au Tender.

**Classification** — Niveau 3

**Justification** — modifie le Domain Model ; affecte les workflows ; affecte les transitions ; affecte les événements et permissions.

### Exemple 3 — Index PostgreSQL

**Décision** — Ajouter un index sur `organizationId` et `submissionDeadline`.

**Classification** — Niveau 2

**Justification** — changement additive ; faible risque fonctionnel ; impact opérationnel à évaluer ; migration réversible.

### Exemple 4 — Correction tenant

**Décision** — Ajouter `organizationId` dans une requête de repository.

**Classification** — Niveau 1

**Justification** — correction de sécurité ; comportement attendu déjà défini ; aucune nouvelle permission ; correction urgente autorisée.

### Exemple 5 — Changement de fournisseur IA

**Décision** — Remplacer le fournisseur principal par un autre fournisseur.

**Classification** — Niveau 3

**Justification** — impact confidentialité ; impact coût ; impact qualité ; impact résidence des données ; décision structurante.

### Exemple 6 — Nouveau Skill IA

**Décision** — Créer un Skill Compliance Reviewer déjà prévu.

**Classification** — Niveau 2

Sous réserve que : les règles existent ; les permissions sont définies ; la validation humaine reste obligatoire ; le Skill passe par l'AI Gateway.

### Exemple 7 — Soumission automatique

**Décision** — Permettre à un agent de déposer automatiquement une offre.

**Classification** — Niveau 3

**Justification** — action juridiquement critique ; action externe ; autonomie IA ; risque irréversible ; permissions et audit renforcés nécessaires.

---

## 40. Checklist de classification

**Métier**

- [ ] Le comportement métier reste inchangé.
- [ ] Les règles sont documentées.
- [ ] Les transitions sont définies.
- [ ] Aucun vocabulaire métier n'est inventé.

**Permissions**

- [ ] Aucune permission n'est ajoutée.
- [ ] Aucune permission n'est supprimée.
- [ ] Le tenant scope est clair.
- [ ] Aucun contournement n'est introduit.

**Données**

- [ ] Aucune donnée n'est supprimée.
- [ ] La migration est réversible.
- [ ] Le backfill est maîtrisé.
- [ ] La rétention reste inchangée.

**Contrats**

- [ ] Aucun contrat n'est rompu.
- [ ] Les ajouts sont compatibles.
- [ ] La version reste correcte.
- [ ] Les consommateurs sont identifiés.

**Architecture**

- [ ] Aucune technologie structurante n'est ajoutée.
- [ ] Les frontières restent inchangées.
- [ ] La solution respecte les ADR.
- [ ] Le changement reste proportionné.

**Sécurité**

- [ ] Aucun contrôle n'est réduit.
- [ ] Aucune donnée sensible supplémentaire.
- [ ] Aucun nouveau risque inter-tenant.
- [ ] Les secrets restent protégés.

**Exploitation**

- [ ] Le rollback est compris.
- [ ] Le coût est maîtrisé.
- [ ] L'observabilité est suffisante.
- [ ] L'impact production est évalué.

---

## 41. Résultat de classification

La classification doit produire un résultat explicite : Décision, Niveau, Justification, Action autorisée, Validation nécessaire, Conditions

Exemple :

```text
Décision:
Ajouter une table AI_RUN.

Niveau:
2 — Informer puis agir.

Justification:
Table additive déjà définie dans AI_ARCHITECTURE.md.

Action autorisée:
Créer la migration, le repository et les tests.

Conditions:
Migration additive, organizationId obligatoire, index tenant-aware,
aucune donnée sensible stockée sans politique.
```

---

## 42. Critères d'acceptation

Cette matrice est correctement appliquée lorsque :

- chaque décision significative est classée ;
- les décisions de niveau 1 restent locales et réversibles ;
- les décisions de niveau 2 sont annoncées avant exécution ;
- les décisions de niveau 3 sont bloquées sans approbation ;
- le niveau supérieur est choisi en cas de doute ;
- les décisions composites sont séparées lorsque possible ;
- les risques métier, données, sécurité et coûts sont pris en compte ;
- les décisions structurantes produisent un ADR ;
- aucune urgence ne sert à contourner la gouvernance ;
- le rapport final mentionne les niveaux appliqués.
