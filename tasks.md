# CortexPay — Task Tracking & Roadmap

> Document vivant de suivi des tâches, de l'état d'avancement du projet CortexPay (Backend FastAPI + Ledger SQL + Mobile React Native Expo), et des prochains jalons techniques et fonctionnels.

---

## 📊 Synthèse d'État Global

| Composant | Statut | Couverture / Tests | Invariants Respectés |
| :--- | :--- | :--- | :--- |
| **Double-Entry Ledger Core** | ✅ Production Ready | 19/19 pytest (100%) | $\sum \text{Debits} = \sum \text{Credits}$, Zero Float, Append-only triggers |
| **FX Conversion Engine (TTL 90s)** | ✅ Opérationnel | Tests unitaires & Redis mocks passants | Spread 3.5%-4.5%, Locking atomique Redis |
| **Virtual Card Engine (Visa)** | ✅ Opérationnel | Tests Luhn & cycle de vie | PAN chiffré/masqué, 3DS Challenge FSM |
| **Mobile Client (React Native/Expo)**| ✅ MVP Avancé | 12/12 jest passants, 0 lint/type errors | Validation Zod stricte, Zero text overflow, Tab Bar moderne |
| **Compliance & KYC** | ✅ Fonctionnel (MVP) | Endpoints KYC + upload photos + démo tier | BCEAO/UEMOA Tier 1 |

---

## ✅ Tâches Récemment Complétées

### Mobile UX & Design
- [x] **Renommage & Cohérence Marque** : Remplacement des occurrences résiduelles "BuildShare" par "CortexPay" sur les écrans d'authentification et les titres d'application.
- [x] **Affichage & Révélation du PAN Carte Virtuelle** :
  - Mapping de `encrypted_pan` depuis PostgreSQL vers `card.pan` dans [`types.ts`](file:///home/badinirr/Workspace/labs/cortexcard/mobile/modules/cortexpay/types.ts).
  - Formatage standard par blocs de 4 chiffres (`XXXX XXXX XXXX XXXX`) dès le démasquage biométrique.
  - Bouton 1-clic pour copier le numéro complet dans le presse-papier.
- [x] **Audit et Correction du Text Overflow** :
  - Mise en place de `adjustsFontSizeToFit`, `minimumFontScale`, et `flexShrink: 1` sur les grands montants de solde ([`NeobankHeroBalance.tsx`](file:///home/badinirr/Workspace/labs/cortexcard/mobile/modules/cortexpay/components/NeobankHeroBalance.tsx)) et les numéros de carte ([`NeobankCardView.tsx`](file:///home/badinirr/Workspace/labs/cortexcard/mobile/modules/cortexpay/components/NeobankCardView.tsx)).
  - Ajustement des lignes de détails de reçus ([`TransactionReceiptModal.tsx`](file:///home/badinirr/Workspace/labs/cortexcard/mobile/modules/cortexpay/components/TransactionReceiptModal.tsx)), des alertes 3DS ([`ThreeDSModal.tsx`](file:///home/badinirr/Workspace/labs/cortexcard/mobile/modules/cortexpay/components/ThreeDSModal.tsx)) et des plafonds ([`CardDetailsModal.tsx`](file:///home/badinirr/Workspace/labs/cortexcard/mobile/modules/cortexpay/components/CardDetailsModal.tsx)) avec `flexWrap: 'wrap'` pour éviter tout débordement d'écran.
- [x] **Nettoyage Interface Démo** : Masquage du lanceur "Panneau Simulateur" (`flask-outline`) du header pour une expérience utilisateur propre et épurée.
- [x] **Modern Tab Bar Menu** :
  - Création de [`ModernTabBar.tsx`](file:///home/badinirr/Workspace/labs/cortexcard/mobile/modules/cortexpay/components/ModernTabBar.tsx) : îlot flottant avec ombre douce, retour haptique (`expo-haptics`) et gestion safe-area (`useSafeAreaInsets`).
  - Alignement symétrique et centrage pixel-perfect des onglets (**Accueil**, **Cartes**, **Action Rapide / Conversion**, **Activité**, **Profil**).
  - Filtrage contextuel de l'affichage sur le tableau de bord selon l'onglet actif.

---

## 📌 En Cours & Prochaines Priorités

### 1. Robustesse & Sécurité Backend
- [ ] **Chiffrement AES-256-GCM au repos pour les PANs** :
  - Remplacer le stockage en clair/mock de `encrypted_pan` par un véritable chiffrement symétrique AES-256-GCM avec clé maîtresse dérivée via HSM/KMS ou variables d'environnement sécurisées.
- [ ] **Rate Limiting Distribué (Redis Token Bucket)** :
  - Protéger les endpoints sensibles (`/api/fx/quote`, `/api/cards/issue`, `/api/deposits`) contre le spam et le brute-force de codes OTP ou 3DS.
- [ ] **Gestion Fine des Timeouts de Base de Données** :
  - Définir des `statement_timeout` explicites sur les transactions de verrouillage de lignes (`SELECT ... FOR UPDATE`) pour prévenir les deadlocks sous forte charge.

### 2. Fonctionnalités Cartes Virtuelles & Paiement
- [ ] **Plafonds par Transaction & Catégorie Marchand (MCC)** :
  - Possibilité de bloquer ou limiter certaines catégories (e.g. jeux de hasard, retraits distributeur, abonnements récurrents).
- [ ] **Notifications Push en Temps Réel** :
  - Intégration Expo Push Notifications / Firebase Cloud Messaging (FCM) lors des autorisations de débits, recharges Wave/OM, ou alertes 3D Secure.
- [ ] **Cartes Éphémères / Jetables** :
  - Émission de cartes à usage unique (se détruisant automatiquement après la première transaction marchande).

### 3. Expérience Utilisateur Mobile & Performance
- [ ] **Recherche & Filtres Avancés dans l'Activité** :
  - Filtrer l'historique des transactions par devise (XOF / USD), type d'opération (Dépôt, Débit, Rollback, Conversion), ou plage de dates.
- [ ] **Mode Hors Ligne & Cache Optimiste** :
  - Mise en cache persistante des soldes et des cartes avec TanStack Query + AsyncStorage pour un affichage instantané dès l'ouverture de l'application.
- [ ] **Export PDF des Relevés de Compte** :
  - En complément de l'export CSV existant, génération de relevés bancaires officiels au format PDF avec en-tête CortexPay et détail des écritures de Grand Livre.

---

## 🛠️ Journal des Décisions d'Ingénierie

1. **Formatage 4x4 du PAN** :
   - *Problème* : L'utilisateur ne pouvait pas utiliser facilement son numéro de carte virtuelle pour payer en ligne sans espaces de lisibilité.
   - *Solution* : Création d'une fonction de formatage automatique `formatCardNumber` ajoutant les espaces toutes les 4 positions et préservant la chaîne nettoyée pour la copie dans le presse-papier.
2. **Navigation par Tab Bar Flottante** :
   - *Problème* : Le tableau de bord unique présentait toutes les sections en une seule page défilable très longue.
   - *Solution* : Implémentation d'une barre de navigation moderne flottante sur 4 sections principales et un bouton central d'action rapide, garantissant un espacement parfait du bas de page (`paddingBottom: insets.bottom + 90`).
