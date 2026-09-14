# Guide et Spécification Technique : 3D Secure (3DS / EMV 3DS) dans CortexPay

---

## 1. Comprendre le 3D Secure

### 1.1 Définition simple (Niveau Utilisateur)
> **Le 3D Secure (3DS)** est un système de sécurité qui agit comme un verrou numérique supplémentaire lors d'un achat en ligne par carte bancaire. Au lieu de simplement saisir les numéros inscrits sur la carte, le titulaire reçoit une notification instantanée ou un code temporaire (OTP) sur son téléphone pour autoriser explicitement la transaction. Si quelqu'un vole les numéros de la carte, il ne peut pas payer sans ce code.

### 1.2 Définition approfondie (Niveau Ingénieur Système)
> **Le protocole 3D Secure (Three-Domain Secure)**, spécifié par le consortium **EMVCo** (Visa Secure, Mastercard Identity Check, Amex SafeKey), est un protocole d'authentification forte du porteur de carte (*Strong Customer Authentication* - SCA) reposant sur l'échange cryptographique de données de transaction entre **trois domaines distincts** :
> 1. **Le Domaine Acquéreur (*Acquirer Domain*)** : La passerelle de paiement du commerçant (*Merchant Plug-In* / MPI ou *3DS Server*).
> 2. **Le Domaine Émetteur (*Issuer Domain*)** : La banque ou l'émetteur de la carte (notre serveur d'autorisation et d'authentification / *Access Control Server* - ACS).
> 3. **Le Domaine d'Interopérabilité (*Interoperability Domain*)** : Le réseau de cartes (*Directory Server* - DS, opéré par Visa/Mastercard).

---

## 2. Pourquoi le 3D Secure est vital pour CortexPay

Dans le contexte des cartes virtuelles prépayées émises en zone UEMOA / Afrique de l'Ouest pour régler des services internationaux (OpenAI, AWS, Meta Ads, Netflix, Google Ads) :

1. **Protection contre la Fraude et Vol de Coordonnées (PAN/CVV)** :
   - Empêche l'utilisation frauduleuse en cas de compromission des données de la carte.
2. **Transfert de Responsabilité (*Liability Shift*)** :
   - Lorsqu'une transaction est authentifiée par 3DS avec succès, la responsabilité financière en cas de contestation (*chargeback* pour fraude) glisse du côté de la banque acquéreuse/marchand vers le réseau, protégeant le fonds de réserve de CortexPay.
3. **Taux d'Acceptation Marchand Élevé** :
   - Les marchands internationaux majeurs (Google, Meta, Stripe) rejettent systématiquement les cartes sans support 3DS actif (*Soft Decline* code Visa `65` ou HTTP `402`).

---

## 3. Architecture et Cycle de Vie 3DS dans CortexPay (Mock Déterministe)

Conformément à la directive d'autonomie et de reproductibilité, CortexPay n'effectue aucun appel sortant vers un sandbox externe non maîtrisé. L'ACS et le Directory Server sont émulés de manière déterministe au sein de notre architecture :

```
                  ┌────────────────────────────────────────────────────────┐
                  │                Marchand Web (ex: Google Ads)           │
                  └──────────────────────────┬─────────────────────────────┘
                                             │ 1. Demande d'autorisation (150 USD)
                                             ▼
                  ┌────────────────────────────────────────────────────────┐
                  │       Passerelle Acquéreur / Directory Server          │
                  │   Détecte exigence 3DS (Transaction à haut montant)    │
                  └──────────────────────────┬─────────────────────────────┘
                                             │ 2. POST /api/cards/3ds/initiate
                                             ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ CORTEXPAY BACKEND (ACS - Access Control Server & Ledger)                                   │
│                                                                                           │
│ 3. Vérifications préalables :                                                             │
│    - Carte ACTIVE ? (Rejet immédiat si FROZEN ou TERMINATED)                              │
│    - Solde suffisant sur le compte dédié CARD_ACC_{card_id} ?                             │
│    - Plafond mensuel respecté ? ($5k Standard / $10k Business)                            │
│    - Catégorie marchande autorisée ? (Rejet si CASINO, BETTING, DARKNET)                  │
│                                                                                           │
│ 4. Création du Challenge 3DS en base PostgreSQL (`three_d_secure_challenges`) :           │
│    - challenge_id : "3ds_<uuid>"                                                          │
│    - otp_code : "123456" (Déterministe pour environnement de test/simulation)             │
│    - status : "PENDING"                                                                   │
│    - expires_at : NOW() + 5 minutes                                                       │
└──────────────────────────┬──────────────────────────────────────────┬─────────────────────┘
                           │                                          │
                           │ 5. Notification Push                     │ 6. Récupération
                           │    ou Alerte In-App                      │    GET /api/cards/3ds/pending/{card_id}
                           ▼                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ APPLICATION MOBILE CORTEXPAY (Porteur de Carte)                                           │
│                                                                                           │
│ 7. Affichage de la Modale Sécurisée `ThreeDSModal` :                                      │
│    - Nom du marchand : "Google Ads"                                                       │
│    - Montant : $150.00 USD                                                                │
│    - Champ de saisie OTP : "123456"                                                       │
│                                                                                           │
│ 8. Validation par l'utilisateur -> POST /api/cards/3ds/verify                             │
└──────────────────────────┬────────────────────────────────────────────────────────────────┘
                           │
                           │ 9. Payload: { challenge_id, otp_code: "123456" }
                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ CORTEXPAY BACKEND (Orchestrateur & Grand Livre Comptable)                                  │
│                                                                                           │
│ 10. Traitement Atomique en Transaction SQL (`FOR UPDATE`) :                               │
│     a. Vérification : challenge non expiré et status == 'PENDING'                         │
│     b. Contrôle code OTP ('123456')                                                       │
│     c. Écriture Grand Livre en Partie Double Immuable :                                   │
│        - DEBIT  : CARD_ACC_{card_id}                    150.0000 USD                      │
│        - CREDIT : MERCHANT_SETTLEMENT_GOOGLE ADS_USD    150.0000 USD                      │
│     d. Mise à jour de `current_month_spent` sur la carte                                  │
│     e. Statut challenge -> 'APPROVED'                                                     │
│     f. Enregistrement de la transaction dans `card_transactions` (APPROVED)               │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Modèle de Données PostgreSQL

Table créée via [`migrations/005_three_d_secure_and_card_labels.sql`](file:///home/badinirr/Workspace/labs/cortexcard/migrations/005_three_d_secure_and_card_labels.sql) :

```sql
CREATE TABLE IF NOT EXISTS three_d_secure_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id VARCHAR(64) UNIQUE NOT NULL,
    card_id VARCHAR(64) NOT NULL REFERENCES virtual_cards(card_id),
    merchant_name VARCHAR(128) NOT NULL,
    amount NUMERIC(18, 4) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    otp_code VARCHAR(8) NOT NULL,           -- Code déterministe '123456'
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'
    expires_at TIMESTAMPTZ NOT NULL,       -- TTL 5 minutes
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 5. Matrice des Cas d'Usage et Gestion des Échecs

| Scénario Testé | Entrée / Contexte | Comportement Attendu | Statut Challenge |
| :--- | :--- | :--- | :--- |
| **Passant Standard** | OTP `123456` sous 5 min, solde OK | Débit comptable exécuté, retour 200 OK | `APPROVED` |
| **Code Erroné** | OTP incorrect (ex: `000000`) | Rejet immédiat, fonds préservés, retour 400 | `REJECTED` |
| **Expiration (Timeout)** | Validation après 5 min (`expires_at < NOW()`) | Rejet immédiat avec message explicite, retour 400 | `EXPIRED` |
| **Carte Gelée** | Initiation alors que `status = 'FROZEN'` | Rejet dès l'initiation, aucun challenge généré | Non créé |
| **Plafond Dépassé** | Montant + dépenses mensuelles > Plafond | Rejet lors de la confirmation, challenge marqué | `REJECTED` |
| **Catégorie Interdite** | Marchand `CASINO ONLINE`, `BETTING` | Bloqué par politique de conformité, retour 400 | `REJECTED` |

---

## 6. Vérification et Couverture par les Tests

L'intégralité du cycle de vie 3DS est couvert par la suite de tests automatisés :
- [`tests/test_fx_locking_and_api.py::test_card_categorization_and_3ds_flow`](file:///home/badinirr/Workspace/labs/cortexcard/tests/test_fx_locking_and_api.py) : Test du parcours complet d'émission Business et validation OTP 3DS.
- [`tests/test_fx_locking_and_api.py::test_3ds_challenge_expiry_and_security_policy`](file:///home/badinirr/Workspace/labs/cortexcard/tests/test_fx_locking_and_api.py) : Test d'expiration artificielle, des politiques de sécurité et de l'équilibrage strict du Grand Livre.
