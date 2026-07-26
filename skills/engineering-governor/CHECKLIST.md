# TenderOS — Engineering Governor Checklist

Version : 1.0  
Statut : Draft  
Rôle concerné : Engineering Governor  
Document parent : `skills/engineering-governor/SKILL.md`

Note : dans tout ce document, les noms de documents cités en abrégé (`BUSINESS_RULES.md`, `PERMISSIONS.md`, `DOMAIN_MODEL.md`, `WORKFLOWS.md`, `DOMAIN_EVENTS.md`, `UBIQUITOUS_LANGUAGE.md`, `SYSTEM_ARCHITECTURE.md`, etc.) renvoient aux chemins réels listés dans `skills/engineering-governor/SKILL.md` §3.

---

## 1. Objectif

Ce document fournit les checklists opérationnelles utilisées par l'Engineering Governor avant, pendant et après une mission.

Il sert à vérifier que chaque changement respecte :

- les décisions produit ;
- les règles métier ;
- les permissions ;
- l'isolation multi-tenant ;
- l'architecture ;
- les standards d'ingénierie ;
- l'intégrité des données ;
- la sécurité ;
- la qualité ;
- l'observabilité ;
- la production readiness.

Les checklists ne remplacent pas le jugement d'ingénierie.

Elles constituent un filet de sécurité minimal.

---

## 2. Mode d'utilisation

L'Engineering Governor doit utiliser les checklists de manière proportionnée au risque.

Pour une mission simple :

- utiliser la checklist générale ;
- appliquer les sections spécialisées concernées ;
- documenter les points non applicables.

Pour une mission critique :

- compléter toutes les sections pertinentes ;
- enregistrer les exceptions ;
- justifier les éléments non vérifiés ;
- bloquer la livraison si un point critique reste non résolu.

Valeurs recommandées :

```text
[ ] Non vérifié
[x] Vérifié
[N/A] Non applicable
[BLOCKED] Bloquant
```

## 3. Checklist de démarrage de mission

### Compréhension

- [ ] L'objectif métier est compris.
- [ ] La valeur utilisateur est claire.
- [ ] Le résultat observable est défini.
- [ ] Le périmètre est identifié.
- [ ] Le hors périmètre est identifié.
- [ ] Les critères d'acceptation sont connus.
- [ ] Les dépendances externes sont identifiées.
- [ ] Les hypothèses sont explicites.
- [ ] Les ambiguïtés critiques sont signalées.

### Documents d'autorité

- [ ] PRODUCT_CONSTITUTION.md consulté si pertinent.
- [ ] PRODUCT_OVERVIEW.md consulté si pertinent.
- [ ] DOMAIN_MODEL.md consulté.
- [ ] BUSINESS_RULES.md consulté.
- [ ] UBIQUITOUS_LANGUAGE.md consulté.
- [ ] WORKFLOWS.md consulté.
- [ ] DOMAIN_EVENTS.md consulté.
- [ ] PERMISSIONS.md consulté.
- [ ] SYSTEM_ARCHITECTURE.md consulté.
- [ ] DATABASE_DESIGN.md consulté.
- [ ] ENGINEERING_STANDARDS.md consulté.
- [ ] API_GUIDELINES.md consulté si API concernée.
- [ ] AI_ARCHITECTURE.md consulté si IA concernée.
- [ ] ADR applicables consultés.
- [ ] Documentation locale du module consultée.
- [ ] Aucune contradiction non résolue.

Chemins réels de ces documents : voir `skills/engineering-governor/SKILL.md` §3. `PRODUCT_OVERVIEW.md` correspond à `bible/02-product/product-overview.md`, actuellement vide — non applicable tant qu'il n'est pas rédigé.

### Classification

- [ ] Chaque décision significative est identifiée.
- [ ] Chaque décision est classée niveau 1, 2 ou 3.
- [ ] Les décisions composites sont séparées si possible.
- [ ] Le niveau supérieur est retenu en cas de doute.
- [ ] Les décisions de niveau 2 sont annoncées.
- [ ] Les décisions de niveau 3 sont bloquées.
- [ ] Les approbations nécessaires sont obtenues.
- [ ] Les décisions nécessitant un ADR sont identifiées.

## 4. Checklist d'inspection du dépôt

### Structure

- [ ] L'arborescence du projet a été inspectée.
- [ ] Les modules concernés sont identifiés.
- [ ] Les frontières de modules existantes sont comprises.
- [ ] Les conventions de nommage sont identifiées.
- [ ] Les patterns locaux sont compris.
- [ ] Les dépendances inter-modules sont inspectées.
- [ ] Les packages partagés concernés sont identifiés.

### Code existant

- [ ] Les fichiers à modifier ont été lus.
- [ ] Les use cases proches ont été inspectés.
- [ ] Les entités et Value Objects concernés ont été inspectés.
- [ ] Les repositories concernés ont été inspectés.
- [ ] Les controllers concernés ont été inspectés.
- [ ] Les workers concernés ont été inspectés.
- [ ] Les adapters externes concernés ont été inspectés.
- [ ] Les erreurs existantes ont été inspectées.
- [ ] Les événements existants ont été inspectés.

### Tests et migrations

- [ ] Les tests existants ont été lus.
- [ ] Les fixtures existantes ont été inspectées.
- [ ] Les migrations récentes ont été inspectées.
- [ ] Les contraintes de base existantes sont comprises.
- [ ] Les scripts liés sont identifiés.
- [ ] Les commandes de validation du projet sont connues.

## 5. Checklist de planification

### Plan

- [ ] Le plan explique l'objectif.
- [ ] Le plan liste les documents applicables.
- [ ] Le plan définit le périmètre.
- [ ] Le plan définit le hors périmètre.
- [ ] Le plan liste les modules concernés.
- [ ] Le plan liste les fichiers probables.
- [ ] Le plan identifie les changements métier.
- [ ] Le plan identifie les permissions.
- [ ] Le plan identifie le tenant scope.
- [ ] Le plan identifie les contrats.
- [ ] Le plan identifie les données.
- [ ] Le plan identifie les événements.
- [ ] Le plan identifie les jobs asynchrones.
- [ ] Le plan identifie les migrations.
- [ ] Le plan définit la stratégie de test.
- [ ] Le plan définit les risques.
- [ ] Le plan définit les validations nécessaires.
- [ ] Le plan reste proportionné à la mission.

### Risques

- [ ] Le risque métier est évalué.
- [ ] Le risque sécurité est évalué.
- [ ] Le risque inter-tenant est évalué.
- [ ] Le risque de perte de données est évalué.
- [ ] Le risque de compatibilité est évalué.
- [ ] Le risque opérationnel est évalué.
- [ ] Le risque de coût est évalué.
- [ ] Le risque de verrou fournisseur est évalué.
- [ ] Le rollback est envisagé.
- [ ] Les mesures de réduction du risque sont définies.

## 6. Checklist Domain

### Modèle

- [ ] Le vocabulaire respecte l'Ubiquitous Language.
- [ ] L'entité ou l'agrégat approprié est utilisé.
- [ ] Les frontières d'agrégat sont cohérentes.
- [ ] Les Value Objects sont utilisés lorsque justifiés.
- [ ] Les identifiants sont typés lorsque pertinent.
- [ ] Les états invalides sont difficiles à représenter.
- [ ] Le Domain reste indépendant du framework.
- [ ] Le Domain ne dépend pas de Prisma.
- [ ] Le Domain ne dépend pas de HTTP.
- [ ] Le Domain ne dépend pas de l'IA.

### Invariants

- [ ] Les invariants applicables sont identifiés.
- [ ] Les invariants sont protégés dans le Domain.
- [ ] Les transitions sont explicites.
- [ ] Les transitions refusées sont testées.
- [ ] Les erreurs métier sont explicites.
- [ ] Les règles ne sont pas dupliquées dans plusieurs couches.
- [ ] Aucune règle métier n'a été inventée.
- [ ] Les dates métier utilisent une horloge contrôlable.
- [ ] Les montants utilisent une précision décimale.
- [ ] Les devises sont explicites.

### Événements métier

- [ ] L'événement décrit un fait passé.
- [ ] Le nom utilise le langage métier.
- [ ] L'événement est immuable.
- [ ] L'événement possède une version.
- [ ] L'événement possède un identifiant.
- [ ] L'événement possède un timestamp.
- [ ] Le tenant est inclus lorsque requis.
- [ ] Les données sensibles sont minimisées.
- [ ] Le test vérifie l'événement attendu.

## 7. Checklist Application et use cases

### Intention

- [ ] Le use case porte un nom métier explicite.
- [ ] Le use case correspond à une capacité documentée.
- [ ] La commande ou query est claire.
- [ ] Les commandes et queries sont distinguées.
- [ ] Le résultat est explicite.
- [ ] Les erreurs attendues sont modélisées.

### Orchestration

- [ ] L'acteur est identifié.
- [ ] L'organisation est identifiée.
- [ ] La membership est vérifiée.
- [ ] La permission est vérifiée.
- [ ] L'accès Workspace est vérifié si nécessaire.
- [ ] Les ressources sont chargées avec le tenant.
- [ ] Les règles métier sont appliquées par le Domain.
- [ ] La transaction est correctement délimitée.
- [ ] L'audit est produit lorsque requis.
- [ ] L'Outbox est alimentée lorsque requis.
- [ ] Le résultat ne retourne pas un modèle Prisma.

### Complexité

- [ ] Le use case ne contient pas de logique transport.
- [ ] Le use case ne dépend pas de NestJS.
- [ ] Le use case ne dépend pas directement d'un fournisseur.
- [ ] Les effets externes longs sont hors transaction.
- [ ] Aucun workflow inutilement générique n'est introduit.
- [ ] Le changement constitue un vertical slice cohérent.

## 8. Checklist permissions

### Définition

- [ ] La permission existe dans PERMISSIONS.md.
- [ ] Le rôle applicable est identifié.
- [ ] La ressource applicable est identifiée.
- [ ] L'état métier applicable est identifié.
- [ ] Les restrictions Workspace sont identifiées.
- [ ] Les cas administratifs sont documentés.
- [ ] Aucun droit implicite n'est supposé.

### Implémentation

- [ ] La permission est vérifiée côté serveur.
- [ ] La permission est vérifiée avant la lecture sensible.
- [ ] La permission est vérifiée avant l'écriture.
- [ ] La permission est vérifiée avant le téléchargement.
- [ ] La permission est vérifiée avant l'export.
- [ ] La permission est vérifiée avant le retrieval IA.
- [ ] La permission est vérifiée dans les workers.
- [ ] La permission est vérifiée dans les outils agentiques.
- [ ] Le frontend ne constitue pas l'unique contrôle.
- [ ] Le comportement échoue fermé.

### Tests

- [ ] Acteur autorisé testé.
- [ ] Acteur non autorisé testé.
- [ ] Acteur sans membership testé.
- [ ] Acteur d'un autre tenant testé.
- [ ] Ressource inaccessible testée.
- [ ] État métier incompatible testé.
- [ ] Tentative d'énumération testée.
- [ ] Accès administratif testé si pertinent.

## 9. Checklist multi-tenant

### Propagation

- [ ] organizationId est explicite dans la commande ou query.
- [ ] organizationId est explicite dans le use case.
- [ ] organizationId est explicite dans le repository.
- [ ] organizationId est explicite dans les workers.
- [ ] organizationId est présent dans les événements.
- [ ] organizationId est présent dans les clés de cache.
- [ ] organizationId est présent dans les chemins de stockage.
- [ ] organizationId est présent dans les recherches.
- [ ] organizationId est présent dans les AI Runs.
- [ ] organizationId est présent dans les logs structurés.

### Base de données

- [ ] Les requêtes filtrent par organizationId.
- [ ] Les updates filtrent par organizationId.
- [ ] Les deletes filtrent par organizationId.
- [ ] Les contraintes uniques sont tenant-aware.
- [ ] Les relations empêchent les associations inter-tenant.
- [ ] Les projections restent tenant-scoped.
- [ ] Les agrégations ne mélangent pas les organisations.
- [ ] Les scripts de migration respectent les tenants.

### Fichiers, recherche et IA

- [ ] Les fichiers sont stockés dans un namespace tenant.
- [ ] Les URLs signées sont générées après autorisation.
- [ ] Les chunks contiennent organizationId.
- [ ] Les embeddings contiennent organizationId.
- [ ] Le retrieval filtre avant construction du contexte.
- [ ] Le cache IA inclut le tenant.
- [ ] Les résultats d'évaluation ne mélangent pas les tenants.
- [ ] Les exports restent tenant-scoped.

### Tests

- [ ] Lecture inter-tenant refusée.
- [ ] Mise à jour inter-tenant refusée.
- [ ] Suppression inter-tenant refusée.
- [ ] Téléchargement inter-tenant refusé.
- [ ] Recherche inter-tenant refusée.
- [ ] Cache inter-tenant testé.
- [ ] Worker inter-tenant testé.
- [ ] RAG inter-tenant testé.

## 10. Checklist base de données

### Modèle

- [ ] La table appartient à un module clair.
- [ ] Le tenant scope est défini.
- [ ] La clé primaire est appropriée.
- [ ] Les clés étrangères sont définies.
- [ ] La nullabilité est intentionnelle.
- [ ] Les valeurs par défaut sont sûres.
- [ ] Les contraintes uniques sont définies.
- [ ] Les checks sont ajoutés lorsque pertinent.
- [ ] Les index sont justifiés.
- [ ] Les timestamps sont cohérents.
- [ ] La stratégie de suppression est définie.
- [ ] La stratégie d'historique est définie.
- [ ] La stratégie de rétention est définie.

### Concurrence

- [ ] Le risque d'écriture concurrente est évalué.
- [ ] Une version optimiste est utilisée si nécessaire.
- [ ] Les contraintes empêchent les doublons.
- [ ] Les transactions couvrent les écritures atomiques.
- [ ] Aucun écrasement silencieux critique n'est possible.
- [ ] Les conflits produisent une erreur explicite.

### Performance

- [ ] Les requêtes principales sont identifiées.
- [ ] Les index correspondent à des requêtes réelles.
- [ ] Le risque N+1 est évalué.
- [ ] La pagination est prévue.
- [ ] Le volume estimé est considéré.
- [ ] Le verrouillage potentiel est évalué.
- [ ] Les requêtes lourdes sont mesurables.

## 11. Checklist migrations

### Classification

- [ ] La migration est additive ou destructive.
- [ ] Le niveau d'autonomie est confirmé.
- [ ] Une migration destructive a une approbation explicite.
- [ ] Un ADR est créé si la décision est structurante.

### Sécurité

- [ ] Le volume de données est estimé.
- [ ] Le temps d'exécution est estimé.
- [ ] Le risque de lock est évalué.
- [ ] La compatibilité avec l'ancienne version est assurée.
- [ ] La compatibilité avec la nouvelle version est assurée.
- [ ] Le rollback est compris.
- [ ] La sauvegarde est vérifiée si nécessaire.
- [ ] Le dry-run est prévu pour les scripts sensibles.

### Stratégie progressive

- [ ] Étape Expand définie.
- [ ] Étape Backfill définie.
- [ ] Étape Switch définie.
- [ ] Étape Contract définie.
- [ ] Le backfill est idempotent.
- [ ] Le backfill est reprenable.
- [ ] Le backfill est observable.
- [ ] Le backfill est limité par lots si nécessaire.
- [ ] La suppression finale est différée.

### Validation

- [ ] La migration s'exécute sur une base représentative.
- [ ] Les contraintes attendues sont vérifiées.
- [ ] Les données existantes restent valides.
- [ ] Les indexes sont créés sans impact excessif.
- [ ] Le rollback ou forward-fix est testé.
- [ ] La documentation de déploiement est mise à jour.

## 12. Checklist API

### Ressource et intention

- [ ] L'endpoint exprime une intention métier.
- [ ] La ressource est nommée correctement.
- [ ] La version API est correcte.
- [ ] L'action métier n'est pas un simple PATCH de statut.
- [ ] Le contrat est compatible lorsque requis.
- [ ] Les champs obligatoires sont justifiés.
- [ ] Les identifiants sont opaques.

### Entrée

- [ ] Path params validés.
- [ ] Query params validés.
- [ ] Body validé.
- [ ] Zod ou mécanisme équivalent utilisé à la frontière.
- [ ] La taille du payload est limitée.
- [ ] Les enums sont contrôlés.
- [ ] Les dates ont une sémantique claire.
- [ ] Les montants sont sérialisés comme chaînes décimales.
- [ ] Les données inconnues sont refusées ou gérées explicitement.

### Sécurité

- [ ] Authentification requise.
- [ ] Autorisation serveur appliquée.
- [ ] Tenant scope appliqué.
- [ ] Protection IDOR vérifiée.
- [ ] Rate limiting prévu si nécessaire.
- [ ] CORS conforme.
- [ ] CSRF évalué.
- [ ] Les erreurs ne révèlent pas d'informations sensibles.
- [ ] Les ressources d'un autre tenant ne sont pas énumérables.

### Réponse

- [ ] Le Presenter est dédié.
- [ ] Aucun modèle Prisma n'est exposé.
- [ ] Le format JSON utilise camelCase.
- [ ] Les timestamps utilisent ISO 8601.
- [ ] Les montants utilisent des chaînes.
- [ ] Les valeurs nulles suivent une convention stable.
- [ ] Les erreurs ont un code stable.
- [ ] Le requestId est présent.
- [ ] Le bon code HTTP est utilisé.
- [ ] 202 Accepted est utilisé pour les traitements longs.

### Robustesse

- [ ] L'idempotence est définie.
- [ ] La concurrence optimiste est définie si nécessaire.
- [ ] La pagination est utilisée.
- [ ] Le tri est contrôlé.
- [ ] Les filtres sont validés.
- [ ] Les limites de page sont définies.
- [ ] Les téléchargements utilisent des URLs signées courtes.
- [ ] Les opérations asynchrones sont consultables.

### Documentation et tests

- [ ] OpenAPI mis à jour.
- [ ] Exemple de requête ajouté.
- [ ] Exemple de réponse ajouté.
- [ ] Cas nominal testé.
- [ ] Validation testée.
- [ ] Authentification testée.
- [ ] Permission testée.
- [ ] Tenant testé.
- [ ] Conflit testé.
- [ ] Contrat testé.

## 13. Checklist controllers et presenters

### Controller

- [ ] Le contrôleur est fin.
- [ ] Il authentifie.
- [ ] Il parse.
- [ ] Il valide.
- [ ] Il construit une commande ou query.
- [ ] Il appelle un seul use case principal.
- [ ] Il mappe le résultat.
- [ ] Il ne contient pas de règle métier.
- [ ] Il ne contient pas de transaction.
- [ ] Il n'appelle pas Prisma.
- [ ] Il n'appelle pas un fournisseur externe.
- [ ] Il ne modifie pas directement un statut.

### Presenter

- [ ] Le Presenter contrôle les champs exposés.
- [ ] Les données sensibles sont exclues.
- [ ] Les montants sont formatés correctement.
- [ ] Les dates sont sérialisées correctement.
- [ ] Les enums exposés sont stables.
- [ ] Les relations sont limitées au besoin.
- [ ] Le format est couvert par des tests.

## 14. Checklist repositories et Prisma

### Repository

- [ ] Le repository correspond à une frontière métier.
- [ ] L'interface appartient à l'Application ou au Domain approprié.
- [ ] L'implémentation appartient à l'Infrastructure.
- [ ] Le repository est tenant-scoped.
- [ ] Les méthodes expriment une intention.
- [ ] Aucun generic repository universel n'est introduit.
- [ ] Les erreurs de persistance sont mappées.
- [ ] Les transactions sont supportées si nécessaire.

### Prisma

- [ ] Prisma reste dans l'Infrastructure.
- [ ] Aucun type Prisma ne traverse la frontière.
- [ ] Les modèles Prisma ne sont pas retournés par l'API.
- [ ] Les mappings Domain ↔ Persistence sont explicites.
- [ ] Les enums Prisma ne remplacent pas les types Domain.
- [ ] Les sélections évitent le surchargement.
- [ ] Les requêtes évitent les N+1.
- [ ] Les transactions sont courtes.
- [ ] Les requêtes sont tenant-scoped.

### Tests

- [ ] Mapping vers le Domain testé.
- [ ] Mapping depuis le Domain testé.
- [ ] Filtrage tenant testé.
- [ ] Contrainte unique testée.
- [ ] Concurrence testée.
- [ ] Transaction testée.
- [ ] Not found testé.
- [ ] Erreur de persistance testée.

## 15. Checklist événements et Outbox

### Événement

- [ ] L'événement décrit un fait passé.
- [ ] Le contrat est versionné.
- [ ] Le schéma est documenté.
- [ ] Le tenant est inclus.
- [ ] Le correlationId est inclus si pertinent.
- [ ] Le causationId est inclus si pertinent.
- [ ] Les données sont minimisées.
- [ ] Aucun secret n'est inclus.
- [ ] La compatibilité est évaluée.

### Outbox

- [ ] L'événement est enregistré dans la transaction métier.
- [ ] L'Outbox possède un identifiant stable.
- [ ] Le statut de publication est suivi.
- [ ] Les retries sont bornés.
- [ ] La publication est idempotente.
- [ ] Les erreurs sont observables.
- [ ] Une Dead Letter existe si nécessaire.
- [ ] Le nettoyage est défini.
- [ ] La rétention est définie.

### Consumer

- [ ] Le message est validé.
- [ ] La version est supportée.
- [ ] Le consumer est idempotent.
- [ ] Les doublons sont gérés.
- [ ] Le tenant scope est appliqué.
- [ ] Les erreurs retryables sont distinguées.
- [ ] Les erreurs définitives sont distinguées.
- [ ] Le timeout est explicite.
- [ ] Le backoff est configuré.
- [ ] La Dead Letter est testée.

## 16. Checklist workers et jobs

### Déclenchement

- [ ] Le job possède un identifiant.
- [ ] Le tenant est explicite.
- [ ] L'acteur ou le contexte d'autorisation est connu.
- [ ] L'input est validé.
- [ ] L'idempotency key est définie.
- [ ] Le statut initial est enregistré.

### Exécution

- [ ] Le timeout est défini.
- [ ] Le nombre maximal de tentatives est défini.
- [ ] Le backoff est défini.
- [ ] Le jitter est utilisé lorsque pertinent.
- [ ] Les effets externes sont idempotents.
- [ ] Les transactions sont courtes.
- [ ] Les appels externes ont un timeout.
- [ ] Le job peut reprendre après interruption.
- [ ] La progression est suivie si nécessaire.
- [ ] L'annulation est définie si nécessaire.

### États et erreurs

- [ ] Les états sont explicites.
- [ ] Le succès est enregistré.
- [ ] L'échec est enregistré.
- [ ] L'échec partiel est représenté si nécessaire.
- [ ] Les erreurs temporaires sont distinguées.
- [ ] Les erreurs permanentes sont distinguées.
- [ ] Les retries sont arrêtés au bon moment.
- [ ] Les erreurs définitives vont en Dead Letter.
- [ ] Une intervention humaine est possible.

### Observabilité

- [ ] Logs structurés.
- [ ] Métrique de succès.
- [ ] Métrique d'échec.
- [ ] Métrique de durée.
- [ ] Métrique de retry.
- [ ] Taille de backlog suivie.
- [ ] Dead Letters suivies.
- [ ] Alertes définies.
- [ ] Runbook disponible.

## 17. Checklist fichiers et uploads

### Autorisation

- [ ] L'acteur est autorisé à uploader.
- [ ] L'acteur est autorisé à lire.
- [ ] L'acteur est autorisé à télécharger.
- [ ] Le tenant est vérifié avant chaque action.
- [ ] Le Workspace est vérifié si pertinent.

### Upload

- [ ] La taille maximale est définie.
- [ ] Le MIME réel est vérifié.
- [ ] L'extension est vérifiée.
- [ ] Le checksum est calculé.
- [ ] L'antivirus est exécuté.
- [ ] Les fichiers chiffrés sont traités explicitement.
- [ ] Les fichiers corrompus sont rejetés.
- [ ] Le quota est appliqué.
- [ ] Le stockage est tenant-scoped.
- [ ] L'état d'upload est enregistré.

### URL signée

- [ ] L'URL est générée après autorisation.
- [ ] L'URL a une durée courte.
- [ ] L'URL est limitée à une opération.
- [ ] L'URL n'est pas loggée.
- [ ] L'URL n'est pas persistée durablement.
- [ ] Le renouvellement exige une nouvelle autorisation.

### Traitement

- [ ] Le traitement est asynchrone si long.
- [ ] L'extraction est limitée en ressources.
- [ ] Les erreurs sont enregistrées.
- [ ] Les retries sont bornés.
- [ ] Les fichiers invalides ne sont pas indexés.
- [ ] Les contenus supprimés sont désindexés.
- [ ] Les versions documentaires sont immuables.

## 18. Checklist IA

### Gouvernance

- [ ] L'opération IA est définie.
- [ ] Le Skill existe.
- [ ] Le Skill est versionné.
- [ ] Le prompt est versionné.
- [ ] Le schéma de sortie est versionné.
- [ ] Le fournisseur est autorisé.
- [ ] Le modèle est autorisé.
- [ ] Le niveau de confidentialité est défini.
- [ ] La région est conforme.
- [ ] La validation humaine requise est définie.

### AI Gateway

- [ ] L'appel passe par l'AI Gateway.
- [ ] Aucun module métier n'appelle directement le fournisseur.
- [ ] Le routage du modèle est explicite.
- [ ] Le timeout est défini.
- [ ] Le retry est borné.
- [ ] Le fallback respecte la confidentialité.
- [ ] Le budget est contrôlé.
- [ ] Le coût est enregistré.
- [ ] L'AI Run est créé.
- [ ] Le correlationId est enregistré.

### Entrées

- [ ] Les entrées sont validées.
- [ ] Les données sont minimisées.
- [ ] Les données sensibles sont redacted si nécessaire.
- [ ] Le tenant est vérifié.
- [ ] Les permissions sont vérifiées avant retrieval.
- [ ] Les documents sont traités comme des données.
- [ ] Les instructions contenues dans les documents ne font pas autorité.
- [ ] Les sources obsolètes sont exclues ou signalées.
- [ ] Les versions de documents sont connues.

### RAG

- [ ] Les chunks contiennent les métadonnées obligatoires.
- [ ] Le filtre tenant est appliqué.
- [ ] Le filtre Workspace est appliqué.
- [ ] Le filtre de confidentialité est appliqué.
- [ ] Les documents supprimés sont exclus.
- [ ] Les versions autorisées sont utilisées.
- [ ] La recherche hybride est justifiée.
- [ ] Le reranking est tenant-aware.
- [ ] Les sources sont dédupliquées.
- [ ] Le contexte respecte le budget de tokens.

### Sorties

- [ ] La sortie est structurée.
- [ ] La sortie respecte le schéma.
- [ ] La validation métier est appliquée.
- [ ] La validation de permission est appliquée.
- [ ] Les citations sont validées.
- [ ] Les numéros de page existent.
- [ ] Les extraits correspondent à la source.
- [ ] Les contradictions sont signalées.
- [ ] Les informations absentes ne sont pas inventées.
- [ ] Le niveau de confiance est justifié.
- [ ] Le contenu généré est marqué comme IA.
- [ ] Le résultat obsolète est détectable.

### Agents

- [ ] Les outils autorisés sont listés.
- [ ] Les outils interdits sont inaccessibles.
- [ ] Le nombre maximal d'étapes est défini.
- [ ] Le nombre maximal d'appels est défini.
- [ ] Le nombre maximal de tokens est défini.
- [ ] Le coût maximal est défini.
- [ ] La durée maximale est définie.
- [ ] Les conditions d'arrêt sont définies.
- [ ] Les actions critiques exigent un humain.
- [ ] Aucune boucle non bornée.

### Tests et évaluations

- [ ] Sortie valide testée.
- [ ] Sortie invalide testée.
- [ ] Timeout testé.
- [ ] Budget dépassé testé.
- [ ] Permission refusée testée.
- [ ] Tenant leak testé.
- [ ] Prompt injection testée.
- [ ] Citation invalide testée.
- [ ] Information absente testée.
- [ ] Contradiction testée.
- [ ] Jeu d'évaluation mis à jour.
- [ ] Seuils de qualité respectés.
- [ ] Régression vérifiée.

## 19. Checklist sécurité

### Authentification

- [ ] Les endpoints privés exigent une authentification.
- [ ] Les sessions ou tokens sont validés.
- [ ] L'expiration est vérifiée.
- [ ] La révocation est prise en compte.
- [ ] Les comptes désactivés sont refusés.
- [ ] L'authentification n'est pas seulement frontend.

### Autorisation

- [ ] La policy correspond à PERMISSIONS.md.
- [ ] Le contrôle s'effectue côté serveur.
- [ ] L'accès à la ressource est vérifié.
- [ ] L'état métier est vérifié.
- [ ] Les droits administratifs sont limités.
- [ ] Les permissions échouent fermé.

### Entrées et injections

- [ ] Les entrées sont validées.
- [ ] Les requêtes SQL sont paramétrées.
- [ ] Les commandes système ne sont pas construites depuis l'entrée.
- [ ] Le risque SSRF est évalué.
- [ ] Les URLs externes sont validées.
- [ ] Les uploads sont contrôlés.
- [ ] Le contenu HTML est sanitizé si nécessaire.
- [ ] Les sorties sont échappées.

### Web

- [ ] CORS est limité.
- [ ] CSRF est évalué.
- [ ] Les cookies sont sécurisés.
- [ ] Les headers de sécurité sont définis.
- [ ] Le rate limiting est appliqué.
- [ ] Les endpoints sensibles ont une protection renforcée.
- [ ] Les erreurs ne permettent pas l'énumération.

### Secrets

- [ ] Aucun secret dans le code.
- [ ] Aucun secret dans les logs.
- [ ] Aucun secret dans les fixtures.
- [ ] Aucun secret dans les prompts.
- [ ] Aucun secret dans les événements.
- [ ] Les variables d'environnement sont validées.
- [ ] La rotation est possible.
- [ ] Les accès suivent le moindre privilège.

### Dépendances

- [ ] La dépendance est maintenue.
- [ ] La licence est compatible.
- [ ] Les vulnérabilités sont vérifiées.
- [ ] La version est maîtrisée.
- [ ] Le package est nécessaire.
- [ ] La surface d'attaque est acceptable.

### Données sensibles

- [ ] La collecte est nécessaire.
- [ ] L'accès est limité.
- [ ] La donnée est chiffrée si nécessaire.
- [ ] La rétention est définie.
- [ ] La suppression est possible.
- [ ] Les transferts externes sont identifiés.
- [ ] Les logs sont redacted.
- [ ] Les exports sont contrôlés.

## 20. Checklist frontend

### Architecture

- [ ] Le code est organisé par feature.
- [ ] Les composants partagés restent génériques.
- [ ] La logique métier critique reste côté serveur.
- [ ] Le state global est justifié.
- [ ] Les Server Components sont utilisés par défaut lorsque pertinent.
- [ ] Les Client Components sont limités au besoin.
- [ ] Les appels API utilisent des contrats typés.

### Données

- [ ] Les données tenant-scoped ne sont pas mélangées dans le cache.
- [ ] Les clés de cache incluent le tenant.
- [ ] Les données sensibles ne sont pas exposées.
- [ ] Les états asynchrones sont réconciliés.
- [ ] Les erreurs serveur sont correctement représentées.
- [ ] Les résultats obsolètes sont signalés.

### Permissions

- [ ] L'UI reflète les permissions.
- [ ] Le backend reste l'autorité.
- [ ] Les boutons non autorisés sont masqués ou désactivés.
- [ ] Une action forcée côté client est refusée côté serveur.
- [ ] Les états métier incompatibles sont représentés.

### UX

- [ ] État de chargement présent.
- [ ] État vide présent.
- [ ] État d'erreur présent.
- [ ] Confirmation pour les actions sensibles.
- [ ] Feedback après action.
- [ ] Opérations longues suivies.
- [ ] Contenu IA clairement identifié.
- [ ] Contenu à valider clairement identifié.

### Accessibilité

- [ ] Navigation clavier.
- [ ] Focus visible.
- [ ] Labels de formulaires.
- [ ] Messages d'erreur associés.
- [ ] Structure sémantique.
- [ ] Alternatives textuelles.
- [ ] Annonce des changements d'état.
- [ ] Contrastes suffisants.

### Tests

- [ ] Cas nominal.
- [ ] Erreur serveur.
- [ ] Permission refusée.
- [ ] État vide.
- [ ] État de chargement.
- [ ] Interaction clavier.
- [ ] Soumission de formulaire.
- [ ] Opération asynchrone.

## 21. Checklist dépendances

### Besoin

- [ ] Le besoin est concret.
- [ ] Une solution native a été évaluée.
- [ ] Une implémentation simple locale a été évaluée.
- [ ] La dépendance évite une complexité réelle.
- [ ] Le package n'est pas ajouté pour quelques lignes triviales.

### Qualité

- [ ] Le package est maintenu.
- [ ] La documentation est suffisante.
- [ ] La licence est compatible.
- [ ] Les vulnérabilités connues sont acceptables.
- [ ] Le package est compatible avec la stack.
- [ ] La taille est acceptable.
- [ ] Le package supporte TypeScript correctement.

### Gouvernance

- [ ] Le propriétaire interne est identifié.
- [ ] Le niveau de décision est classé.
- [ ] Le risque de verrou fournisseur est évalué.
- [ ] La suppression future est possible.
- [ ] L'alternative est documentée.
- [ ] Un ADR est prévu si structurant.

## 22. Checklist observabilité

### Logs

- [ ] Logs structurés.
- [ ] requestId inclus.
- [ ] correlationId inclus.
- [ ] organizationId inclus.
- [ ] actorId inclus lorsque pertinent.
- [ ] resourceId inclus lorsque pertinent.
- [ ] Opération incluse.
- [ ] Durée incluse.
- [ ] Statut inclus.
- [ ] Code d'erreur inclus.
- [ ] Aucune donnée sensible.
- [ ] Aucun payload complet inutile.

### Métriques

- [ ] Volume d'opérations.
- [ ] Taux de succès.
- [ ] Taux d'échec.
- [ ] Durée.
- [ ] Saturation.
- [ ] Backlog.
- [ ] Retry.
- [ ] Dead Letter.
- [ ] Coût lorsque pertinent.
- [ ] Métriques métier si nécessaires.

### Traces

- [ ] Les appels critiques sont corrélés.
- [ ] Les appels externes sont visibles.
- [ ] Les workers sont corrélés à la requête d'origine.
- [ ] Les événements conservent la causalité.
- [ ] Les données sensibles sont exclues.

### Alertes

- [ ] Seuils définis.
- [ ] Destinataire défini.
- [ ] Gravité définie.
- [ ] Runbook associé.
- [ ] Faux positifs évalués.
- [ ] Conditions de retour à la normale définies.

### Dashboards

- [ ] Les indicateurs essentiels sont visibles.
- [ ] Le filtrage par environnement existe.
- [ ] Le filtrage par tenant est sécurisé.
- [ ] Les tendances sont visibles.
- [ ] Les anomalies sont détectables.

## 23. Checklist performance

### Avant optimisation

- [ ] Le problème est mesuré.
- [ ] Le goulot est identifié.
- [ ] La cible est définie.
- [ ] Le volume représentatif est connu.
- [ ] L'impact utilisateur est connu.
- [ ] Le coût de la solution est évalué.

### Requêtes

- [ ] Pagination.
- [ ] Absence de N+1.
- [ ] Sélection minimale.
- [ ] Index appropriés.
- [ ] Tri indexable.
- [ ] Filtres tenant-aware.
- [ ] Plans de requête inspectés si nécessaire.

### Cache

- [ ] Le cache est nécessaire.
- [ ] La clé est définie.
- [ ] Le tenant est inclus.
- [ ] Le TTL est défini.
- [ ] L'invalidation est définie.
- [ ] Les données sensibles sont protégées.
- [ ] Le comportement en panne est défini.
- [ ] Les métriques hit/miss existent.

### Traitements

- [ ] Les tâches longues sont asynchrones.
- [ ] Les lots sont bornés.
- [ ] La mémoire est limitée.
- [ ] Le parallélisme est contrôlé.
- [ ] Les timeouts sont définis.
- [ ] Les ressources sont libérées.
- [ ] Le traitement peut reprendre.

### Après optimisation

- [ ] La mesure est répétée.
- [ ] La cible est atteinte.
- [ ] Aucun comportement n'a changé.
- [ ] Aucun risque sécurité ajouté.
- [ ] Aucun risque inter-tenant ajouté.
- [ ] La complexité reste acceptable.
- [ ] La documentation est mise à jour.

## 24. Checklist tests

### Stratégie

- [ ] Le niveau de test correspond au risque.
- [ ] Les règles métier sont couvertes.
- [ ] Les permissions sont couvertes.
- [ ] Le multi-tenant est couvert.
- [ ] Les transactions sont couvertes.
- [ ] Les erreurs sont couvertes.
- [ ] Les contrats sont couverts.
- [ ] L'idempotence est couverte.
- [ ] Les migrations sont couvertes.
- [ ] Les workflows critiques ont un E2E.

### Qualité

- [ ] Les tests protègent le comportement.
- [ ] Les assertions sont significatives.
- [ ] Les tests sont déterministes.
- [ ] L'heure est contrôlée.
- [ ] Les UUID sont contrôlés si nécessaire.
- [ ] Les données sont isolées.
- [ ] Les services externes sont simulés.
- [ ] Les tests ne dépendent pas d'un fournisseur IA réel.
- [ ] Aucun test flaky connu.
- [ ] Aucun skip injustifié.

### Cas minimaux

- [ ] Cas nominal.
- [ ] Validation invalide.
- [ ] Non authentifié.
- [ ] Non autorisé.
- [ ] Autre tenant.
- [ ] Ressource absente.
- [ ] État incompatible.
- [ ] Conflit de concurrence.
- [ ] Dépendance externe indisponible.
- [ ] Retry.
- [ ] Idempotence.
- [ ] Erreur définitive.

### Exécution

- [ ] Tests unitaires exécutés.
- [ ] Tests d'intégration exécutés.
- [ ] Tests de contrat exécutés.
- [ ] Tests E2E exécutés si applicables.
- [ ] Tests de migration exécutés.
- [ ] Tests de sécurité exécutés si applicables.
- [ ] Évaluations IA exécutées si applicables.
- [ ] Les résultats sont enregistrés.
- [ ] Les échecs sont résolus ou déclarés.

## 25. Checklist CI

### Contrôles de base

- [ ] Installation reproductible.
- [ ] Format check.
- [ ] Lint.
- [ ] Type check.
- [ ] Unit tests.
- [ ] Integration tests.
- [ ] Build.
- [ ] Migration validation.
- [ ] Security scan.
- [ ] Dependency scan.

### Contrôles supplémentaires

- [ ] Contract tests.
- [ ] E2E tests.
- [ ] Container scan.
- [ ] License check.
- [ ] AI evaluations.
- [ ] Performance tests.
- [ ] OpenAPI diff.
- [ ] Migration compatibility.
- [ ] Secret scanning.

### Pipeline

- [ ] Le pipeline échoue sur un contrôle critique.
- [ ] Aucun contrôle critique n'est ignoré.
- [ ] Les artefacts sont traçables.
- [ ] Les secrets CI sont limités.
- [ ] Les environnements sont séparés.
- [ ] Les permissions CI suivent le moindre privilège.
- [ ] Les logs CI ne contiennent pas de secrets.
- [ ] Le rollback est documenté.

## 26. Checklist documentation

### Technique

- [ ] README du module mis à jour.
- [ ] Architecture locale mise à jour.
- [ ] OpenAPI mise à jour.
- [ ] Database Design mis à jour.
- [ ] Domain Events mis à jour.
- [ ] Variables d'environnement documentées.
- [ ] Migrations documentées.
- [ ] Runbook mis à jour.
- [ ] ADR créé ou mis à jour.

### Produit et métier

- [ ] Le comportement documenté reste cohérent.
- [ ] Les Business Rules restent cohérentes.
- [ ] Les Permissions restent cohérentes.
- [ ] Les Workflows restent cohérents.
- [ ] Le vocabulaire reste cohérent.
- [ ] Aucun comportement implicite n'est ajouté.

### Qualité

- [ ] La documentation explique le pourquoi.
- [ ] Les exemples sont corrects.
- [ ] Les commandes ont été vérifiées.
- [ ] Les chemins de fichiers sont corrects.
- [ ] Les limites sont explicites.
- [ ] Les informations obsolètes sont supprimées.
- [ ] Le code et la documentation concordent.

## 27. Checklist revue de code

### Fonctionnel

- [ ] Le changement répond au besoin.
- [ ] Le périmètre est respecté.
- [ ] Les critères d'acceptation sont satisfaits.
- [ ] Aucun comportement non demandé.
- [ ] Aucun cas critique oublié.

### Métier

- [ ] Le vocabulaire est correct.
- [ ] Les invariants sont protégés.
- [ ] Les transitions sont correctes.
- [ ] Les erreurs métier sont correctes.
- [ ] Les événements sont corrects.
- [ ] L'historique est correct.

### Architecture

- [ ] Les frontières sont respectées.
- [ ] Le Domain reste indépendant.
- [ ] Les controllers sont fins.
- [ ] Prisma reste dans l'Infrastructure.
- [ ] Les ports sont justifiés.
- [ ] Aucun couplage transversal inutile.
- [ ] Aucune dépendance circulaire.
- [ ] Aucun microservice prématuré.

### Sécurité et tenant

- [ ] Authentification.
- [ ] Autorisation.
- [ ] Tenant scope.
- [ ] Validation.
- [ ] Logs sûrs.
- [ ] Secrets protégés.
- [ ] Fichiers sécurisés.
- [ ] Appels externes contrôlés.
- [ ] Aucun IDOR.
- [ ] Aucune fuite inter-tenant.

### Données

- [ ] Contraintes correctes.
- [ ] Transactions correctes.
- [ ] Concurrence gérée.
- [ ] Migration sûre.
- [ ] Index justifiés.
- [ ] Suppression contrôlée.
- [ ] Rétention respectée.

### Qualité

- [ ] Code lisible.
- [ ] Noms explicites.
- [ ] Pas de any injustifié.
- [ ] Pas de cast masquant un problème.
- [ ] Pas de catch vide.
- [ ] Pas de code mort.
- [ ] Pas d'abstraction prématurée.
- [ ] Pas de dépendance inutile.
- [ ] Tests significatifs.
- [ ] Documentation mise à jour.

### Verdict

- [ ] Approved.
- [ ] Approved with minor changes.
- [ ] Changes requested.
- [ ] Blocked pending product decision.

## 28. Checklist production readiness

### Fonctionnalité

- [ ] Critères d'acceptation satisfaits.
- [ ] Cas nominaux vérifiés.
- [ ] Cas de refus vérifiés.
- [ ] États d'erreur représentés.
- [ ] Rollback fonctionnel compris.
- [ ] Feature flag disponible si nécessaire.

### Sécurité

- [ ] Authentification vérifiée.
- [ ] Permissions vérifiées.
- [ ] Multi-tenant vérifié.
- [ ] Secrets vérifiés.
- [ ] Logs vérifiés.
- [ ] Dépendances vérifiées.
- [ ] Uploads vérifiés.
- [ ] Données sensibles vérifiées.
- [ ] Scan sécurité réussi.

### Données

- [ ] Migration validée.
- [ ] Compatibilité de déploiement validée.
- [ ] Backfill validé.
- [ ] Contraintes validées.
- [ ] Sauvegarde ou restauration prise en compte.
- [ ] Rétention prise en compte.
- [ ] Suppression prise en compte.

### Résilience

- [ ] Timeouts.
- [ ] Retries bornés.
- [ ] Idempotence.
- [ ] Circuit breaker si nécessaire.
- [ ] Dead Letter.
- [ ] Dégradation contrôlée.
- [ ] Annulation si nécessaire.
- [ ] Reprise après panne.

### Observabilité

- [ ] Logs.
- [ ] Métriques.
- [ ] Traces.
- [ ] Alertes.
- [ ] Dashboard.
- [ ] Runbook.
- [ ] Identifiants de corrélation.
- [ ] Indicateurs métier si nécessaires.

### Validation

- [ ] Format réussi.
- [ ] Lint réussi.
- [ ] Type check réussi.
- [ ] Tests unitaires réussis.
- [ ] Tests d'intégration réussis.
- [ ] Tests de contrat réussis.
- [ ] Tests E2E réussis si applicables.
- [ ] Build réussi.
- [ ] Migrations validées.
- [ ] Documentation à jour.

### Décisions

- [ ] Aucun niveau 3 en attente.
- [ ] ADR nécessaires acceptés.
- [ ] Risques connus déclarés.
- [ ] Limitations déclarées.
- [ ] Propriétaire d'exploitation identifié.

## 29. Checklist déploiement

### Avant déploiement

- [ ] Version identifiée.
- [ ] Changelog disponible.
- [ ] Migrations identifiées.
- [ ] Ordre de déploiement défini.
- [ ] Feature flags configurés.
- [ ] Variables d'environnement validées.
- [ ] Secrets présents.
- [ ] Sauvegarde vérifiée si nécessaire.
- [ ] Rollback documenté.
- [ ] Communication prévue.

### Pendant déploiement

- [ ] Health checks suivis.
- [ ] Migrations suivies.
- [ ] Logs suivis.
- [ ] Métriques suivies.
- [ ] Taux d'erreur suivi.
- [ ] Latence suivie.
- [ ] Backlog suivi.
- [ ] Alertes suivies.
- [ ] Aucun contrôle critique contourné.

### Après déploiement

- [ ] Smoke tests exécutés.
- [ ] Workflow principal vérifié.
- [ ] Permission vérifiée.
- [ ] Tenant isolation vérifiée.
- [ ] Job asynchrone vérifié.
- [ ] Logs vérifiés.
- [ ] Métriques vérifiées.
- [ ] Aucun incident détecté.
- [ ] Feature flag stabilisé.
- [ ] Rapport de déploiement produit.

## 30. Checklist rollback

- [ ] Le déclencheur de rollback est défini.
- [ ] Le décideur est identifié.
- [ ] La version précédente est disponible.
- [ ] La compatibilité DB est assurée.
- [ ] Les migrations ne rendent pas le rollback impossible.
- [ ] Les messages ou jobs en cours sont pris en compte.
- [ ] Les données écrites par la nouvelle version sont prises en compte.
- [ ] Les feature flags peuvent désactiver la fonctionnalité.
- [ ] La communication est prévue.
- [ ] Les vérifications post-rollback sont définies.
- [ ] Les preuves de l'incident sont conservées.
- [ ] Une stratégie de forward-fix existe si rollback impossible.

## 31. Checklist incident

### Containment

- [ ] L'impact est limité.
- [ ] La fonctionnalité peut être désactivée.
- [ ] Les accès suspects sont bloqués.
- [ ] Les secrets exposés sont révoqués.
- [ ] Les workers dangereux sont suspendus.
- [ ] Les données sont protégées.

### Diagnostic

- [ ] Heure de début estimée.
- [ ] Périmètre identifié.
- [ ] Tenants affectés identifiés.
- [ ] Utilisateurs affectés identifiés.
- [ ] Données affectées identifiées.
- [ ] Logs et traces conservés.
- [ ] Changements récents inspectés.
- [ ] Cause racine non supposée sans preuve.

### Communication

- [ ] Faits connus séparés des hypothèses.
- [ ] Gravité définie.
- [ ] Responsables informés.
- [ ] Mise à jour régulière.
- [ ] Impact client expliqué.
- [ ] Aucune information non vérifiée présentée comme certaine.

### Correction

- [ ] Correctif minimal préparé.
- [ ] Tests de non-régression ajoutés.
- [ ] Sécurité vérifiée.
- [ ] Tenant isolation vérifiée.
- [ ] Rollback ou forward-fix préparé.
- [ ] Déploiement suivi.

### Post-incident

- [ ] Cause racine documentée.
- [ ] Facteurs contributifs documentés.
- [ ] Actions correctives définies.
- [ ] Propriétaires attribués.
- [ ] Échéances définies.
- [ ] Runbooks mis à jour.
- [ ] Alertes améliorées.
- [ ] Standards mis à jour si nécessaire.

## 32. Checklist suppression de données

### Autorité

- [ ] La suppression est autorisée.
- [ ] La règle de rétention est connue.
- [ ] Le demandeur est identifié.
- [ ] Le périmètre tenant est vérifié.
- [ ] Les obligations d'audit sont connues.
- [ ] Une approbation de niveau 3 existe si nécessaire.

### Périmètre

- [ ] Base relationnelle.
- [ ] Fichiers.
- [ ] Versions de documents.
- [ ] Chunks.
- [ ] Embeddings.
- [ ] Caches.
- [ ] Projections.
- [ ] Exports.
- [ ] AI Runs.
- [ ] Résultats dérivés.
- [ ] Fournisseurs externes.
- [ ] Sauvegardes selon politique.

### Exécution

- [ ] Dry-run disponible.
- [ ] Nombre d'éléments estimé.
- [ ] Sauvegarde évaluée.
- [ ] Suppression par lots.
- [ ] Processus idempotent.
- [ ] Processus reprenable.
- [ ] Logs d'audit.
- [ ] Erreurs observables.
- [ ] Confirmation finale.

### Validation

- [ ] Données supprimées vérifiées.
- [ ] Index nettoyés.
- [ ] Cache invalidé.
- [ ] Retrieval ne retourne plus la donnée.
- [ ] Exports invalidés.
- [ ] Résultats dérivés traités.
- [ ] Rapport produit.

## 33. Checklist changement de dépendance structurante

- [ ] Le besoin est démontré.
- [ ] La solution actuelle est insuffisante.
- [ ] Des mesures ou contraintes réelles existent.
- [ ] Les alternatives sont documentées.
- [ ] Le coût de migration est estimé.
- [ ] Le coût récurrent est estimé en euros.
- [ ] La sécurité est évaluée.
- [ ] La confidentialité est évaluée.
- [ ] La résidence des données est évaluée.
- [ ] La disponibilité est évaluée.
- [ ] Le verrou fournisseur est évalué.
- [ ] Le plan de migration est défini.
- [ ] Le rollback est défini.
- [ ] Un ADR est rédigé.
- [ ] Une approbation de niveau 3 est obtenue.

## 34. Checklist feature flag

- [ ] Le flag a un nom explicite.
- [ ] Le propriétaire est identifié.
- [ ] L'objectif est documenté.
- [ ] La valeur par défaut est sûre.
- [ ] Le flag ne contourne pas une permission.
- [ ] Le flag ne contourne pas une règle métier.
- [ ] La stratégie de rollout est définie.
- [ ] La stratégie de rollback est définie.
- [ ] Les métriques de suivi sont définies.
- [ ] Les environnements sont configurés.
- [ ] La condition de suppression est définie.
- [ ] La date de réévaluation est définie.
- [ ] Les deux branches sont testées.

## 35. Checklist cache

- [ ] Le besoin de cache est démontré.
- [ ] La source autoritative est identifiée.
- [ ] La clé est définie.
- [ ] Le tenant est inclus.
- [ ] Les permissions sont prises en compte.
- [ ] Le TTL est défini.
- [ ] L'invalidation est définie.
- [ ] La cohérence attendue est définie.
- [ ] Les données sensibles sont chiffrées ou exclues.
- [ ] Le comportement en cas de panne est défini.
- [ ] Le stampede est évalué.
- [ ] Les métriques hit/miss existent.
- [ ] Les tests inter-tenant existent.
- [ ] La suppression de la source invalide le cache.

## 36. Checklist webhook

### Entrant

- [ ] Signature vérifiée.
- [ ] Timestamp vérifié.
- [ ] Protection anti-replay.
- [ ] Payload validé.
- [ ] Taille limitée.
- [ ] Identifiant fournisseur enregistré.
- [ ] Idempotence.
- [ ] Réponse rapide.
- [ ] Traitement asynchrone.
- [ ] Tenant résolu de manière sûre.
- [ ] Logs sans secret.
- [ ] Dead Letter.

### Sortant

- [ ] Destination autorisée.
- [ ] Secret de signature protégé.
- [ ] Payload minimal.
- [ ] Version du contrat.
- [ ] Timestamp.
- [ ] Identifiant de livraison.
- [ ] Timeout.
- [ ] Retry borné.
- [ ] Backoff.
- [ ] Idempotence côté réception documentée.
- [ ] Dead Letter.
- [ ] Historique de livraison.
- [ ] Mécanisme de rotation du secret.

## 37. Checklist export

- [ ] Permission d'export vérifiée.
- [ ] Tenant scope vérifié.
- [ ] Périmètre des données explicite.
- [ ] Données sensibles minimisées.
- [ ] Format documenté.
- [ ] Traitement asynchrone.
- [ ] Statut d'opération disponible.
- [ ] Fichier chiffré si nécessaire.
- [ ] URL signée courte.
- [ ] Expiration définie.
- [ ] Audit produit.
- [ ] Coût et volume évalués.
- [ ] Suppression automatique définie.
- [ ] Export obsolète identifiable.
- [ ] Test inter-tenant.

## 38. Checklist ADR

- [ ] Le contexte est expliqué.
- [ ] Le problème est clairement défini.
- [ ] Les contraintes sont listées.
- [ ] Les alternatives sont documentées.
- [ ] Les avantages sont documentés.
- [ ] Les risques sont documentés.
- [ ] Le coût est documenté.
- [ ] La sécurité est documentée.
- [ ] La migration est documentée.
- [ ] Le rollback est documenté.
- [ ] Les conséquences sont documentées.
- [ ] Le statut est défini.
- [ ] Le décideur est identifié.
- [ ] La date est enregistrée.
- [ ] Les documents affectés sont mis à jour.

## 39. Checklist rapport de mission

### Contenu

- [ ] Objectif.
- [ ] Travail réalisé.
- [ ] Fichiers modifiés.
- [ ] Décisions techniques.
- [ ] Niveaux d'autonomie.
- [ ] Données et migrations.
- [ ] Permissions.
- [ ] Multi-tenancy.
- [ ] Tests exécutés.
- [ ] Résultats vérifiés.
- [ ] Éléments non vérifiés.
- [ ] Risques.
- [ ] Documentation mise à jour.
- [ ] Actions restantes.
- [ ] Validations requises.

### Honnêteté

- [ ] Aucun test non exécuté n'est déclaré réussi.
- [ ] Aucun build non exécuté n'est déclaré réussi.
- [ ] Aucune migration non vérifiée n'est déclarée sûre.
- [ ] Aucune hypothèse n'est présentée comme un fait.
- [ ] Aucun risque connu n'est masqué.
- [ ] Aucun blocage n'est minimisé.
- [ ] Les limitations de l'environnement sont déclarées.

## 40. Checklist finale de livraison

### Produit

- [ ] Le besoin est satisfait.
- [ ] Le comportement est conforme.
- [ ] Le périmètre est respecté.
- [ ] Aucun comportement implicite.
- [ ] Les critères d'acceptation sont satisfaits.

### Métier

- [ ] Les Business Rules sont respectées.
- [ ] Les transitions sont correctes.
- [ ] Les erreurs métier sont correctes.
- [ ] L'historique est correct.
- [ ] Les événements sont corrects.

### Sécurité

- [ ] Authentification.
- [ ] Autorisation.
- [ ] Tenant isolation.
- [ ] Validation.
- [ ] Secrets.
- [ ] Logs.
- [ ] Données sensibles.
- [ ] Dépendances.
- [ ] Appels externes.
- [ ] Uploads.

### Architecture

- [ ] Modular Monolith respecté.
- [ ] Frontières respectées.
- [ ] Domain indépendant.
- [ ] Controllers fins.
- [ ] Prisma isolé.
- [ ] Pas d'abstraction prématurée.
- [ ] Pas de technologie non approuvée.

### Données

- [ ] Contraintes.
- [ ] Transactions.
- [ ] Concurrence.
- [ ] Migration.
- [ ] Backfill.
- [ ] Rollback.
- [ ] Rétention.
- [ ] Suppression.

### Asynchrone

- [ ] Idempotence.
- [ ] Timeout.
- [ ] Retry borné.
- [ ] Dead Letter.
- [ ] États.
- [ ] Reprise.
- [ ] Observabilité.

### IA

- [ ] AI Gateway.
- [ ] Skill versionné.
- [ ] Tenant et permissions.
- [ ] Sortie structurée.
- [ ] Citations.
- [ ] Coût.
- [ ] Limites.
- [ ] Validation humaine.
- [ ] Évaluations.

### Qualité

- [ ] Code lisible.
- [ ] Typage strict.
- [ ] Tests significatifs.
- [ ] Chemins négatifs.
- [ ] Pas de code mort.
- [ ] Pas de catch vide.
- [ ] Pas de dette critique.
- [ ] Documentation à jour.

### Validation technique

- [ ] Format.
- [ ] Lint.
- [ ] Type check.
- [ ] Unit tests.
- [ ] Integration tests.
- [ ] Contract tests.
- [ ] E2E tests.
- [ ] Build.
- [ ] Migration validation.
- [ ] Security checks.

### Exploitation

- [ ] Logs.
- [ ] Métriques.
- [ ] Traces.
- [ ] Alertes.
- [ ] Dashboard.
- [ ] Runbook.
- [ ] Rollback.
- [ ] Propriétaire.

### Gouvernance

- [ ] Décisions classées.
- [ ] Niveau 2 annoncé.
- [ ] Niveau 3 approuvé.
- [ ] ADR accepté.
- [ ] Risques déclarés.
- [ ] Rapport final produit.

## 41. Conditions bloquantes

La livraison doit être bloquée lorsqu'au moins une condition suivante est vraie :

- [ ] Une Business Rule critique est absente ou ambiguë.
- [ ] Une permission critique est absente ou ambiguë.
- [ ] Une contradiction documentaire n'est pas résolue.
- [ ] Une fuite inter-tenant est possible.
- [ ] Une perte de données est possible sans approbation.
- [ ] Une migration destructive n'est pas approuvée.
- [ ] Un secret est exposé.
- [ ] Une vulnérabilité critique est connue.
- [ ] Un test critique échoue.
- [ ] Une sortie IA critique n'est pas validée.
- [ ] Une action autonome IA non approuvée existe.
- [ ] Une dépendance structurante n'est pas approuvée.
- [ ] Un contrat public est rompu sans stratégie.
- [ ] Le rollback est impossible et non accepté.
- [ ] L'observabilité minimale est absente.
- [ ] Les validations minimales n'ont pas pu être exécutées.
- [ ] Une demande exige de masquer un échec.

## 42. Definition of Done condensée

Une mission est terminée lorsque :

Business intent is implemented
+
Rules are protected
+
Permissions are enforced
+
Tenant isolation is verified
+
Data integrity is preserved
+
Tests pass
+
Build passes
+
Migrations are safe
+
Errors are observable
+
Documentation is current
+
Risks are declared
+
Report is honest

## 43. Critères d'acceptation

Ce document est correctement appliqué lorsque :

- les checklists sont adaptées au risque ;
- les points critiques sont vérifiés avant livraison ;
- les éléments non applicables sont explicitement marqués ;
- les éléments non vérifiés sont déclarés ;
- les conditions bloquantes arrêtent la livraison ;
- les permissions et le multi-tenant sont systématiquement testés ;
- les migrations sont évaluées pour la production ;
- les workflows asynchrones sont idempotents et observables ;
- les usages IA restent contrôlés ;
- le rapport final reflète fidèlement les validations réalisées.
