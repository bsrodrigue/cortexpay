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

### Installation en 1 commande (Script Idempotent)

Le projet dispose d'un script d'installation complet et **idempotent** qui configure automatiquement l'ensemble des conteneurs, applique les 8 migrations SQL et installe les dépendances Python et React Native :

```bash
./setup.sh
```

> **Option tests de conformité** : Pour certifier l'installation immédiatement avec l'ensemble des tests Pytest et Jest, lancez :
> ```bash
> ./setup.sh --test
> ```

---

### Démarrage des Services

1. **Lancer le Backend FastAPI** :
```bash
./start.sh
```
*L'API est accessible sur `http://localhost:8000`. La documentation Swagger interactive est disponible sur `http://localhost:8000/docs`.*

2. **Lancer l'Application Mobile (Expo)** :
```bash
cd mobile
npm run start
```

---

### Guide Manuel Alternatif (Étape par étape)

#### Étape 1 : Démarrer l'infrastructure Docker (Postgres & Redis)

Depuis la racine du projet :
```bash
docker compose up -d postgres redis
```

Appliquer les migrations SQL :
```bash
docker exec -i cortex_postgres psql -U cortex -d cortex_pay < migrations/001_initial_ledger.sql
docker exec -i cortex_postgres psql -U cortex -d cortex_pay < migrations/002_cards_and_quotes.sql
docker exec -i cortex_postgres psql -U cortex -d cortex_pay < migrations/003_auth_users.sql
docker exec -i cortex_postgres psql -U cortex -d cortex_pay < migrations/004_kyc_verification.sql
docker exec -i cortex_postgres psql -U cortex -d cortex_pay < migrations/005_three_d_secure_and_card_labels.sql
docker exec -i cortex_postgres psql -U cortex -d cortex_pay < migrations/006_webhooks_and_reconciliation.sql
docker exec -i cortex_postgres psql -U cortex -d cortex_pay < migrations/007_disputes.sql
docker exec -i cortex_postgres psql -U cortex -d cortex_pay < migrations/008_performance_indexes.sql
```

---

#### Étape 2 : Configurer et Lancer le Backend FastAPI Manuellement

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

### 5. Conformité Réglementaire KYC (Tier 1 & Tier 2)
- Téléversement de pièces d'identité (Passeport, CNI) avec simulation de scoring et de validation automatique ou manuelle.
- Déblocage automatique de l'émission des cartes Visa USD uniquement pour les profils approuvés.

### 6. Protocole 3D Secure 2.0 (OTP Challenge & Frictionless Flow)
- Évaluation du risque de transaction : approbation instantanée (*Frictionless*) pour les montants sous le seuil ou challenge par OTP dynamique à 6 chiffres envoyé au porteur.
- Validation déterministe avec bascule d'état `PENDING_CHALLENGE` $\rightarrow$ `CHALLENGE_SUCCESS`.

### 7. Rapprochement Bancaire (Reconciliation & Discrepancy Detection)
- Comparaison quotidienne (EOD Batch) entre les écritures du Grand Livre et les relevés des opérateurs Mobile Money (Wave, Orange Money).
- Calcul déterministe des écarts de trésorerie (`MATCHED`, `DISCREPANCY`, `MISSING_IN_LEDGER`, `MISSING_IN_PROVIDER`).

### 8. Arbitrage et Cycle de Vie des Litiges Visa (Chargebacks & FSM)
- Contestation d'un débit suspect directement depuis le reçu de transaction.
- Arbitrage avec compensation comptable immédiate : écriture de chargeback débitant le compte de compensation `CHARGEBACK_SETTLEMENT_USD` et recréditant le portefeuille utilisateur en conformité avec les règles du réseau de paiement.

---

## 6. Machines à États Finis (FSM) & Invariants de Transition

Afin de rendre **rigoureusement impossibles** les transitions d'états invalides ou illégales (ex: dégel d'une carte résiliée, remboursement répété d'un litige clos), le système intègre des FSM natives sans dépendance tierce (`Enum` + table de transitions $O(1)$) synchronisées avec des contraintes PostgreSQL `CHECK` :

```
[Dispute FSM]
                   submit_evidence
  ┌──────────┐ ─────────────────────► ┌──────────────┐
  │  OPENED  │                        │ UNDER_REVIEW │
  └────┬─────┘ ◄───────────────────── └──────┬───────┘
       │           reject_evidence           │
       │                                     ├────────────────────────┐
       │ resolve(WON)                        │ resolve(WON)           │ resolve(LOST)
       ▼                                     ▼                        ▼
┌──────────────┐                      ┌──────────────┐         ┌─────────────┐
│ WON_REFUNDED │ (Terminal)           │ WON_REFUNDED │         │ LOST_CLOSED │ (Terminal)
└──────────────┘                      └──────────────┘         └─────────────┘
```

```
[Card Lifecycle FSM]
  ┌──────────┐       freeze        ┌──────────┐
  │  ACTIVE  │ ──────────────────► │  FROZEN  │
  └────┬─────┘ ◄────────────────── └────┬─────┘
       │             unfreeze           │
       │ terminate                      │ terminate
       ▼                                ▼
┌──────────────┐                 ┌──────────────┐
│  TERMINATED  │ (Terminal)      │  TERMINATED  │ (Terminal)
└──────────────┘                 └──────────────┘
```

```
[3D Secure Challenge FSM]
                       submit_otp(valid)
  ┌───────────────────┐ ─────────────────► ┌───────────────────┐
  │ PENDING_CHALLENGE │                    │ CHALLENGE_SUCCESS │ (Terminal)
  └─────────┬─────────┘                    └───────────────────┘
            │ submit_otp(invalid) / expire
            ▼
  ┌───────────────────┐
  │ CHALLENGE_FAILED  │ (Terminal)
  └───────────────────┘
```

---

## 7. Comprendre le Protocole 3D Secure (3DS 2.0)

Le protocole **3D Secure** (Three-Domain Secure) est le standard mondial de sécurisation des paiements par carte sur Internet. Il fait intervenir 3 acteurs fondamentaux :

1. **Acquirer Domain (Banque du Marchand)** : Le commerçant et sa passerelle de paiement (ex: Stripe, Adyen).
2. **Interoperability Domain (Le Réseau)** : Le Directory Server (DS) de Visa/Mastercard qui route les requêtes de vérification.
3. **Issuer Domain (La Banque Émettrice / CortexPay)** : Le serveur de contrôle d'accès (**ACS** - Access Control Server) qui authentifie le détenteur légitime de la carte.

### Le Flux d'Authentification CortexPay :
1. Le marchand soumet une demande d'autorisation avec les coordonnées de la carte.
2. Le moteur de risque évalue la transaction :
   - **Frictionless** : Risque minime, transaction approuvée sans friction pour l'utilisateur.
   - **Challenge Flow** : L'ACS émet un challenge. Un code OTP à 6 chiffres avec TTL strict est généré et envoyé à l'application mobile du porteur.
3. Le porteur saisit l'OTP dans la modal sécurisée de l'application CortexPay.
4. L'ACS valide l'empreinte cryptographique (`CHALLENGE_SUCCESS`), signant le transfert de responsabilité (*liability shift*) vers l'émetteur en cas de fraude.

---

## 8. Endpoints Clés de l'API

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/health` | Healthcheck de l'API |
| `GET` | `/api/wallets/{user_id}` | Soldes en temps réel des portefeuilles XOF et USD |
| `POST` | `/api/deposit/mobile-money` | Dépôt via Push USSD Wave / Orange Money |
| `POST` | `/api/withdraw/mobile-money` | Retrait (Cash-out) vers compte Mobile Money |
| `POST` | `/api/fx/quote` | Génération et verrouillage de devis FX (TTL 90s) |
| `POST` | `/api/fx/convert` | Exécution de conversion sous devis actif garanti |
| `POST` | `/api/cards/issue` | Émission d'une nouvelle carte virtuelle Visa USD |
| `GET` | `/api/cards/{user_id}` | Liste des cartes virtuelles de l'utilisateur |
| `POST` | `/api/cards/{card_id}/toggle-freeze` | Transition FSM Gel / Dégel instantané |
| `POST` | `/api/cards/{card_id}/topup` | Rechargement direct de carte depuis le portefeuille USD |
| `POST` | `/api/cards/{card_id}/spending-limit` | Mise à jour du plafond mensuel de dépenses |
| `POST` | `/api/cards/simulate-merchant-debit` | Débit marchand simulé & test de chaos réseau |
| `POST` | `/api/cards/3ds/initiate` | Initialisation d'un challenge 3DS 2.0 (FSM PENDING) |
| `POST` | `/api/cards/3ds/verify` | Validation d'OTP 3DS et transition FSM SUCCESS/FAILED |
| `POST` | `/api/kyc/submit` | Soumission des pièces d'identité du porteur |
| `GET` | `/api/kyc/{user_id}` | Consultation du statut et du tier KYC |
| `POST` | `/api/reconciliation/run` | Lancement du rapprochement batch EOD (Grand Livre vs Opérateur) |
| `GET` | `/api/ledger/audit-entries` | Consultation paginée du journal d'audit comptable |
| `GET` | `/api/ledger/export/csv` | Exportation certifiée RFC 4180 du grand livre pour auditeurs |
| `POST` | `/api/disputes/open` | Ouverture d'un litige Visa sur un débit (FSM: OPENED) |
| `POST` | `/api/disputes/{dispute_id}/resolve` | Arbitrage Visa (WON avec chargeback comptable ou LOST) |
| `GET` | `/api/disputes/user/{user_id}` | Liste des contestations et litiges ouverts |

---

## 9. Principes d'Ingénierie Respectés

Ce projet a été développé en stricte adhésion à la doctrine d'ingénierie système :
- **Correctness Before Cleverness** : Invariants mathématiques audités avant l'optimisation.
- **Fail Fast & Safe** : Tout déséquilibre comptable ou expiration lève une erreur explicite sans corrompre l'état.
- **State Machine Integrity** : Tout changement de statut passe obligatoirement par un graphe de transition déterministe validé en code et contraint en base.
- **Stateless & Déterministe** : Les flux tiers sont abstraits par des Mock Adapters déterministes permettant 100% d'autonomie et de reproductibilité en local.
