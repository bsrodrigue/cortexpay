# CortexPay — Infrastructure FinTech & Cartes Virtuelles Multi-Devises

> **Architecture Hexagonale, Grand Livre Comptable Immuable (Double-Entry Ledger), Moteur FX Déterministe & Application Mobile React Native / Expo.**

---

## 1. Vue d'Ensemble du Système

**CortexPay** est une plateforme FinTech conçue selon les principes de l'ingénierie système :
- **Invariant comptable strict** : Aucun argent ne se crée ni ne se perd. Chaque transaction obéit à la règle universelle $\sum \text{Débits} = \sum \text{Crédits}$ par devise.
- **Immuabilité garantie en base** : Les écritures comptables sont strictement *append-only*. Des triggers PostgreSQL de niveau schéma interdisent tout `UPDATE` et `DELETE`.
- **Zéro float** : Tous les calculs financiers sont effectués en précision arbitraire fixe (`NUMERIC(18, 4)` en SQL et `Decimal` strict en Python/TypeScript).
- **Moteur FX avec Quote Locking (TTL 90s)** : Verrouillage temporaire du taux de change (spread de +3.5% à +4.5%) appuyé sur Redis et PostgreSQL avec compte pivot `FX_CLEARING`.
- **Mocks Déterministes & Scénarios de Chaos** : Simulation immédiate sans dépendance externe (Push USSD Wave / Orange Money, génération de cartes Visa conformes Luhn, et rollbacks automatiques en cas de rupture réseau).
- **Client Mobile First-Class** : Application React Native (Expo Router, React Native Paper MD3, Zustand, TanStack Query, validation Zod intégrale).

---

## 2. Architecture Technique

```
                              ┌───────────────────────────────────┐
                              │     Mobile App (React Native)     │
                              │ Expo Router + MD3 + TanStack Query│
                              └─────────────────┬─────────────────┘
                                                │ REST JSON (Zod Validated)
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         FastAPI Backend Gateway (Python 3.12+)                  │
│                                                                                  │
│   ┌─────────────────────┐  ┌───────────────────────┐  ┌──────────────────────┐   │
│   │   Wallets & Dépôts  │  │   Moteur FX & Quotes  │  │   Cartes Virtuelles  │   │
│   └──────────┬──────────┘  └───────────┬───────────┘  └──────────┬───────────┘   │
│              │                         │                         │               │
│              ▼                         ▼                         ▼               │
│   ┌──────────────────────────────────────────────────────────────────────────┐   │
│   │                        Cortex FinTech Orchestrator                       │   │
│   │        (Double-Entry, Row-Level Locking, Compensation Reversals)         │   │
│   └───────────────┬───────────────────────────┬──────────────────────┬───────┘   │
│                   │                           │                      │           │
│                   ▼                           ▼                      ▼           │
│        ┌─────────────────────┐     ┌─────────────────────┐ ┌─────────────────┐   │
│        │ MockPaymentGateway  │     │    FX Engine        │ │ MockCardIssuer  │   │
│        │  (Wave / OM USSD)   │     │ (Redis TTL 90s Lock)│ │ (Visa Luhn PAN) │   │
│        └─────────────────────┘     └─────────────────────┘ └─────────────────┘   │
└───────────────────────────────────────────────┬──────────────────────────────────┘
                                                │
                 ┌──────────────────────────────┴─────────────────────────────┐
                 │                                                            │
                 ▼                                                            ▼
    ┌─────────────────────────┐                                 ┌─────────────────────────┐
    │      PostgreSQL 16      │                                 │         Redis 7         │
    │  - accounts             │                                 │  - fx:quote:<quote_id>  │
    │  - journal_entries      │                                 │    (TTL strict 90s)     │
    │  - postings             │                                 └─────────────────────────┘
    │  - virtual_cards        │
    │  - Anti-mutation Trg    │
    └─────────────────────────┘
```

### Invariants et Règles Comptables
1. **Comptabilité en partie double** : Toute transaction crée un en-tête `journal_entries` et au moins deux lignes dans `postings` (un débit et un crédit équivalents par devise).
2. **Anti-Mutation** : Des triggers PostgreSQL (`trg_immutable_journal_entries`, `trg_immutable_postings`, `trg_immutable_accounts_delete`) lèvent une exception SQL immédiate en cas de tentative de modification ou de suppression.
3. **Concurrence & Deadlock Prevention** : Les comptes impliqués dans une écriture sont verrouillés via `SELECT ... FOR UPDATE` triés par identifiant unique pour éliminer tout risque d'interblocage.
4. **Pivot FX Multi-Devises** :
   * Branche XOF : `DEBIT Wallet_XOF` / `CREDIT FX_CLEARING_XOF`
   * Branche USD : `DEBIT FX_CLEARING_USD` / `CREDIT Wallet_USD`
   Chaque branche respecte $\sum \text{Débits} = \sum \text{Crédits}$.

---

## 3. Structure du Dépôt

```
cortexcard/
├── backend/
│   ├── pyproject.toml              # Dépendances backend (FastAPI, asyncpg, redis, hypothesis)
│   └── src/
│       ├── api/                    # Contrôleurs REST FastAPI
│       ├── core/                   # Configuration, pool Postgres asyncpg, client Redis
│       ├── domain/                 # Modèles Pydantic & entités financières
│       ├── services/               # Grand livre (ledger), moteur FX, orchestrateur central
│       ├── adapters/               # Mocks déterministes (Wave/OM USSD, émetteur carte)
│       └── main.py                 # Point d'entrée de l'application FastAPI
├── migrations/
│   ├── 001_initial_ledger.sql      # Tables comptables et triggers d'immuabilité
│   └── 002_cards_and_quotes.sql    # Schéma des cartes virtuelles et devis FX
├── tests/
│   ├── test_ledger_hypothesis.py   # Tests de propriétés formelles Débit=Crédit
│   ├── test_e2e_ledger_db.py       # Scénarios E2E Postgres (Triggers, FX, Cartes, Chaos)
│   └── test_fx_locking_and_api.py  # Tests d'API HTTP & expiration Redis 90s
├── mobile/
│   ├── app/                        # Expo Router (routes publiques et protégées)
│   │   └── (protected)/cortex.tsx  # Route d'accès au tableau de bord CortexPay
│   ├── modules/cortexpay/          # Module FinTech CortexPay
│   │   ├── types.ts                # Schémas Zod stricts pour toutes les données
│   │   ├── api.ts                  # Client HTTP typé avec validateModel
│   │   ├── hooks.ts                # Hooks TanStack Query avec invalidation de cache
│   │   ├── store/                  # Store Zustand pour l'état utilisateur
│   │   ├── components/             # VirtualCardView, FXQuoteWidget, SimulatorPanel
│   │   └── screens/                # CortexDashboardScreen
│   └── package.json                # Dépendances React Native / Expo 54 / MD3
├── docker-compose.yml              # Orchestration Postgres 16, Redis 7 & services
├── Dockerfile.backend              # Conteneurisation de l'API FastAPI
└── README.md                       # Documentation technique du système
```

---

## 4. Guide de Démarrage Rapide

### Prérequis
- **Docker & Docker Compose**
- **Python 3.12+** et **uv** (recommandé pour une installation ultra-rapide)
- **Node.js 20+** et **npm**

---

### Étape 1 : Démarrer l'infrastructure Docker (Postgres & Redis)

Depuis la racine du projet :
```bash
docker compose up -d postgres redis
```

Appliquer les migrations SQL (si non montées automatiquement au 1er boot) :
```bash
docker exec -i cortex_postgres psql -U cortex -d cortex_pay < migrations/001_initial_ledger.sql
docker exec -i cortex_postgres psql -U cortex -d cortex_pay < migrations/002_cards_and_quotes.sql
```

---

### Étape 2 : Configurer et Lancer le Backend FastAPI

1. Créer l'environnement virtuel et installer les dépendances :
```bash
uv venv .venv
source .venv/bin/activate
uv pip install -e backend
```

2. Exécuter la suite complète de tests de conformité :
```bash
pytest -v tests/
```
*Tous les tests (propriétés Hypothesis, triggers d'immuabilité, rollbacks de chaos) doivent être au vert.*

3. Démarrer le serveur d'API :
```bash
uvicorn backend.src.main:app --reload --port 8000
```
L'API est accessible sur `http://localhost:8000`. La documentation Swagger interactive est disponible sur `http://localhost:8000/docs`.

---

### Étape 3 : Lancer l'Application Mobile (Expo / Web / Simulateur)

1. Naviguer dans le dossier mobile :
```bash
cd mobile
```

2. Vérifier que le fichier `mobile/.env` pointe bien vers l'API locale :
```env
EXPO_PUBLIC_API_URL=http://localhost:8000/api
```

3. Vérifier le typage TypeScript strict :
```bash
npx tsc --noEmit
```

4. Lancer le serveur de développement Expo :
```bash
npm run start
```
- Tapez `w` pour tester directement dans votre navigateur web.
- Tapez `a` pour exécuter sur émulateur Android ou scannez le QR code avec l'application Expo Go sur votre smartphone.

---

## 5. Fonctionnalités & Parcours de Démonstration

### 1. Recharge Mobile Money Instantanée (Wave / Orange Money)
- Saisie du numéro de téléphone et du montant en XOF.
- Validation OTP déterministe (`123456`).
- Crédit immédiat du solde utilisateur via une écriture comptable en partie double auditée.

### 2. Moteur FX & Verrouillage de Devis (Quote Locking 90s)
- Demande d'un devis de change XOF $\rightarrow$ USD avec calcul automatique du spread (+3.5% à +4.5%).
- Compte à rebours dynamique de 90 secondes affiché avec barre de progression.
- Si le délai de 90s est dépassé, toute tentative d'exécution est rejetée (`410 GONE`).
- Si validé à temps : conversion atomique instantanée sur les portefeuilles.

### 3. Carte Virtuelle USD Sécurisée
- Émission instantanée d'une carte Visa Platinum avec numéro conforme à l'algorithme de Luhn.
- Révélation sécurisée du PAN complet et du cryptogramme CVV en 1-clic.
- Bouton **Geler / Dégeler 1-clic** : tout débit marchand sur une carte gelée est immédiatement refusé par l'émetteur.

### 4. Panneau Simulateur de Débit Marchand & Scénario de Chaos
- Simulez des prélèvements SaaS réels (ex: OpenAI 20$, AWS Cloud).
- **Interrupteur Scénario de Chaos** : activez la simulation d'une coupure réseau lors de l'appel bancaire pour constater le **rollback de compensation automatique** restituant instantanément les fonds sur le compte de la carte sans aucune divergence comptable.

---

## 6. Endpoints Clés de l'API

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/health` | Healthcheck de l'API |
| `GET` | `/api/wallets/{user_id}` | Soldes en temps réel des portefeuilles XOF et USD |
| `POST` | `/api/deposit/mobile-money` | Dépôt via Push USSD Wave / Orange Money |
| `POST` | `/api/fx/quote` | Génération et verrouillage de devis FX (TTL 90s) |
| `POST` | `/api/fx/convert` | Exécution de conversion de devises sous devis actif |
| `POST` | `/api/cards/issue` | Émission d'une nouvelle carte virtuelle USD |
| `GET` | `/api/cards/{user_id}` | Liste des cartes virtuelles de l'utilisateur |
| `POST` | `/api/cards/{card_id}/toggle-freeze` | Gel / Dégel instantané d'une carte |
| `POST` | `/api/cards/simulate-merchant-debit` | Simulation d'autorisation marchand & test de chaos |
| `GET` | `/api/ledger/audit-entries` | Consultation du journal d'audit du grand livre |

---

## 7. Principes d'Ingénierie Respectés

Ce projet a été développé en stricte adhésion à la doctrine d'ingénierie système :
- **Correctness Before Cleverness** : Invariants mathématiques audités avant l'optimisation.
- **Fail Fast & Safe** : Tout déséquilibre comptable ou expiration lève une erreur explicite sans corrompre l'état.
- **Stateless & Déterministe** : Les flux tiers sont abstraits par des Mock Adapters déterministes permettant 100% d'autonomie en local.
