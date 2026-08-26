# FIX-3C — Contrat de gouvernance du catalogue Outbox

**Checkpoint** : TENDEROS-2.1-P2.3-E12.4 — FIX-3C · **Verdict : `FIX_3C_CERTIFIED`**

---

## A. Executive summary

Le contrat empêche désormais toute divergence entre le code et la SSoT. Réconciliation actuelle :
**78 types produits = 78 types catalogués**, écart nul dans les deux sens, **zéro forme de
producteur non interprétée**.

Le point qui rend ce contrat digne de confiance n'est pas qu'il compte juste aujourd'hui, mais qu'il
**ne peut pas se tromper silencieusement demain** — voir §C.

## B. Architecture

Deux fichiers, aucun impact runtime :

| Fichier | Rôle |
|---|---|
| `outbox/test-support/outbox-producer-scanner.ts` | découverte des producteurs et des handlers réels |
| `outbox/domain/outbox-event-catalog.contract.spec.ts` | **10 assertions** de gouvernance |

Aucune dépendance aux artefacts de certification (§17) : la SSoT et le code courant suffisent.

## C. Méthode de découverte — et sa garantie

Les trois options possibles :

1. **Helper typé chez les producers** — la plus sûre, mais exige de modifier des dizaines de use
   cases métier : hors périmètre FIX-3C.
2. **Second catalogue manuel** — explicitement interdit (§4), et c'est précisément la dérive à éviter.
3. **Extraction statique** — retenue, mais l'audit avait démontré son angle mort : elle rate les
   producteurs conditionnels **et le fait silencieusement** (six types invisibles, écart 76 → 78).

J'ai donc levé cet angle mort au lieu de vivre avec. Le scanner ne se contente pas d'extraire ce
qu'il reconnaît : il **classe chaque occurrence** de `eventType:` dans un fichier producteur —
littéral, ternaire de littéraux, annotation de type, passe-plat, indirection par champ injecté — et
remonte tout le reste dans `unrecognized`. Une assertion dédiée fait échouer le contrat sur toute
forme inconnue. **L'angle mort devient bruyant.**

Deux gaps réels ont été trouvés et fermés pendant ce travail, ce qui valide la méthode :

- une annotation de type union (`"A" | "B" | "C"`) et un ternaire de champs injectés étaient
  signalés comme inconnus → classificateurs affinés ;
- `AdministrativeFormGenerated`/`GenerationFailed` étaient **invisibles** : leur fichier déclare le
  type mais **délègue** l'écriture, donc ne porte aucun marqueur d'écriture Outbox. Découvert par la
  réconciliation avec le catalogue, jamais par le scan seul.

## D. Types produit vs types de test

Les `eventType` synthétiques (`TEST_EVENT`, `OWN_EVENT`, `FOREIGN_EVENT`…) sont exclus par
construction : le scanner ignore `.spec.` et `test-support/`. Une assertion vérifie en outre qu'ils
**n'entrent jamais** dans la SSoT produit. Le port injectable de FIX-3B continue de leur permettre
d'exercer le vrai dispatcher (§18).

## E→J. Les 10 assertions du contrat

| # | Invariant | État |
|---|---|---|
| 1 | Tout type produit est catalogué | ✅ 0 manquant |
| 2 | Aucune forme de producteur non interprétée | ✅ 0 |
| 3 | Aucun type catalogué sans producteur (dérive inverse) | ✅ 0 |
| 4 | Catalogue sain : 0 doublon, 0 entrée vide, 0 destination inconnue | ✅ |
| 5 | Tout `INTERNAL` a un handler enregistré | ✅ 20/20 |
| 6 | Aucun handler inattendu sur un type sans livraison interne | ✅ 0 contradiction |
| 7 | Tout `EXTERNAL_WEBHOOK` reconnu par `resolvePublicEventType`, et les 11 types publics couverts | ✅ |
| 8 | Multi-destination accepté, imposant **les deux** obligations | ✅ (0 cas aujourd'hui, gouvernance prête) |
| 9 | Types synthétiques absents de la SSoT | ✅ |
| 10 | `productReviewSuggested` reste informatif, jamais une règle runtime | ✅ |

La réconciliation webhook passe par le **vrai pont du produit** (`resolvePublicEventType`), jamais
par une liste recopiée : c'est lui qui décide ce que l'Integration Hub expose réellement.

## K. Preuve négative (§20)

Sonde temporaire : un producteur émettant `NewFancyEvent`, non déclaré. Le contrat échoue avec :

```
1 eventType(s) produit(s) absent(s) du catalogue :
  - NewFancyEvent  (produit par src/modules/tenders/application/use-cases/__drift-probe.ts:7)
Déclarez-les dans src/modules/outbox/domain/outbox-event-catalog.ts avec leur classification.
```

Le message nomme le type, son **producteur exact (fichier:ligne)** et l'action à mener — jamais un
« 78 attendu, 80 reçu » (§15/§16). Sonde retirée, contrat de nouveau vert : **10/10**.

## L→P. Régressions

| Suite | Résultat |
|---|---|
| Outbox + FIX-3A + FIX-3B + FIX-2A (scoped harness, workspace, integrations) | **11 fichiers / 97 tests** |
| Métier ciblé (analysis, document-generation, knowledge-base, billing) | **92 fichiers / 757 tests** |
| Contrat FIX-3C | **10 / 10** |

**H6/H7 leak check** : `NEW_ORGANIZATION_LEAK = 0`, `NEW_OUTBOX_LEAK = 0`, `NEW_USER_LEAK = 0`,
`NEW_SESSION_LEAK = 0`. Organisations stables à **432** depuis la certification FIX-1.

Signalé honnêtement : les totaux globaux `users`/`sessions` ont glissé de +1 pendant ces régressions,
imputable à d'autres suites (contrôle scopé à 0), pas à FIX-3C.

## Q. Gates

Typecheck : **0 erreur**. Lint ciblé FIX-3C : **PASS**.

## R. Findings

- **F3C-001 (P3)** — l'écart 76 → 78 est désormais structurellement impossible : toute forme de
  production non reconnue échoue.
- `F3-003` (un handler par eventType) et `F3-005` (`eventVersion` non routé) restent **différés**,
  non traités (§12/§33).

## S. Risques résiduels

1. Le contrat repose sur une analyse **statique**. Un producteur écrit dans une forme radicalement
   nouvelle serait signalé comme *inconnu* — donc échec bruyant, jamais silence. C'est la garantie
   apportée, mais elle exige d'étendre le scanner lorsque cela arrive.
2. Un `eventType` construit dynamiquement à l'exécution (concaténation, valeur de configuration)
   échapperait à toute analyse statique. Aucun cas de ce type n'existe aujourd'hui ; le contrat le
   signalerait comme forme non interprétée.

## T. Verdict

```
FIX_3C_CERTIFIED
FIX_3C_STATUS = CLOSED
FIX_3_STATUS  = CLOSED
F2_STATUS     = READY_FOR_FULL_CERTIFICATION
NEXT_ACTION   = E12_4_FULL_SUITE_CERTIFICATION
```

Full-suite **non lancée**, conformément au §30. Aucun commit, aucun push.
