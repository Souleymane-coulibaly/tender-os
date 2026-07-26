# TenderOS

> ⚠️ **Document obsolète.** Ce fichier appartient à l'arborescence legacy `docs/vision/`, dépréciée. Il contredit des décisions d'architecture actées depuis : la section « Stack technique (prévisionnelle) » ci-dessous liste Kubernetes et GitHub Actions (exclus tant qu'aucun besoin réel n'est démontré — voir `CLAUDE.md` et `skills/platform-foundation/SKILL.md` §50) et nomme OpenAI comme fournisseur IA explicite (contraire au principe *provider-agnostic* de `docs/05-ai/AI_ARCHITECTURE.md`). Pour la vision et la constitution produit à jour, voir [`PRODUCT_CONSTITUTION.md`](../../PRODUCT_CONSTITUTION.md) (racine) ; pour l'architecture et la stack technique à jour, voir `CLAUDE.md` et [`skills/platform-foundation/`](../../skills/platform-foundation/).

> AI Operating System for Public Procurement

## Vision

TenderOS est une plateforme SaaS alimentée par l'intelligence artificielle qui accompagne les entreprises tout au long du cycle de réponse aux appels d'offres.

Notre ambition est de devenir la plateforme de référence en Europe pour les marchés publics.

Nous ne construisons pas simplement un agrégateur.

Nous construisons un véritable copilote IA capable de :

- découvrir les appels d'offres
- analyser les cahiers des charges
- qualifier les opportunités
- préparer les réponses
- assister les équipes
- capitaliser sur l'expérience de l'entreprise

---

# Le problème

Répondre à un appel d'offres est un processus complexe.

Les entreprises doivent :

- rechercher sur plusieurs plateformes
- analyser des centaines de pages
- retrouver leurs documents
- rédiger un mémoire technique
- coordonner plusieurs collaborateurs
- respecter des délais très courts

Ce processus est encore largement manuel.

---

# Notre solution

TenderOS automatise l'ensemble du processus grâce à une IA spécialisée.

Le produit agit comme un copilote capable de comprendre les marchés publics et d'assister les équipes dans leurs décisions.

---

# Principes

Le produit est conçu selon les principes suivants.

## AI First

Chaque fonctionnalité doit pouvoir être utilisée par un agent IA.

---

## Modular

Chaque fonctionnalité est développée sous forme de Skill indépendant.

---

## Enterprise Ready

Le produit doit répondre aux exigences des PME, ETI et grands groupes.

---

## Explainable AI

Chaque recommandation de l'IA doit être justifiée.

---

## Security by Design

La sécurité et la confidentialité sont intégrées dès la conception.

---

# Les grands Skills

- Tender Discovery
- Tender Workspace
- DCE Analyzer
- Company Brain
- Proposal Writer
- Compliance Checker
- Project Manager
- Submission Assistant
- Analytics
- AI Copilot

---

# Stack technique (prévisionnelle)

Frontend

- Next.js
- React
- TypeScript

Backend

- NestJS

Base de données

- PostgreSQL
- Prisma

Recherche

- OpenSearch

IA

- OpenAI
- RAG
- pgvector

Stockage

- S3

Infrastructure

- Docker
- Kubernetes
- GitHub Actions

---

# Objectif

Créer la meilleure plateforme IA de gestion des appels d'offres en Europe.
