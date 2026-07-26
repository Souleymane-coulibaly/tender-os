# Domain Model V1

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

### Workspace

Le cœur du produit.

Chaque appel d'offres devient un Workspace.

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
