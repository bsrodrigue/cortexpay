# Comprendre le Fonctionnement des Cartes Visa : Guide Business & Architecture FinTech

Ce document a pour objectif d'expliquer de manière claire, rigoureuse et accessible comment fonctionne l'écosystème mondial des cartes bancaires **Visa**, comment les flux financiers circulent, qui gagne quoi, et comment une FinTech comme **CortexPay** s'y intègre.

---

## 1. La Règle d'Or : Visa ne prête pas d'argent et n'émet pas de cartes

Une idée reçue très fréquente est de croire que Visa est une banque. C'est faux.

> **Modèle Enfant (Niveau 1)** :  
> Visa est comme le réseau d'autoroutes du monde entier pour l'argent. Visa construit les routes, installe les péages et fixe le code de la route, mais ce sont les voitures (les banques et les clients) qui roulent dessus.

> **Modèle Ingénieur / Business (Niveau 2)** :  
> Visa est un **système de réseau de paiement ouvert (Card Scheme)**. Son rôle est de fournir l'infrastructure de télécommunication chiffrée à ultra-faible latence (**VisaNet**), d'établir les standards de sécurité (normes EMV, PCI-DSS, 3D-Secure) et de garantir la neutralité et le règlement des flux entre institutions financières agréées.

---

## 2. Le Modèle à « 4 Coins » (The Four-Party Model)

Chaque transaction par carte implique systématiquement **4 acteurs principaux**, orchestrés par le réseau Visa :

```
                        ┌─────────────────────────────────────┐
                        │              VISANET                │
                        │    (Réseau de commutation Visa)     │
                        └──────────▲───────────────┬──────────┘
                                   │               │
                     Message       │               │ Message
                   d'Autorisation  │               │ d'Autorisation
                                   │               │
        ┌──────────────────────────┴──┐         ┌──▼──────────────────────────┐
        │       ACQUÉREUR             │         │         ÉMETTEUR            │
        │  (Acquiring Bank / Stripe)  │         │   (Issuing Bank / BaaS)     │
        └──────────────▲──────────────┘         └──────────────┬──────────────┘
                       │                                       │
            Paiement   │                                       │ Débit / Carte
            Terminal   │                                       │ Virtuelle
                       │                                       │
        ┌──────────────┴──────────────┐         ┌──────────────▼──────────────┐
        │          MARCHAND           │         │         PORTEUR             │
        │    (Ex: OpenAI, Amazon)     │         │    (Client CortexPay)       │
        └─────────────────────────────┘         └─────────────────────────────┘
```

| Acteur | Rôle | Exemple Concret |
|---|---|---|
| **1. Le Porteur (Cardholder)** | La personne ou l'entreprise qui paie. | Un utilisateur CortexPay à Dakar ou Abidjan. |
| **2. L'Émetteur (Issuer / Issuing Bank)** | La banque ou l'établissement licencié qui gère le compte du porteur, valide les fonds et émet la carte. | Une banque partenaire agréée Visa (ou un BaaS comme Marqeta, Stripe Issuing, Interswitch). |
| **3. Le Marchand (Merchant)** | L'entreprise qui vend un produit ou un service. | OpenAI, AWS, Google Cloud, Netflix, Uber. |
| **4. L'Acquéreur (Acquirer / Merchant Bank)** | La banque ou le processeur qui collecte les paiements pour le compte du marchand. | Stripe, Adyen, JPMorgan Merchant Services. |
| **L'Arbitre : Visa** | Le réseau qui interconnecte l'Acquéreur et l'Émetteur en temps réel (millisecondes). | VisaNet. |

---

## 3. Le Cycle de Vie d'un Paiement : Les 3 Étapes Cruciales

Un paiement par carte ne transfère pas l'argent instantanément. Il se découpe en trois phases distinctes : **l'Autorisation**, la **Compensation (Clearing)** et le **Règlement (Settlement)**.

### Étape 1 : L'Autorisation (Temps Réel : ~500ms à 2s)
C'est ce qui se passe quand vous cliquez sur "Payer" sur OpenAI :
1. **Saisie** : Le marchand envoie les données de carte (PAN, Date, CVV) à son **Acquéreur**.
2. **Routage VisaNet** : L'acquéreur interroge Visa. Visa reconnaît les 6 premiers chiffres de la carte (**le BIN** - *Bank Identification Number*) et sait exactement à quel **Émetteur** envoyer la demande.
3. **Contrôle Émetteur** : L'émetteur vérifie :
   * La carte est-elle active (non gelée) ?
   * Le CVV et la date sont-ils valides ?
   * Le solde disponible est-il suffisant ?
   * La transaction est-elle frauduleuse ?
4. **Réponse** : L'émetteur répond par un code d'approbation (`Approved : 00`) ou de refus (`Declined : 51 - Insufficient Funds`).
5. **Résultat** : L'argent n'est **pas encore transféré**, mais il est **bloqué/réservé (Hold)** sur le compte du porteur.

### Étape 2 : La Compensation (Clearing / Batch : fin de journée, J)
À la fin de la journée commerciale (souvent vers minuit) :
- Le marchand rassemble toutes les autorisations validées de la journée dans un fichier de lot (*batch*).
- Son acquéreur transmet ce fichier à Visa.
- Visa calcule les soldes nets multilatéraux : qui doit combien à qui dans chaque devise.

### Étape 3 : Le Règlement (Settlement : J+1 à J+2)
- L'Émetteur vire les fonds réels à Visa via les comptes de réserve de la banque centrale.
- Visa vire les fonds à l'Acquéreur.
- L'Acquéreur crédite le compte bancaire du Marchand.

---

## 4. Anatomie d'un Numéro de Carte (PAN) & Sécurité

Un numéro de carte Visa comprend généralement 16 chiffres structurés avec précision :

```
      4  5  3  2    8  8    1  2    3  4  5  6    7  8  9    4
     └──────┬───────┘ └──────┬──────┘ └─────┬─────┘ └───┬───┘ └──┬──┘
         MII / BIN        Sous-Type     Identifiant     Compte  Clé Luhn
       (Visa = 4...)      Émetteur      Partenaire      Client  (Check)
```

1. **Le Premier Chiffre (Major Industry Identifier - MII)** :
   * `4` : **Visa** (systématiquement).
   * `5` ou `2` : **Mastercard**.
   * `3` : **American Express** ou **Diners Club**.
2. **Le BIN (Bank Identification Number - 6 à 8 premiers chiffres)** :
   * Identifie l'institution financière émettrice, le pays d'émission, la devise par défaut et le niveau de carte (Classic, Gold, Platinum, Infinite, Corporate).
3. **Le Numéro de Compte Unique (9 chiffres suivants)** :
   * Identifie le compte spécifique au sein de l'institution.
4. **Le Dernier Chiffre : Clé de Contrôle (Formule de Luhn)** :
   * Calcul mathématique (somme pondérée modulo 10) qui permet à n'importe quel terminal ou site web de détecter instantanément une faute de frappe sans même interroger la banque.
5. **Le Cryptogramme Visuel (CVV2 / CVC)** :
   * Calculé par un algorithme cryptographique (Triple DES / AES) basé sur le PAN, la date d'expiration et une clé secrète de l'émetteur. Il ne doit **jamais être stocké** par le marchand.

---

## 5. Le Modèle Économique : Qui Paie Quoi ? (MDR & Interchange)

Lorsqu'un client paie **$100.00** par carte chez un marchand, le marchand ne reçoit pas $100.00. Il reçoit environ **$97.50 à $98.00**. La différence (~2% à 3%) s'appelle le **MDR (Merchant Discount Rate)**.

Ce montant est partagé entre 3 acteurs :

```
     Montant payé par le client : $100.00
     ───────────────────────────────────────────────────────────
     [-] Commission d'Interchange (Interchange Fee) : ~$1.50 à $1.80 ──► Revient à l'Émetteur (Issuer / CortexPay)
     [-] Frais de Réseau (Scheme Fee Visa)         : ~$0.15 à $0.30 ──► Revient à Visa
     [-] Marge Acquéreur (Acquirer Processing Fee) : ~$0.40 à $0.70 ──► Revient à l'Acquéreur (Stripe / Adyen)
     ───────────────────────────────────────────────────────────
     Montant net encaissé par le Marchand          : ~$97.50
```

> **Opportunité Business Majeure pour une FinTech Émettrice (CortexPay)** :  
> L'émetteur touche la plus grande part de ce gâteau (**l'Interchange**). À chaque fois qu'un utilisateur utilise sa carte virtuelle pour payer un abonnement SaaS ($20/mois OpenAI, $500/mois AWS), l'émetteur perçoit automatiquement entre **1.2% et 2.0%** de commission brute sans effort commercial auprès du marchand.

---

## 6. Cartes Virtuelles vs Cartes Physiques : Les Spécificités

| Critère | Carte Physique Classique | Carte Virtuelle (CortexPay) |
|---|---|---|
| **Support** | Plastique / Métal avec puce EMV et bande magnétique. | Purement numérique (générée via API). |
| **Délai d'émission** | 5 à 10 jours ouvrés (fabrication + expédition postale). | **Instantané (< 1 seconde)**. |
| **Cas d'usage** | TPE en magasin, retraits DAB / GAB, paiements en ligne. | **Paiements en ligne, abonnements SaaS, e-commerce**. |
| **Sécurité & Contrôle** | Si volée, il faut réémettre et attendre une nouvelle carte. | **Gel 1-clic**, cartes éphémères à usage unique ou plafonnées par marchand. |
| **Coût unitaire** | ~$3 à $8 par carte (plastique, puce, transport). | **~$0.10 à $0.50** par carte créée via API. |

---

## 7. Les Nouveaux Standards : Tokenisation (Apple Pay, Google Pay)

Historiquement, le vrai numéro de carte (PAN) circulait de site en site. En cas de piratage d'un marchand, les données fuitaient.

Aujourd'hui, Visa utilise le **Visa Token Service (VTS)** :
1. Le vrai numéro de carte à 16 chiffres est remplacé par un **Token** (un faux numéro d'apparence identique).
2. Ce Token est verrouillé pour un usage spécifique : par exemple, utilisable uniquement sur un iPhone précis via Apple Pay, ou utilisable uniquement chez Netflix.
3. Si le marchand se fait pirater, le token volé est **inutilisable ailleurs**.

---

## 8. Comment CortexPay s'Insère dans cet Écosystème

Pour une FinTech opérant en Afrique de l'Ouest (zone UEMOA / XOF) comme **CortexPay**, la carte virtuelle Visa résout un problème structurel : **le blocage des paiements internationaux en ligne par Mobile Money**.

### Le Modèle Opérationnel CortexPay :
1. **Acquisition locale de fonds (On-ramp)** :
   * Le client utilise son compte **Wave** ou **Orange Money** en Francs CFA (XOF).
   * CortexPay encaisse les XOF via push USSD.
2. **Moteur FX & Trésorerie (Quote Locking)** :
   * CortexPay convertit les XOF en USD au taux avec spread (+3.5% à 4.5%).
   * Le compte pivot `FX_CLEARING` garantit l'équilibre bilanciel en partie double.
3. **Partenariat d'Émission (BIN Sponsorship / BaaS)** :
   * CortexPay s'adosse à un sponsor bancaire agréé Visa (ex: banque partenaire ou fournisseur BaaS certifié Visa Principal Member).
   * CortexPay émet des cartes virtuelles Visa internationales prépayées en USD.
4. **Monétisation Multiple pour CortexPay** :
   * **Marge de change FX** : 3.5% à 4.5% sur chaque conversion XOF $\rightarrow$ USD.
   * **Interchange Fee** : ~1.5% reversé par Visa sur les volumes de dépenses marchandes.
   * **Frais de création de carte / abonnement mensuel** (optionnel).

---

## 9. Glossaire Business & FinTech Express

- **BIN (Bank Identification Number)** : Les 6 ou 8 premiers chiffres identifiant la banque émettrice.
- **Card Scheme** : Le réseau de cartes (Visa, Mastercard).
- **Chargeback (Rétrofacturation)** : Procédure où le client conteste un débit auprès de sa banque en cas de fraude ou non-livraison, contraignant le marchand à rembourser.
- **Interchange Fee** : Commission versée par l'acquéreur du marchand à la banque émettrice de la carte.
- **PCI-DSS** : Norme de sécurité internationale ultra-stricte imposée à toute entité qui stocke, traite ou transmet des numéros de carte bancaire.
- **Settlement** : Virement réel des fonds entre banques en compensation finale.
- **3D-Secure (Visa Secure / Verified by Visa)** : Protocole d'authentification forte (OTP SMS, validation biométrique dans l'application) transférant la responsabilité de la fraude du marchand vers l'émetteur (*Liability Shift*).
