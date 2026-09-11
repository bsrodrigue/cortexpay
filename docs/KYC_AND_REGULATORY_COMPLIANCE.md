# Guide Réglementaire & Architecture KYC (Zone UEMOA / BCEAO & Visa International)

---

## 1. Cadre Réglementaire & Objectifs

Dans l’Union Économique et Monétaire Ouest-Africaine (UEMOA), l’émission de monnaie électronique et d'instruments de paiement internationaux (ex: Cartes Visa / Mastercard adossées à des devises fortes comme le dollar USD) est régie par :
1. **L’Instruction N° 01/2011/SP de la BCEAO** relative à l’émission de monnaie électronique.
2. **Le Règlement N° 02/2015/CM/UEMOA** relatif à la lutte contre le blanchiment de capitaux et le financement du terrorisme (AML-CFT).
3. **Les règles d'agrément et de gestion des risques du réseau Visa International** (Card Issuing Rules).

### Pourquoi un KYC est-il strictement obligatoire ?
Une carte Visa prépayée ou virtuelle permet de faire des achats transfrontaliers (SaaS, e-commerce international, OpenAI, AWS, voyages). Sans identification formelle du titulaire :
- Le système s'expose à la fraude à la carte, au contournement des règles de change de la BCEAO et au blanchiment d'argent.
- En cas de litige (chargeback / contestation marchand), la responsabilité financière et pénale retombe directement sur l’établissement émetteur (BIN Sponsor ou FinTech).

---

## 2. Paliers Réglementaires (Tiering System)

Pour concilier **fluidité de conversion à l'onboarding** et **stricte conformité**, la réglementation autorise une approche progressive par paliers de risque :

```
                               ┌─────────────────────────┐
                               │         TIER 0          │
                               │    (Non Vérifié)        │
                               └────────────┬────────────┘
                                            │
                                            ▼
                               ┌─────────────────────────┐
                               │         TIER 1          │
                               │  (Vérification Légère)  │
                               └────────────┬────────────┘
                                            │
                                            ▼
                               ┌─────────────────────────┐
                               │         TIER 2          │
                               │  (Vérification Complète)│
                               └─────────────────────────┘
```

### Détail des Paliers :

| Niveau | Documents Requis | Pratiques Autorisées | Plafonds Imposés |
| :--- | :--- | :--- | :--- |
| **Tier 0** (Inscription Simple) | Nom, Prénom, Email, Téléphone vérifié (OTP) | • Consultation des taux de change<br>• Dépôt Mobile Money limité (< 50 000 XOF)<br>❌ **Cartes Visa strictement interdites** | Solde max portefeuille : 50 000 XOF |
| **Tier 1** (Identité Biométrique) | • CNI Nationale CEDEAO ou Passeport en cours de validité<br>• Numéro d'identification national (NIN)<br>• Selfie liveness / biométrique | • Dépôts & Conversions FX sans friction<br>• **Émission de la 1ère Carte Virtuelle Visa USD** | • Plafond mensuel par carte : 1 000 USD<br>• Solde total portefeuille : 1 000 000 XOF |
| **Tier 2** (Pleine Conformité) | • Pièce d'identité (Tier 1)<br>• Justificatif de domicile de moins de 3 mois (Facture Senelec / Sonatel / Woyofal / Certificat de résidence légalisé) | • Multi-cartes virtuelles (jusqu'à 5 cartes)<br>• Dépenses SaaS intensives pour les professionnels | • Plafond mensuel par carte : 5 000 à 10 000 USD<br>• Plafond illimité sous convention d'entreprise |

---

## 3. Architecture Technique dans CortexPay

Le système applique ce cadre au niveau du **noyau d'orchestration backend** et de la **base de données PostgreSQL** :

### 1. Invariant d'Émission de Carte ([`backend/src/api/routes.py`](file:///home/badinirr/Workspace/labs/cortexcard/backend/src/api/routes.py#L140))
Lors de chaque requête `POST /api/cards/issue` :
```python
user = await conn.fetchrow("SELECT kyc_status, kyc_tier FROM users WHERE user_id = $1", payload.user_id)
if user and (user["kyc_tier"] < 1 or user["kyc_status"] != "APPROVED"):
    raise HTTPException(
        status_code=403,
        detail="Conformité réglementaire requise : Vous devez valider votre identité (KYC Tier 1) pour émettre une carte Visa."
    )
```
> **Garantie système :** Même si un client mobile altéré ou une requête cURL contourne l'interface, la transaction est rejetée au niveau du serveur avec code HTTP `403 Forbidden`.

### 2. Modèle de Données & Tables ([`migrations/004_kyc_verification.sql`](file:///home/badinirr/Workspace/labs/cortexcard/migrations/004_kyc_verification.sql))
- **`users`** :
  - `kyc_status` : `'NOT_STARTED' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED'`
  - `kyc_tier` : `0 | 1 | 2`
  - `kyc_submitted_at`, `kyc_reviewed_at`, `kyc_rejection_reason`
- **`kyc_documents`** :
  - Stocke les références des pièces (`NATIONAL_ID`, `PASSPORT`), le numéro officiel, les URLs des clichés (Recto, Verso, Selfie), et l'historique d'audit des approbations/rejets.

---

## 4. Expérience Utilisateur Mobile (B2C)

1. **Bannière non bloquante** :
   - L'utilisateur peut explorer l'application et recharger ses XOF. Une bannière élégante l'invite à valider son identité : *"🛡️ Conformité Réglementaire (KYC)"*.
2. **Modal de transmission (`KYCVerificationModal.tsx`)** :
   - Sélection du document (CNI CEDEAO / Passeport).
   - Saisie du numéro d'identification et transmission sécurisée.
3. **Accélérateur de Test MVP / Démo** :
   - Un bloc d'évaluation immédiate (bouton *« Approuver Tier 1 »* ou *« Refuser »*) est inclus dans la modal pour tester les deux branches du cycle de vie en condition réelle.
4. **Déblocage dynamique** :
   - Dès approbation, le bouton `+ Carte` et la création de carte virtuelle USD s'activent immédiatement.
