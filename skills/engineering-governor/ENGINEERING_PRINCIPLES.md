# TenderOS — Engineering Principles

Version : 1.0
Statut : Draft
Rôle concerné : Engineering Governor
Document parent : `skills/engineering-governor/SKILL.md`

---

## 1. Objectif

Ce document définit les principes d'ingénierie que l'Engineering Governor applique à toute décision, conception, implémentation et revue dans TenderOS.

Ces principes servent à : arbitrer entre plusieurs solutions valides ; réduire la complexité inutile ; protéger l'intégrité métier ; préserver l'isolation multi-tenant ; faciliter les tests ; maintenir une architecture cohérente ; améliorer la sécurité ; garantir l'exploitabilité ; éviter les décisions techniques opportunistes.

Ils complètent `ENGINEERING_STANDARDS.md`. En cas de contradiction, les documents d'autorité supérieurs prévalent.

---

## 2. Ordre de priorité

```text
1. Sécurité
2. Intégrité métier
3. Isolation multi-tenant
4. Intégrité des données
5. Simplicité
6. Maintenabilité
7. Testabilité
8. Observabilité
9. Réversibilité
10. Performance mesurée
11. Coût maîtrisé
12. Vitesse d'implémentation
```

La vitesse ne justifie jamais : une faille ; une fuite inter-tenant ; une perte de données ; un contournement métier ; une permission absente ; une migration dangereuse ; une sortie IA non contrôlée.

---

## 3. Correctness before cleverness

Une solution correcte, claire et prévisible est préférable à une solution brillante mais difficile à comprendre.

Préférer : des règles explicites ; des méthodes métier nommées ; des contrats simples ; des branches lisibles ; des erreurs identifiables ; des flux déterministes.

Éviter : la métaprogrammation inutile ; les abstractions opaques ; les conventions implicites ; les fonctions génériques excessives ; les comportements magiques ; les optimisations non mesurées.

Une solution sophistiquée doit démontrer une valeur supérieure réelle.

---

## 4. Business intent before CRUD

```typescript
// Préférer
shortlistTender(command);
approveProposal(command);
recordSubmission(command);
resolveBlockingComment(command);

// Éviter
updateTender(id, { status: "SHORTLISTED" });
```

Les actions métier explicites permettent : de protéger les invariants ; d'appliquer les permissions ; de produire les événements ; d'auditer les décisions ; de tester le comportement ; de conserver un vocabulaire cohérent.

---

## 5. Domain before infrastructure

Le Domain ne dépend pas de : NestJS ; Prisma ; HTTP ; PostgreSQL ; Redis ; React ; fournisseurs IA ; systèmes de queue.

L'infrastructure s'adapte au Domain. Le Domain ne doit pas devenir une projection des tables.

---

## 6. Explicit over implicit

```typescript
// Préférer
execute({ organizationId, actorId, tenderId });

// Éviter
execute(tenderId); // avec un contexte tenant caché dans une variable globale
```

Sont notamment explicites : l'organisation ; l'acteur ; la permission ; la version attendue ; la transaction ; l'idempotency key ; le contexte de sécurité ; la provenance d'une donnée ; le niveau de confidentialité.

---

## 7. Tenant scope everywhere

L'isolation multi-tenant traverse :

```text
API, Application, Domain services, Repositories, Database,
Cache, Queues, Workers, Events, Files, Search, RAG, AI,
Exports, Logs, Metrics
```

Toute ressource tenant-scoped doit être manipulée avec un `organizationId` explicite. Une ressource ne doit jamais être chargée uniquement par son identifiant global lorsque le tenant est connu.

---

## 8. Server-side authority

Le serveur est l'autorité pour : les permissions ; les transitions ; les règles métier ; la validation finale ; les quotas ; les décisions critiques ; l'accès aux documents ; le tenant scope.

Le frontend améliore l'expérience. Il ne constitue pas une frontière de sécurité. Un bouton caché ne remplace jamais une autorisation serveur.

---

## 9. Simple before generic

Ne pas créer immédiatement : un generic repository universel ; un event bus générique complexe ; une couche de règles abstraite ; un moteur de workflow ; un système de plugins ; une DSL ; un framework interne.

Une abstraction devient pertinente lorsque : plusieurs cas réels existent ; les variations sont connues ; le coût de duplication devient mesurable ; l'interface peut rester stable ; son propriétaire est clair.

---

## 10. Reasonable duplication before premature coupling

Une petite duplication locale est souvent préférable à une abstraction partagée prématurée. Une abstraction mal conçue peut : coupler des modules ; masquer des différences métier ; compliquer les évolutions ; créer un propriétaire ambigu ; devenir un point de dépendance central.

La duplication devient problématique lorsqu'elle : reproduit une règle métier ; provoque des incohérences ; apparaît dans plusieurs modules ; entraîne des corrections répétées ; compromet la sécurité.

---

## 11. Modular Monolith before microservices

TenderOS démarre comme Modular Monolith : simplicité opérationnelle ; transactions locales ; vitesse de développement ; cohérence du Domain ; facilité de débogage ; coût d'infrastructure réduit.

Un microservice n'est justifié que par : une autonomie d'équipe ; une charge spécifique ; une isolation de sécurité ; un cycle de déploiement distinct ; une contrainte réglementaire ; un besoin de résilience indépendant.

La taille du code seule ne justifie pas un microservice.

---

## 12. PostgreSQL before additional infrastructure

PostgreSQL est la solution par défaut pour : données relationnelles ; recherche structurée ; full-text search initiale ; événements Outbox ; queues simples selon le besoin ; embeddings avec pgvector ; audit ; projections ; verrous ; concurrence.

Avant d'ajouter OpenSearch, une base vectorielle dédiée, Kafka, une base NoSQL, un nouveau moteur de queue — il faut démontrer que PostgreSQL ne satisfait plus raisonnablement le besoin.

---

## 13. Ports and adapters

```typescript
interface TenderRepository {}
interface ObjectStorage {}
interface EmailSender {}
interface AIGateway {}
interface EventPublisher {}
```

Les adapters implémentent ces ports. Cela permet : de tester sans fournisseur réel ; de changer d'infrastructure ; d'isoler les erreurs externes ; de garder le Domain indépendant ; de réduire le verrou fournisseur.

Tous les détails ne nécessitent pas une interface. Une interface est justifiée lorsqu'elle protège une frontière significative.

---

## 14. Thin controllers

```text
Authenticate
→ Parse
→ Validate
→ Build command/query
→ Call use case
→ Present response
```

Un contrôleur ne doit pas : appliquer les règles métier ; ouvrir plusieurs repositories ; gérer une transaction ; modifier directement un statut ; appeler Prisma ; appeler un fournisseur externe ; produire manuellement des événements métier.

---

## 15. Use cases as application boundary

Les use cases orchestrent : contexte acteur ; permission ; tenant ; chargement ; Domain ; transaction ; audit ; Outbox ; résultat.

```text
Préférer : CreateManualTender, ShortlistTender, RecordGoNoGoDecision,
           CreateWorkspace, ApproveProposal, GenerateSubmissionPackage

Éviter   : UpdateEntity, ProcessData, HandleAction, ManageTender
```

---

## 16. Aggregate boundaries matter

Les agrégats doivent protéger des invariants cohérents. Une transaction ne doit pas charger un graphe complet sans nécessité.

Les frontières doivent limiter : les écritures concurrentes ; les transactions trop larges ; les dépendances ; les cascades ; la complexité des tests.

Une relation métier n'implique pas forcément un agrégat unique.

---

## 17. State transitions are behavior

```typescript
// Préférer
tender.shortlist({ actorId, reason, occurredAt });

// Éviter
tender.status = TenderStatus.SHORTLISTED;
```

Une transition peut exiger : un état source autorisé ; une permission ; une justification ; une date ; un historique ; un événement ; une validation.

---

## 18. Invariants close to the data they protect

Exemples : invariant d'un Value Object dans le Value Object ; transition d'un agrégat dans l'agrégat ; permission dans une policy applicative ; unicité dans la base ; validation de transport dans le DTO ; règle inter-agrégats dans un use case ou Domain Service.

Éviter de dupliquer la même règle dans plusieurs couches.

---

## 19. Validate at every external boundary

Toutes les entrées externes sont non fiables : HTTP ; événements ; jobs ; fichiers ; webhooks ; variables d'environnement ; réponses fournisseur ; sorties IA ; données importées ; paramètres CLI.

La validation syntaxique intervient à la frontière. La validation métier intervient ensuite dans l'Application ou le Domain.

---

## 20. Make invalid states hard to represent

```typescript
// Préférer
type CurrencyCode = "EUR" | "USD" | "GBP";

class Money {
  private constructor(
    readonly amount: Decimal,
    readonly currency: CurrencyCode,
  ) {}
}
```

Cette règle doit rester proportionnée. Tous les champs ne nécessitent pas une classe dédiée.

---

## 21. Types are design tools

TypeScript strict est obligatoire. Le typage doit : exprimer les contraintes ; différencier les identifiants ; réduire les valeurs ambiguës ; empêcher les états impossibles ; clarifier les résultats ; faciliter le refactoring.

Éviter : `any` ; casts excessifs ; types génériques non contraints ; objets partiels utilisés comme entités ; chaînes arbitraires pour les statuts.

---

## 22. Errors are part of the contract

Le système doit distinguer : Validation error, Authorization error, Business conflict, Not found, Concurrency conflict, External dependency failure, Internal error.

Les erreurs doivent : avoir un code stable ; être testables ; être mappées correctement vers l'API ; ne pas exposer de détails internes ; conserver un requestId ; être observables.

---

## 23. Fail closed

En cas d'incertitude sur : une permission ; un tenant ; une signature ; une version ; une validation ; un niveau de confidentialité — le système doit refuser l'opération.

```text
Permission inconnue     → refuser
Tenant absent           → refuser
Webhook non signé       → refuser
Output IA invalide      → refuser l'exploitation
```

---

## 24. Secure by default

Exemples : endpoint authentifié par défaut ; permissions minimales ; CORS limité ; cookies sécurisés ; logs redacted ; fichier privé ; URL signée courte ; aucune action autonome IA ; aucune exposition publique implicite ; aucune donnée sensible dans les erreurs.

Une ouverture doit être explicite et documentée.

---

## 25. Least privilege

Concerne : utilisateurs ; rôles ; workers ; comptes techniques ; agents IA ; clés API ; buckets ; bases ; pipelines CI ; environnements.

Une permission large accordée « temporairement » doit être traitée comme une dette de sécurité.

---

## 26. Defense in depth

```text
Authentication
+ Membership check
+ Permission policy
+ Repository tenant filter
+ Database constraint
+ Audit
+ Tests inter-tenant
```

Chaque couche réduit le risque d'une erreur dans une autre couche.

---

## 27. Data minimization

Concerne : API ; logs ; événements ; exports ; IA ; RAG ; webhooks ; analytics ; audit ; notifications.

Moins de données signifie : moins de risque ; moins de coût ; moins de complexité ; moins d'impact en cas d'incident.

---

## 28. Data ownership is explicit

Chaque donnée doit avoir : un module propriétaire ; un tenant ; une source ; une politique de modification ; une politique de suppression ; une politique d'historisation ; une politique de rétention.

Un module ne doit pas modifier directement les données privées d'un autre module. Il doit utiliser : une API applicative ; un port ; un événement ; une projection autorisée.

---

## 29. Database constraints are allies

Utiliser lorsque pertinent : `NOT NULL` ; clés étrangères ; contraintes uniques ; checks ; versions ; index ; transactions.

La validation applicative améliore les messages. Elle ne remplace pas une contrainte structurelle lorsque celle-ci est possible.

---

## 30. Safe migrations

```text
Expand
→ Backfill
→ Switch
→ Contract
```

Éviter dans une seule étape : ajouter une colonne obligatoire sur une grande table ; réécrire toutes les lignes ; supprimer immédiatement un champ ; changer un type incompatible ; bloquer longtemps la table.

Une migration doit être conçue pour la production, pas uniquement pour une base vide.

---

## 31. Transactions are deliberate

Une transaction ne doit pas inclure : appel IA ; email ; webhook ; upload ; appel réseau ; traitement PDF long ; génération de fichier lourde.

```text
Transaction métier + Outbox → Traitement asynchrone
```

---

## 32. Concurrency is a product concern

Utiliser selon le besoin : version optimiste ; `If-Match` ; verrou applicatif ; contrainte unique ; transaction ; idempotency key.

Une écriture silencieusement écrasée est souvent un défaut produit, pas seulement technique.

---

## 33. Idempotency by design

Cas fréquents : workers ; webhooks ; imports ; analyses IA ; génération de package ; synchronisations ; commandes client avec retry.

L'idempotence doit être conçue avant les retries. Un retry sans idempotence peut dupliquer des effets métier.

---

## 34. At-least-once is the default assumption

```text
At least once delivery
```

Éviter de promettre du exactly-once sans preuve complète. La déduplication, l'idempotence et les contraintes doivent protéger le système.

---

## 35. Events describe facts

```text
Préférer : TenderShortlisted, ProposalApproved, SubmissionRecorded
Éviter   : ShortlistTender, ApproveProposal, RecordSubmission
```

Les seconds sont des commandes. Un événement ne doit pas devenir un moyen indirect de contourner un use case.

---

## 36. Event contracts evolve carefully

Toute modification doit évaluer : version ; compatibilité ; consommateurs ; replays ; rétention ; données sensibles ; ordre ; causalité.

Un champ optionnel est généralement plus sûr qu'un changement de signification.

---

## 37. Async for long-running work

Un traitement doit devenir asynchrone lorsqu'il : dépasse une latence utilisateur raisonnable ; dépend d'un service externe lent ; nécessite des retries ; consomme beaucoup de ressources ; génère un fichier ; réalise de l'OCR ; appelle un modèle ; traite un lot.

L'utilisateur doit pouvoir suivre : l'état ; la progression ; l'échec ; le résultat ; l'obsolescence.

---

## 38. Bounded retries

```text
maxAttempts
timeout
backoff
jitter
retryableErrors
deadLetterPolicy
```

Ne pas retry : une permission refusée ; une validation invalide ; un budget dépassé ; un conflit métier permanent ; une donnée absente sans possibilité de changement.

---

## 39. Timeouts everywhere

Tout appel externe doit avoir un timeout explicite : base distante ; fournisseur IA ; stockage ; email ; webhook ; service d'identité ; API partenaire ; OCR.

Un timeout doit produire une erreur identifiable et observable.

---

## 40. Graceful degradation

```text
IA indisponible          : permettre le travail manuel
Email indisponible       : conserver l'événement et retry
Recherche dégradée       : proposer des filtres structurés
Analytics indisponible   : ne pas bloquer le métier
```

La dégradation ne doit pas réduire silencieusement la sécurité.

---

## 41. Observability is a feature

Il faut pouvoir répondre à : Que s'est-il passé ? Pour quel tenant ? Pour quel acteur ? À quel moment ? Combien de temps ? Avec quel résultat ? Quelle erreur ? Peut-on rejouer ?

Éléments utiles : logs structurés ; métriques ; traces ; audit ; requestId ; correlationId ; dashboards ; alertes.

---

## 42. Logs are not a database

Les logs ne doivent pas devenir : la source d'un historique métier ; un substitut à l'audit ; un stockage documentaire ; un stockage de payload complet ; une source de données client.

Les données métier importantes doivent être persistées dans des structures adaptées.

---

## 43. Audit is not logging

Un Audit Log répond à : qui ; quoi ; quand ; sur quelle ressource ; dans quelle organisation ; avec quel résultat.

Il doit être : structuré ; durable ; protégé ; consultable selon permissions ; produit dans la transaction lorsque nécessaire.

---

## 44. Test behavior, not implementation

```text
Préférer : "Un utilisateur sans permission ne peut pas approuver."
Éviter   : "La méthode X a été appelée une fois."
```

Les mocks doivent rester utiles mais ne pas remplacer l'observation du comportement.

---

## 45. Test the negative paths

Tester notamment : autre tenant ; permission absente ; statut incompatible ; ressource supprimée ; version obsolète ; doublon ; retry ; timeout ; sortie IA invalide ; fichier malveillant ; quota dépassé.

---

## 46. Deterministic tests

Contrôler : l'heure ; les UUID ; les données ; les services externes ; les files d'attente ; les retries ; les résultats IA ; les fuseaux horaires.

Un test flaky est un défaut à corriger, pas une fatalité.

---

## 47. Test pyramid with risk awareness

```text
Many unit tests
+ Focused integration tests
+ Contract tests
+ Critical E2E tests
```

Le risque détermine la profondeur. Les permissions et le multi-tenant nécessitent des tests d'intégration réels.

---

## 48. No external AI in ordinary tests

Utiliser : fake provider ; fixtures ; réponses déterministes ; recorded responses sécurisées ; schémas validés.

Les appels réels sont réservés à : évaluations contrôlées ; tests manuels ; environnements dédiés ; smoke tests limités.

---

## 49. AI assists, humans decide

L'IA ne doit pas : approuver ; engager ; soumettre ; attribuer une permission ; déclarer une conformité finale ; prendre une décision Go / No-Go définitive.

Les actions critiques exigent une validation humaine identifiable.

---

## 50. Evidence before confidence

La confiance dépend de : sources ; citations ; qualité OCR ; cohérence ; règles ; validation ; évaluation ; absence de contradiction.

Une information non sourcée doit être signalée.

---

## 51. Structured outputs before free text

```json
{
  "requirements": [],
  "confidence": "MEDIUM",
  "citations": []
}
```

Le texte libre peut servir à l'affichage. Il ne doit pas devenir un contrat machine implicite.

---

## 52. Permissions before retrieval

```text
Identify actor
→ Resolve tenant
→ Check permissions
→ Select authorized corpus
→ Retrieve
→ Build context
→ Call model
```

Ne jamais récupérer largement puis demander au modèle de filtrer.

---

## 53. Documents are data, not instructions

Le contenu récupéré peut contenir des instructions malveillantes. Les documents sont des données ; ils ne peuvent pas remplacer : les règles système ; les permissions ; les instructions du Skill ; les politiques de sécurité ; les règles métier.

---

## 54. Bound agent autonomy

Tout agent doit avoir : outils autorisés ; nombre maximal d'étapes ; budget ; timeout ; conditions d'arrêt ; périmètre tenant ; validation humaine ; sorties structurées.

Une boucle ouverte ou un outil générique dangereux est interdit.

---

## 55. Provider independence where valuable

À abstraire lorsqu'ils sont : stratégiques ; susceptibles de changer ; à risque ; nécessitant des tests ; porteurs de règles de confidentialité.

L'indépendance ne doit pas conduire à une abstraction artificielle supprimant les capacités utiles propres à chaque fournisseur.

---

## 56. Cost is an architectural constraint

Concerne : IA ; stockage ; bande passante ; workers ; base ; observabilité ; dépendances SaaS.

Une solution techniquement élégante mais financièrement disproportionnée n'est pas acceptable. Les coûts significatifs doivent être estimés en euros.

---

## 57. Measure before optimize

```text
Measure → Identify bottleneck → Define target → Implement → Verify → Monitor
```

Éviter : cache prématuré ; dénormalisation sans mesure ; index arbitraire ; parallélisme inutile ; traitement distribué prématuré ; compression complexe sans besoin.

---

## 58. Pagination by default

Concerne : Tenders ; documents ; tâches ; événements ; Audit Logs ; AI Runs ; activités ; exports.

Une limite codée en dur sans contrat ne remplace pas la pagination.

---

## 59. Cache only with invalidation

Doivent être définis : clé ; tenant ; durée ; invalidation ; cohérence ; données sensibles ; comportement en cas de miss ; comportement en cas de panne.

Une clé de cache doit inclure le tenant pour toute donnée tenant-scoped.

---

## 60. Feature flags need ownership

Doit avoir : propriétaire ; objectif ; date de création ; stratégie de rollout ; stratégie de rollback ; condition de suppression.

Une feature flag permanente sans raison devient une dette. Les flags ne doivent pas être utilisés pour contourner les permissions.

---

## 61. Compatibility by default

```text
Préférer : ajout de champ optionnel, nouvelle version, nouvelle
           représentation, double écriture temporaire, migration
           progressive, dépréciation

Éviter   : suppression silencieuse, changement de sémantique,
           type modifié, erreur renommée, événement incompatible
```

---

## 62. Reversibility matters

Difficiles à inverser : choix de base ; modèle multi-tenant ; contrat public ; fournisseur stratégique ; données exposées ; migration destructive.

Ces décisions exigent : plus d'analyse ; alternatives ; tests ; approbation ; ADR ; plan de migration ; rollback.

---

## 63. Small vertical slices

Un vertical slice inclut :

```text
Domain, Application, Infrastructure, API, Permissions,
Tenant, Tests, Observability, Documentation
```

Exemple : `Create Manual Tender` est préférable à la création anticipée de nombreux modules vides.

---

## 64. Deliver usable increments

Éviter les étapes qui produisent uniquement : architecture vide ; interfaces sans implémentation ; tables non utilisées ; endpoints fictifs ; abstractions spéculatives ; infrastructure sans workflow.

L'infrastructure doit suivre un besoin produit concret.

---

## 65. Keep changes focused

Éviter : refactoring transversal non requis ; renommage massif ; mise à jour de dépendances sans lien ; changement de style global ; ajout de fonctionnalités adjacentes ; nouvelle abstraction non nécessaire.

Les améliorations importantes découvertes doivent être documentées séparément.

---

## 66. Boy Scout Rule with boundaries

Acceptable : nom plus clair ; test manquant ; petit nettoyage ; erreur mieux gérée ; duplication locale supprimée.

Ne justifie pas : une réécriture ; un changement architectural ; une migration ; une modification métier ; un élargissement significatif du périmètre.

---

## 67. Document why, not what

La documentation doit expliquer : pourquoi ce choix ; quelles contraintes ; quelles alternatives ; quel compromis ; quelle limitation ; quelle stratégie de migration.

Éviter les commentaires qui répètent le code.

---

## 68. ADR for structural decisions

Exemples : nouvelle technologie ; changement de fournisseur ; modification de frontière ; choix de stockage ; stratégie multi-tenant ; stratégie d'authentification ; architecture IA ; nouvelle infrastructure distribuée.

Un ADR doit documenter les conséquences, pas seulement la solution retenue.

---

## 69. Configuration is validated code

Les variables d'environnement doivent être : documentées ; validées au démarrage ; typées ; séparées par environnement ; sans valeur secrète par défaut ; limitées au module concerné.

Une application ne doit pas démarrer avec une configuration critique invalide.

---

## 70. Secrets never enter source control

Interdit dans Git : clés API ; mots de passe ; tokens ; certificats privés ; URLs signées ; credentials de test réels.

Les exemples utilisent des valeurs fictives clairement identifiées.

---

## 71. Dependency restraint

Avant ajout, demander : Le besoin est-il réel ? Une API native suffit-elle ? Le package est-il maintenu ? Sa licence est-elle compatible ? Peut-il être isolé ? Peut-il être supprimé facilement ?

---

## 72. Upgrade deliberately

```text
Patch, Minor, Major, Security
```

Une mise à jour majeure doit vérifier : breaking changes ; migration ; tests ; build ; production behavior ; rollback.

Les upgrades de sécurité critiques peuvent être prioritaires, mais doivent rester vérifiés.

---

## 73. No silent failures

```typescript
// Interdit
try {
  await operation();
} catch {}
```

Toute erreur doit être traitée ; propagée ; transformée ; loggée de manière sûre ; métriquée ; envoyée en Dead Letter — selon son contexte.

---

## 74. Honest completion

Distinguer : Implemented, Tested, Built, Reviewed, Documented, Deployed, Verified in production.

Ne jamais déclarer : un test réussi sans l'avoir exécuté ; un build réussi sans l'avoir exécuté ; une migration sûre sans l'avoir analysée ; un comportement vérifié sans preuve.

---

## 75. Production is a different environment

Tenir compte de : volumes réels ; concurrence ; latence ; pannes ; données historiques ; versions coexistantes ; déploiements progressifs ; secrets ; observabilité ; rollback.

Une solution fonctionnant uniquement sur une base vide n'est pas production-ready.

---

## 76. Operability before scale

Il faut pouvoir : identifier un incident ; suivre un job ; rejouer un événement ; diagnostiquer une erreur ; annuler une opération ; comprendre le coût ; vérifier un tenant ; restaurer une donnée.

Une architecture scalable mais opaque n'est pas mature.

---

## 77. Backups require restore tests

Définir : fréquence ; rétention ; chiffrement ; RPO ; RTO ; accès ; tests de restauration ; responsabilités.

Le simple fait qu'un fournisseur annonce des backups n'est pas une preuve suffisante.

---

## 78. Security fixes may override normal sequencing

Une correction urgente doit rester : réversible ; documentée ; testée ; limitée ; suivie d'une analyse.

L'urgence ne justifie pas de masquer l'incident ou d'ignorer les conséquences.

---

## 79. No hidden global state

Sensibles : tenant courant ; utilisateur courant ; timezone ; locale ; transaction ; feature flags ; configuration ; cache.

Le contexte doit être transmis explicitement ou géré dans une infrastructure clairement contrôlée.

---

## 80. Time is a dependency

```typescript
interface Clock {
  now(): Date;
}
```

Facilite : tests ; échéances ; transitions ; expiration ; audit ; retries ; fuseaux horaires.

Éviter l'utilisation dispersée de `new Date()` dans le Domain.

---

## 81. IDs are opaque

Un client ne doit pas déduire : organisation ; permission ; ordre ; type ; date ; statut, à partir d'un identifiant.

Les règles reposent sur les données, pas sur l'interprétation d'un identifiant.

---

## 82. Money requires precision

```json
{ "amount": "150000.0000", "currency": "EUR" }
```

Utiliser : type décimal ; chaîne dans les contrats ; devise explicite ; règles d'arrondi documentées. Ne jamais supposer une devise implicite.

---

## 83. Dates require semantics

```text
Date only, Timestamp, Deadline, Official timezone, User timezone, System timestamp
```

Les timestamps sont stockés en UTC. Les échéances officielles conservent le fuseau pertinent. Ne pas convertir silencieusement une échéance métier en simple date locale.

---

## 84. Files are hostile inputs

Un fichier peut être : mal formé ; trop volumineux ; mal typé ; infecté ; trompeur ; chiffré ; corrompu ; conçu pour épuiser les ressources.

Le pipeline doit vérifier : taille ; MIME réel ; extension ; checksum ; antivirus ; quotas ; permissions ; tenant ; statut d'upload.

---

## 85. Signed URLs are temporary capabilities

Une URL signée doit être : courte durée ; limitée à une opération ; générée après autorisation ; non persistée durablement ; absente des logs ; renouvelable uniquement après nouveau contrôle.

---

## 86. External calls are untrusted

Le système doit gérer : format inattendu ; timeout ; erreur ; duplication ; données manquantes ; contenu malveillant ; incompatibilité de version.

---

## 87. Webhooks are messages, not trusted calls

Un webhook entrant doit être : signé ; daté ; protégé contre le replay ; validé ; enregistré avec un identifiant ; traité de manière idempotente ; déplacé vers un worker.

Une réponse rapide 2xx ne signifie pas que le workflow métier est terminé.

---

## 88. APIs are products

Une API doit offrir : cohérence ; documentation ; stabilité ; erreurs utiles ; exemples ; compatibilité ; limites claires ; dépréciation.

Une API interne mal conçue devient rapidement un contrat difficile à changer.

---

## 89. UI reflects business state

Éviter : les statuts calculés uniquement visuellement ; les optimismes non réconciliés ; les permissions supposées ; les résultats IA présentés comme validés ; les opérations asynchrones présentées comme terminées.

```text
Queued, Running, Succeeded, Failed, Proposed, Validated, Obsolete
```

---

## 90. Accessibility is quality

Vérifier : navigation clavier ; focus ; labels ; contrastes ; structure sémantique ; messages d'erreur ; annonces d'état ; alternatives textuelles.

Elle ne doit pas être reportée comme une finition facultative.

---

## 91. Internationalization requires intent

Séparer `errorCode` de `localizedMessage`. Les données métier ne doivent pas être traduites automatiquement sans règle explicite.

---

## 92. Privacy by design

Vérifier : nécessité ; finalité ; accès ; durée ; export ; suppression ; journalisation ; chiffrement ; transfert externe ; utilisation IA.

Ne pas collecter une donnée « au cas où ».

---

## 93. Deletion is a workflow

Peut affecter : base ; fichiers ; chunks ; embeddings ; caches ; exports ; logs ; résultats IA ; sauvegardes ; fournisseurs externes.

Elle doit être conçue comme un workflow traçable. Un simple `DELETE` SQL ne suffit pas.

---

## 94. Historical truth must be preserved

Exemples : statut Tender ; décision Go / No-Go ; approbation ; version documentaire ; soumission ; rôle ; dérogation ; validation IA.

L'état courant seul ne permet pas toujours de comprendre une décision passée.

---

## 95. Current state and history are different models

Le modèle courant optimise l'usage quotidien. L'historique optimise : audit ; explication ; conformité ; reconstruction ; analyse.

Ne pas surcharger une seule table pour remplir imparfaitement les deux rôles.

---

## 96. Projections are disposable, source data is not

Une projection de lecture peut être reconstruite. Elle ne doit pas devenir la seule source d'une donnée métier critique.

---

## 97. Shared code needs an owner

Doit avoir : une responsabilité ; un propriétaire ; des consommateurs connus ; un contrat stable ; des limites.

Un répertoire `shared` sans gouvernance devient un point de couplage incontrôlé.

---

## 98. Naming is architecture

```text
Préférer : GoNoGoDecision, SubmissionPackage, EvaluationCriterion, BlockingComment
Éviter   : DecisionData, PackageManager, CriteriaItem, CommentFlag
```

---

## 99. Small functions, meaningful units

La taille seule ne constitue pas une règle. Une fonction longue peut être claire ; une fonction courte peut être abstraite inutilement.

Extraire lorsqu'il existe : une responsabilité ; un nom métier ; une réutilisation réelle ; un besoin de test isolé ; une réduction claire de complexité.

---

## 100. Comments explain constraints

```text
Pourquoi cette transaction est séparée
Pourquoi cet index existe
Pourquoi ce retry est limité
Pourquoi cette validation est nécessaire
Pourquoi une approche plus simple ne suffit pas
```

Un commentaire ne doit pas masquer du code difficile à comprendre.

---

## 101. Minimize mutable state

Préférer : objets immuables ; commandes explicites ; résultats nouveaux ; transactions courtes ; événements immuables.

Les agrégats peuvent muter leur état interne à travers des méthodes contrôlées.

---

## 102. Side effects at the edges

Le cœur métier doit rester déterministe autant que possible. Effets concernés : réseau ; fichiers ; email ; base ; queue ; IA ; temps réel ; analytics.

---

## 103. Pure core, imperative shell

```text
Pure business logic (inside)
+
Imperative orchestration (outside)
```

Ce principe ne doit pas conduire à une architecture artificiellement fonctionnelle.

---

## 104. Prefer composition

Utiliser l'héritage uniquement lorsqu'il existe une relation stable et réelle de spécialisation.

Éviter : base services génériques ; base repositories ; base controllers ; héritages destinés uniquement au partage de quelques méthodes.

---

## 105. Avoid boolean blindness

```typescript
// Éviter
generateProposal(true, false);

// Préférer
generateProposal({
  includeCitations: true,
  overwriteExistingDraft: false,
});
```

---

## 106. Commands and queries are different

Les séparer améliore : l'intention ; les permissions ; les transactions ; les caches ; les tests ; l'observabilité.

Cela n'impose pas nécessairement une infrastructure CQRS complexe.

---

## 107. Read models may differ from write models

Des read models dédiés sont acceptables pour : dashboards ; recherche ; listes ; reporting ; suivi d'activité.

Ils doivent toujours respecter le tenant et les permissions.

---

## 108. Avoid distributed transactions

Coordonner par : Outbox ; événements ; idempotence ; compensations ; états explicites.

Ne pas maintenir une transaction distribuée implicite entre base, email, stockage, IA, système externe.

---

## 109. Compensate rather than pretend atomicity

Exemples : retry ; compensation ; état `PARTIALLY_SUCCEEDED` ; action manuelle ; alerting.

Ne pas présenter un workflow multi-système comme atomique s'il ne l'est pas.

---

## 110. Version important artifacts

À versionner : documents ; propositions ; Skills ; prompts ; événements ; API ; schémas ; modèles IA ; règles de scoring ; packages de soumission.

---

## 111. Immutable references for audit

```text
Éviter   : documentId (si le contenu peut évoluer)
Préférer : documentVersionId
```

---

## 112. Make staleness visible

Exemples : analyse IA ; score ; résumé ; package ; projection ; export.

Le système doit pouvoir : détecter l'obsolescence ; l'afficher ; invalider ; recalculer ; conserver l'ancien résultat pour audit.

---

## 113. Human review is a workflow state

```text
PROPOSED
UNDER_REVIEW
VALIDATED
REJECTED
SUPERSEDED
```

Conserver : acteur ; date ; commentaire ; version ; sources.

---

## 114. Production safety over local convenience

Évaluer : volume ; verrous ; mémoire ; latence ; retries ; données existantes ; permissions ; rollback.

Les scripts doivent proposer : dry-run ; limites ; confirmation ; reprise ; journal ; idempotence.

---

## 115. Automation must remain controllable

Doit pouvoir être : observée ; suspendue ; limitée ; annulée lorsque possible ; rejouée ; auditée ; désactivée par feature flag si nécessaire.

---

## 116. Quality gates protect users

Les gates critiques ne doivent pas être désactivées pour accélérer une livraison.

---

## 117. Definition of Done is factual

```text
Implémenté et testé localement.
Build de production non exécuté.
Migration non testée sur un volume représentatif.
```

Cette précision est préférable à un faux « terminé ».

---

## 118. Principles are not excuses for rigidity

L'objectif est la discipline, pas la bureaucratie. Ces principes ne doivent pas empêcher une solution pragmatique lorsque le besoin est clair, le risque est compris, le compromis est documenté, la solution reste sûre, la décision est réversible et le niveau d'approbation est respecté.

---

## 119. Résolution des conflits entre principes

```text
Simplicité vs Sécurité              → la sécurité prévaut
Performance vs Maintenabilité       → sans mesure, la maintenabilité prévaut
Réutilisation vs Couplage           → une duplication raisonnable peut prévaloir
```

---

## 120. Questions d'arbitrage

1. Quelle solution protège le mieux les données ?
2. Quelle solution exprime le mieux le métier ?
3. Quelle solution réduit le risque inter-tenant ?
4. Quelle solution est la plus simple à comprendre ?
5. Quelle solution est la plus facile à tester ?
6. Quelle solution est la plus observable ?
7. Quelle solution est la plus réversible ?
8. Quelle solution ajoute le moins d'infrastructure ?
9. Quelle solution respecte les contrats existants ?
10. Quelle solution reste acceptable à l'échelle prévue ?

---

## 121. Checklist de conception

**Métier**

- [ ] L'intention métier est explicite.
- [ ] Les invariants sont protégés.
- [ ] Les transitions sont des comportements.
- [ ] Le vocabulaire est conforme.

**Architecture**

- [ ] Les frontières de modules sont respectées.
- [ ] Le Domain reste indépendant.
- [ ] Les effets restent aux frontières.
- [ ] Aucune abstraction prématurée.

**Sécurité**

- [ ] Le serveur reste l'autorité.
- [ ] Le moindre privilège est appliqué.
- [ ] Le comportement échoue fermé.
- [ ] Les données sont minimisées.

**Multi-tenancy**

- [ ] `organizationId` est explicite.
- [ ] Les caches sont tenant-aware.
- [ ] Les jobs sont tenant-scoped.
- [ ] Les tests inter-tenant existent.

**Données**

- [ ] Les contraintes protègent l'intégrité.
- [ ] La migration est progressive.
- [ ] La concurrence est gérée.
- [ ] L'historique est conservé si nécessaire.

**Résilience**

- [ ] Les timeouts sont explicites.
- [ ] Les retries sont bornés.
- [ ] L'idempotence est définie.
- [ ] La dégradation est contrôlée.

**Qualité**

- [ ] Le changement est testable.
- [ ] Les chemins de refus sont couverts.
- [ ] L'observabilité est prévue.
- [ ] La documentation explique les compromis.

**IA**

- [ ] Les permissions précèdent le retrieval.
- [ ] Les sorties sont structurées.
- [ ] Les preuves sont présentes.
- [ ] L'humain décide pour les actions critiques.

---

## 122. Anti-principes

L'Engineering Governor doit refuser les raisonnements suivants :

- « On sécurisera plus tard. »
- « Le frontend cache le bouton. »
- « Il y a peu de tenants pour l'instant. »
- « Le modèle IA a l'air sûr. »
- « Le test est probablement bon. »
- « La migration fonctionne sur ma machine. »
- « On ajoutera l'observabilité après. »
- « Kafka sera utile plus tard. »
- « Le generic repository évitera toute duplication. »
- « Le fournisseur garantit les backups. »
- « Le retry réglera le problème. »
- « Cette permission semble logique. »
- « On peut modifier le statut directement. »
- « Le contrat est interne, donc il peut casser. »

---

## 123. Principes condensés

```text
Correctness before cleverness
Business intent before CRUD
Domain before infrastructure
Explicit over implicit
Tenant scope everywhere
Server-side authority
Simple before generic
Reasonable duplication before premature coupling
Modular Monolith before microservices
PostgreSQL before additional infrastructure
Validate every boundary
Fail closed
Secure by default
Least privilege
Safe migrations
Transactions are deliberate
Idempotency before retries
Async for long-running work
Observability is a feature
Test behavior and negative paths
AI assists, humans decide
Evidence before confidence
Permissions before retrieval
Measure before optimize
Compatibility by default
Reversibility matters
Small vertical slices
Honest completion
```

---

## 124. Critères d'acceptation

Ce document est correctement appliqué lorsque :

- les solutions expriment les intentions métier ;
- le Domain reste indépendant ;
- les permissions sont appliquées côté serveur ;
- le tenant scope est présent à toutes les frontières ;
- la simplicité prévaut sur la généralisation prématurée ;
- les migrations sont progressives ;
- les traitements asynchrones sont idempotents ;
- les erreurs et timeouts sont explicites ;
- l'observabilité est conçue avec la fonctionnalité ;
- les tests couvrent les refus et les risques ;
- les usages IA restent fondés sur des preuves et une validation humaine ;
- les changements restent compatibles et réversibles lorsque possible ;
- les décisions techniques sont documentées honnêtement.
