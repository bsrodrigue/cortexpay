# Rapport d'analyse — Projet CortexPay

**Auteur :** équipe projet
**Version :** 1.0
**Date :** 18 août 2026
**Référence document :** basé sur le Livre Blanc CortexPay v1.0 (19 pages)

> **Périmètre de ce rapport.** Le présent document analyse exclusivement le projet **CortexPay**, sur la base du Livre Blanc fourni. Le projet **SaaS Pointo** n'entre pas dans le périmètre de ce rapport et fera l'objet d'une analyse distincte.

---

## Synthèse exécutive

CortexPay est un projet fintech **pertinent et bien pensé sur le plan stratégique** : il répond à un besoin réel et documenté (fragmentation des moyens de paiement en Afrique de l'Ouest, absence de cartes internationales pour une large partie de la population, complexité d'intégration pour les entreprises). L'architecture **à deux niveaux** (agrégateur CortexPay + offre d'appel CortexCard) est une excellente logique de réduction du risque : elle permet de générer du revenu rapidement tout en construisant, transaction après transaction, l'infrastructure d'agrégation.

**En revanche, la qualité technique et opérationnelle décrite dans le Livre Blanc reste très insuffisante** pour un système manipulant de l'argent. Le document consacre une dizaine de pages aux aspects stratégiques et commerciaux, mais **moins d'une page à l'architecture technique** (section 11) et seulement un paragraphe à la sécurité (section 12). C'est précisément sur ces points que portent les risques les plus graves : un système de paiement ne peut pas être conçu sur la base d'une simple liste de technologies (React, Django, PostgreSQL).

**Verdict préliminaire :** le *pourquoi* (pertinence) est solide, mais le *comment* (conception, architecture, sécurité, conformité opérationnelle) est à consolider avant tout engagement significatif.

---

## 1. Pertinence globale du projet

### 1.1 Le problème adressé est réel et prioritaire

Le problème décrit (Livre Blanc §1.2) est parfaitement documenté sur le marché ouest-africain :

- **Multiplicité des comptes Mobile Money** sans gestion centralisée (Orange Money, Moov Money, Wave, MTN) ;
- **Impossibilité d'accéder aux paiements internationaux** (abonnements SaaS, marketplaces, régie publicitaire Facebook/Google/TikTok Ads) pour une majorité de la population sans carte bancaire internationale ;
- **Complexité d'intégration** pour les entreprises, contraintes d'interconnecter plusieurs opérateurs séparément.

Ce sont des douleurs réelles, fréquentes et à forte valeur perçue. La proposition de valeur « une seule interface, un seul portefeuille, plusieurs moyens de paiement » est claire, compréhensible et directement mesurable.

### 1.2 Une stratégie de lancement intelligente

L'articulation en deux niveaux est un point fort majeur :

| Aspect | Analyse |
|--------|---------|
| **CortexCard comme produit d'appel** | Offre concrète, rapidement monétisable, faible complexité initiale. Excellent moyen de valider la demande et d'acquérir des clients. |
| **Agrégateur construit progressivement** | L'infrastructure se fiabilise sur des flux réels avant d'être ouverte à des cas d'usage plus risqués (API tierces, e-commerce). |
| **Adossement initial à des acteurs agréés** | Contourne temporairement la lourdeur réglementaire (agrément BCEAO, capital 100 M FCFA) et accélère le time-to-market. |

### 1.3 Limites de pertinence à garder en tête

- **Faible barrière à l'entrée / marge de différenciation incertaine.** Le modèle « agrégateur de paiement + cartes virtuelles » existe déjà en Afrique de l'Ouest (CinetPay, PayDunia, Koris, Transik, ainsi que Flutterwave et Paystack eux-mêmes, plus développés au Nigeria). Le Livre Blanc n'identifie **aucun avantage concurrentiel défendable** : pas de données exclusives, pas de licence propriétaire, pas de coût marginal inférieur, pas de réseau exclusif.
- **Concentration sur un partenaire.** Flutterwave est à la fois fournisseur des cartes **et** premier agrégateur Mobile Money (Livre Blanc §6.2). Ce choix pragmatique crée un **point de défaillance unique** et place CortexPay dans une position de dépendance commerciale forte (tarifs, SLA, conditions).
- **Marché ciblé restreint au lancement.** Le Burkina Faso est un marché de taille modérée ; l'extension UEMOA dépendra d'obstacles réglementaires et de concurrence par pays.

---

## 2. Potentiel et intérêt au regard des besoins

### 2.1 Potentiel commercial

- **Demande prouvée et non saturée** côté particuliers : les besoins d'abonnements et d'achats internationaux sont massifs et sous-servis.
- **Demande B2B réelle** : la régie publicitaire et les abonnements SaaS sont des besoins de trésorerie récurrents des PME/startups.
- **Modèle économique multi-sources** (cartes, commissions, FX, abonnements, API) offre plusieurs leviers et une certaine résilience.

### 2.2 Potentiel financier

Les hypothèses de marge (Livre Blanc §4.2) sont **crédibles mais doivent être vérifiées par des données réelles** :
- commission d'encaissement ~2,5 % pour un coût de gros ~1 % (marge nette ~1,5 %) : plausible, mais dépend totalement du contrat Flutterwave ;
- marge de change (conversion devise) : réelle mais volatile et soumise aux taux BCEAO ;
- modèle à volumes : nécessite un **volume transactionnel minimal** pour être rentable, non chiffré dans le document.

### 2.3 Potentiel stratégique

Le rôle « d'orchestrateur neutre » est attractif, mais sa crédibilité repose sur la capacité à **multiplier les partenaires** (banques, réseaux de cartes, plusieurs opérateurs). Or la stratégie progressive repose d'abord sur un partenaire unique. Le potentiel ne se réalisera que si CortexPay réduit sa dépendance à Flutterwave à moyen terme — ce que le document reconnaît (Marqeta, Stripe Issuing, direct-to-operator) sans le planifier précisément.

---

## 3. Points forts et faiblesses

### 3.1 Points forts

1. **Problème clairement identifié et bien formulé.**
2. **Stratégie progressive de réduction des risques** (offre d'appel → agrégateur → régionalisation).
3. **Adossement initial à des partenaires agréés** pour accélérer la mise sur le marché.
4. **Modèle économique multi-leviers** et logique de marges explicite.
5. **Technologies modernes et légères** au niveau frontend (React/Vite/Tailwind/PWA) — adaptées au mobile-first.
6. **Prise de conscience réglementaire** (Instruction BCEAO n°001-01-2024, statut d'établissement de paiement, capital 100 M FCFA) — c'est rare et louable.
7. **Volonté de conformité KYC/AML** dès le lancement.

### 3.2 Faiblesses

1. **Architecture technique quasi absente du Livre Blanc.** Une liste de technologies n'est pas une architecture (voir section 4).
2. **Concentration / dépendance à Flutterwave** (cartes + Mobile Money) : risque commercial et opérationnel.
3. **Aucun avantage concurrentiel défendable identifié.**
4. **Approche « Vibe Coding » pour un système de paiement** : risque majeur sur la correction et la sécurité du code (voir section 4.4).
5. **Absence de plan financier chiffré** : point mort, volume minimal, projections de trésorerie, coût d'acquisition client.
6. **Absence de stratégie d'acquisition client et de marketing détaillée.**
7. **Pas de feuille de route produit détaillée avec jalons, responsabilités et indicateurs.**
8. **Pas d'analyse de la concurrence ni de différenciation.**
9. **Pas de stratégie de sortie de secours / plan B** en cas de défaillance du partenaire de lancement.

---

## 4. Analyse technique : architecture, conception, sécurité, performance, évolutivité

> ⚠️ **Avertissement préalable.** La section 11 du Livre Blanc (« Architecture technique ») se limite à un tableau de trois lignes :
>
> | Couche | Technologies |
> |--------|--------------|
> | Frontend | React, Vite, TailwindCSS, PWA |
> | Backend | Django, PostgreSQL, API REST |
> | Infrastructure | VPS OVH, Nginx, SSL, sauvegardes automatiques |
>
> Cette description est **insuffisante pour un système financier**. Les analyses ci-dessous identifient les risques et les exigences manquantes, à traiter avant tout développement significatif.

### 4.1 Architecture logicielle

**Problèmes identifiés :**

- **Aucune définition d'architecture** : pas de décision monolithe modulaire vs microservices, pas de structuration par domaine (comptes, cartes, paiements, portefeuille, KYC, reversements).
- **Absence de composants critiques pour la fiabilité** : pas de file d'attente / broker de messages (Celery + Redis/RabbitMQ) pour les traitements asynchrones, pas de gestion des **webhooks** (essentiels en paiement), pas de mécanisme d'**idempotence**.
- **Pas de conception « comptable » du cœur** : un système de paiement doit reposer sur une **écriture en partie double (double-entry ledger)** et des mécanismes de **réconciliation** entre les mouvements internes et les confirmations des partenaires (Flutterwave, Mobile Money). Aucune mention.
- **Pas de gestion des états de transaction** (initiée, en attente, réussie, échouée, remboursée, en litige) ni de **machine à états** pour les flux de paiement.

**Recommandations :**
- Adopter un **cœur de paiement modulaire et événementiel** (event-driven), avec un **ledger double-entrée** comme source de vérité.
- Prévoir une **file de traitement asynchrone** (Celery/Redis) et des **webhooks vers les marchands** avec signature sécurisée et retries.
- Mettre en place l'**idempotence** sur toutes les opérations de débit/crédit (clés d'idempotence par requête).

### 4.2 Sécurité

**Problèmes identifiés :**

- **Périmètre PCI DSS non défini.** L'émission et le traitement des cartes (Visa/Mastercard) impliquent des obligations PCI DSS. La bonne pratique est de **ne jamais stocker ni manipuler les données de carte** (PAN, CVV) localement, et de s'appuyer sur la **tokenisation** de Flutterwave. Le Livre Blanc ne précise pas ce point, pourtant critique.
- **Absence de sécurité « par couches » documentée :**
  - pas de gestion explicite du **chiffrement au repos et en transit** (au-delà du simple « SSL ») ;
  - pas de **gestion des secrets / clés** (KMS, coffre-fort de clés, rotation) ;
  - pas de politique de **moindre privilège** ni de séparation d'environnements (dev/staging/prod) ;
  - pas de **journal d'audit** détaillé au-delà de la « journalisation des opérations ».
- **Authentification forte mentionnée mais non détaillée** : quelles modalités (OTP, TOTP, biométrie) ? Sur quelles opérations (connexion, paiement, retrait) ?
- **Anti-fraude générique** : pas d'indication sur les règles, le scoring, la détection d'anomalies, les limites de vitesse (rate-limiting), la surveillance en temps réel.

**Recommandations :**
- Définir un **dossier de conformité PCI DSS** et confirmer que les données de carte transitent uniquement via l'infrastructure tokenisée du partenaire.
- Documenter une **politique de sécurité complète** : chiffrement AES-256 au repos, TLS 1.2+/1.3 en transit, gestion centralisée des secrets, rotation des clés, moindre privilège, RACI sécurité.
- **Renforcer l'authentification** : MFA obligatoire pour les opérations sensibles et les comptes marchands.
- **Durcir l'API** : rate-limiting, quotas, validation stricte, signature des webhooks, pare-feu applicatif (WAF).
- Mettre en place une **surveillance et alerting** (détection d'anomalies, alertes de fraude) en continu.

### 4.3 Performance, disponibilité et évolutivité

**Problèmes identifiés :**

- **Infrastructure mono-hôte** (un VPS OVH) : aucun **redondance ni haute disponibilité**. Une panne du serveur = indisponibilité totale des paiements. Inacceptable pour un système financier critique.
- **Absence de couche de cache** (Redis) et de **montée en charge** (load balancing, réplicas de lecture PostgreSQL).
- **Aucune stratégie de reprise après sinistre (DRP)** ni de **backup testé** (RPO/RTO non définis).
- **Pas d'observabilité** : logging structuré, traces distribuées, métriques, alerting non mentionnés.
- **Évolutivité non définie** : le passage à un volume élevé (UEMOA) nécessitera une architecture capable de scaler horizontalement, décision non documentée.

**Recommandations :**
- Évoluer vers une **architecture à haute disponibilité** : au minimum 2 nœuds derrière un load balancer, base de données avec réplication et **failover**.
- Ajouter **Redis pour le cache et la file**, et prévoir **réplicas de lecture PostgreSQL** pour les lectures.
- Définir un **DRP avec RPO/RTO** et des **tests de restauration réguliers**.
- Mettre en place un **stack d'observabilité** (ex. Prometheus/Grafana pour métriques, Sentry pour erreurs, ELK/Loki pour logs) dès le MVP.
- Prévoir des **tests de charge** (ex. k6) sur les parcours critiques (paiement, recharge, reversement).

### 4.4 Risque spécifique : le « Vibe Coding » (section 10)

**Problème identifié :** Le Livre Blanc indique que le MVP sera développé via une approche « Vibe Coding » assistée par IA (ChatGPT, Claude, Cursor, Windsurf, Replit). **Dans un système de paiement, c'est un risque de premier ordre** :

- les erreurs de logique financière, de validation d'entrée, d'état de transaction ou de gestion d'idempotence peuvent avoir des **conséquences financières directes** ;
- le code généré automatiquement est rarement audité, difficile à maintenir, et peut contenir des vulnérabilités (injections, fuites de secrets, failles de logique métier).

**Recommandations :**
- L'IA peut **assister** (génération d'ébauches, tests unitaires, documentation) mais **jamais remplacer** la revue humaine.
- Mettre en place des **garde-fous obligatoires** :
  - **revue de code systématique** par un humain senior ;
  - **tests unitaires + tests d'intégration + tests de propriétés** sur toute la logique financière ;
  - **test en sandbox** avec vérification de la cohérence des soldes avant passage en réel (partiellement prévu, à systématiser) ;
  - **audit de sécurité externe** avant le lancement public ;
  - **peer review** sur toute modification touchant aux flux de fonds.

### 4.5 Conformité et réglementaire

**Points positifs :**
- Le document identifie correctement l'Instruction BCEAO n°001-01-2024, le statut d'établissement de paiement et le capital social de 100 M FCFA pour le régime complet.

**Points de vigilance :**
- La **fermeture du modèle d'adossement** au 1er mai 2025 signifie que CortexPay **ne peut pas** s'appuyer durablement sur des tiers sans licence. La fenêtre « agréé via partenaires » est donc **temporaire** et doit être assortie d'un plan d'obtention de l'agrément.
- Nécessité de **vérifier le statut exact** de Flutterwave, PayDunya et LigdiCash dans l'UMOA (reconnus dans le document comme « sous réserve de vérification ») — c'est une **dette réglementaire** à solder rapidement.
- L'**AML/KYC** et l'anti-blanchiment (CNIB, IFU, RCCM) sont cités mais doivent être traduits en **procédures opérationnelles et en outillage**.

---

## 5. Améliorations / ajustements nécessaires avant d'aller plus loin

### 5.1 Bloquants (à traiter en priorité)

1. **Rédiger une vraie architecture technique** (schéma + document) : cœur de paiement événementiel, ledger double-entrée, idempotence, webhooks, files de traitement, gestion des états de transaction.
2. **Traiter le risque de dépendance à Flutterwave** : formaliser les termes contractuels, définir un plan de diversification (Marqeta, Stripe Issuing) et un plan « direct-to-operator » daté.
3. **Clarifier le statut réglementaire réel des partenaires** et bâtir un **plan d'obtention de l'agrément BCEAO** (capital, gouvernance, dossier de conformité).
4. **Encadrer le « Vibe Coding »** par une revue humaine obligatoire, des tests systématiques et un audit de sécurité externe avant lancement.

### 5.2 Importants (à faire avant la mise en production)

5. **Renforcer l'infrastructure** : haute disponibilité, redondance, DRP avec RPO/RTO, observabilité, tests de charge.
6. **Documenter une politique de sécurité complète** : PCI DSS, chiffrement, gestion des secrets, MFA, rate-limiting, WAF, surveillance anti-fraude.

### 5.3 Recommandés (business)

7. **Établir un plan financier chiffré** : point mort, volume minimal de rentabilité, projections de trésorerie, coût d'acquisition client, pricing par segment.
8. **Conduire une analyse de la concurrence** (CinetPay, PayDunia, Koris, Transik, Flutterwave, Paystack) et **définir une différenciation claire**.
9. **Définir une stratégie d'acquisition client** et un ciblage précis des segments les plus rentables.
10. **Formaliser la feuille de route** avec jalons, livrables, responsabilités et indicateurs de succès (KPIs).
11. **Définir un plan B** en cas de défaillance du partenaire de lancement (continuité de service).

---

## 6. Conclusion

**CortexPay est un projet pertinent sur le fond et porteur d'un potentiel réel**, porté par une stratégie de lancement intelligente (offre d'appel + agrégateur progressif) et une bonne conscience des contraintes réglementaires ouest-africaines.

**Sa principale faiblesse réside dans l'insuffisance de la conception technique et opérationnelle** telle que documentée : un système manipulant de l'argent ne peut pas s'appuyer sur une simple liste de technologies, ni sur un développement exclusivement assisté par IA, ni sur une infrastructure mono-hôte sans garantie de sécurité, de fiabilité et d'évolutivité.

**Décision recommandée :** le projet mérite d'être poursuivi, mais **conditionnellement** — à condition qu'une architecture technique détaillée, une politique de sécurité/conformité, un plan de réduction de la dépendance partenaire et un encadrement strict du développement (revues + tests + audit) soient établis **avant tout engagement de ressources significatif**. Le prochain livrable attendu est un **document d'architecture technique** et un **plan financier chiffré**.

---

*Fin du rapport. Le projet SaaS Pointo fera l'objet d'un rapport séparé.*
