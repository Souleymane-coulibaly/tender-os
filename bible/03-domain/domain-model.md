# Domain Model V1

> **⚠️ Correction d'architecture (V2 Sprint 1)** — Ce document mentionne un objet `Workspace`
> distinct du `Tender`. **Cet objet n'existe pas et ne sera pas créé.** Le code réel (et
> `bible/04-architecture/system-architecture.md` §46-54, qui fait autorité) a tranché : `Tender`
> est directement l'agrégat racine du travail de réponse, `DCE` s'y rattache directement
> (`tenderId`), jamais via un `Workspace` intermédiaire. Toute mention de `Workspace` ci-dessous
> reste une cible non implémentée décrite au moment de la conception initiale — à lire comme telle,
> pas comme une description de l'existant.

Aujourd'hui, nous commençons par le document le plus important : le Domain Model.

**Pourquoi ?**

Parce que tout le SaaS repose dessus.

Si le modèle métier est solide, Claude pourra développer les Skills sans créer de dette technique.

---

## Entité racine

### Organization

Une entreprise cliente de TenderOS.

Contient :

- Utilisateurs
- Abonnement
- Documents
- Références
- Certifications
- Espaces de travail
- Historique IA

---

### User

Un collaborateur.

Exemples :

- Responsable AO
- Directeur
- Commercial
- Expert technique
- Juriste
- Administrateur

---

### Tender

Un appel d'offres.

Informations :

- Titre
- Description
- Acheteur
- CPV
- Budget
- Date limite
- Source (BOAMP, TED...)
- Statut

---

### Buyer

L'organisme qui publie le marché.

Exemples :

- Commune
- Région
- Ministère
- Hôpital
- Entreprise publique

---

### Workspace [NON IMPLÉMENTÉ — cet objet n'existe pas dans le code, voir bannière en tête de document]

Le cœur du produit *tel qu'imaginé à la conception initiale*. Le code réel n'a pas retenu cette
indirection : `Tender` (module `tenders`) joue directement ce rôle d'agrégat racine.

Chaque appel d'offres devient un Workspace *dans cette conception non implémentée*.

Il contient :

- le DCE ;
- les analyses IA ;
- les tâches ;
- les documents ;
- les commentaires ;
- les versions ;
- les réponses ;
- les validations.

---

### DCE

Le dossier de consultation.

Peut contenir :

- RC
- CCTP
- CCAP
- AE
- BPU
- DQE
- Annexes

---

### Document

Tout document de l'entreprise.

Exemples :

- Kbis
- Attestation URSSAF
- Assurance
- CV
- Référence
- Certification
- Mémoire technique

---

### AI Analysis

Résultat produit par l'IA.

Exemples :

- résumé ;
- exigences ;
- risques ;
- score ;
- checklist.

---

### Proposal

La réponse au marché.

Contient :

- mémoire technique ;
- documents joints ;
- versions ;
- historique.

---

### Task

Une tâche.

Exemple :

- Rédiger la partie Sécurité.

---

### Submission

Le dossier prêt à être déposé.

---

### Notification

Alertes.

---

### Audit Log

Toutes les actions importantes.

---

## Relations

```
Organization
│
├── Users
├── Documents
├── Certifications
├── References
├── Buyers
├── Tenders
│      │
│      └── Workspace
│              │
│              ├── DCE
│              ├── AI Analysis
│              ├── Proposal
│              ├── Tasks
│              ├── Comments
│              ├── Notifications
│              └── Submission
```
