import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, AppStateStatus, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, IconButton, Surface, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getApiErrorMessage } from '@/libs/api/errors';
import { BiometricService } from '@/modules/auth/services/biometricService';
import { useAuthStore } from '@/modules/auth/store';
import { SideMenu } from '@/modules/shared/components/SideMenu';
import { Theme, useThemedStyles } from '@/modules/shared/theme';

import { ActiveModalType,DashboardModals } from '../components/DashboardModals';
import { NeobankActionRow } from '../components/NeobankActionRow';
import { NeobankCardView } from '../components/NeobankCardView';
import { NeobankHeroBalance } from '../components/NeobankHeroBalance';
import { TransactionHistory } from '../components/TransactionHistory';
import {
  useConvertCurrency,
  useDepositMobileMoney,
  useExportLedgerCsv,
  useFXQuote,
  useInitiate3DSChallenge,
  useIssueCard,
  useKYCStatus,
  useOpenDispute,
  useResolveDispute,
  useRunReconciliation,
  useSimulateKYCDecision,
  useSimulateMerchantDebit,
  useSubmitKYC,
  useToggleFreezeCard,
  useTopupCard,
  useTransactions,
  useUpdateCardSpendingLimit,
  useUserCards,
  useUserDisputes,
  useVerify3DSChallenge,
  useWallets,
  useWithdrawMobileMoney,
} from '../hooks';
import { LedgerEntry, ThreeDSChallenge, VirtualCard } from '../types';

const LOCK_TIMEOUT_MS = 60 * 1000; // 1 minute in background locks app

export const CortexDashboardScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuthStore();
  const [menuVisible, setMenuVisible] = useState(false);

  // Queries
  const { data: walletsData, isLoading: isLoadingWallets, refetch: refetchWallets } = useWallets();
  const { data: cards, isLoading: isLoadingCards, refetch: refetchCards } = useUserCards();
  const { kycData, isApproved: isKYCApproved, refetch: refetchKYC } = useKYCStatus();
  const {
    data: transactions = [],
    isLoading: isLoadingTransactions,
    refetch: refetchTransactions,
  } = useTransactions(20);
  const { data: userDisputes, refetch: refetchDisputes } = useUserDisputes();

  // Mutations
  const depositMutation = useDepositMobileMoney();
  const withdrawMutation = useWithdrawMobileMoney();
  const fxQuoteMutation = useFXQuote();
  const convertMutation = useConvertCurrency();
  const issueCardMutation = useIssueCard();
  const freezeMutation = useToggleFreezeCard();
  const topupCardMutation = useTopupCard();
  const updateLimitMutation = useUpdateCardSpendingLimit();
  const debitMutation = useSimulateMerchantDebit();
  const submitKYCMutation = useSubmitKYC();
  const simulateKYCDecisionMutation = useSimulateKYCDecision();
  const initiate3DSMutation = useInitiate3DSChallenge();
  const verify3DSMutation = useVerify3DSChallenge();
  const runReconciliationMutation = useRunReconciliation();
  const exportLedgerMutation = useExportLedgerCsv();
  const openDisputeMutation = useOpenDispute();
  const resolveDisputeMutation = useResolveDispute();

  // Unified Modal state
  const [activeModal, setActiveModal] = useState<ActiveModalType>(null);
  const [selectedCard, setSelectedCard] = useState<VirtualCard | null>(null);
  const [active3DSChallenge, setActive3DSChallenge] = useState<ThreeDSChallenge | null>(null);

  const effectiveUserId = user?.user_id || (user?.id ? `usr_${user.id}` : 'usr_cortex_demo');
  const [cardholderName, setCardholderName] = useState(
    user ? `${user.first_name} ${user.last_name}`.trim() : 'Solo Dev Lead'
  );
  const [initialFunding, setInitialFunding] = useState('25.00');
  const [cardType, setCardType] = useState<'STANDARD' | 'BUSINESS'>('STANDARD');
  const [cardLabel, setCardLabel] = useState('Ma Carte Cortex');

  const xofWallet = walletsData?.wallets.XOF;
  const usdWallet = walletsData?.wallets.USD;

  const [isAppLocked, setIsAppLocked] = useState(false);
  const lastBackgroundTime = useRef<number | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        lastBackgroundTime.current = Date.now();
      } else if (nextAppState === 'active') {
        if (lastBackgroundTime.current && Date.now() - lastBackgroundTime.current > LOCK_TIMEOUT_MS) {
          setIsAppLocked(true);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleBiometricUnlock = async () => {
    const success = await BiometricService.authenticate('Déverrouillez CortexPay');
    if (success) {
      setIsAppLocked(false);
      lastBackgroundTime.current = null;
    }
  };

  const handleRefresh = () => {
    void refetchWallets();
    void refetchCards();
    void refetchKYC();
    void refetchTransactions();
    void refetchDisputes();
  };

  const handleOpenIssueCard = () => {
    if (!isKYCApproved) {
      setActiveModal('KYC');
      return;
    }
    setActiveModal('ISSUE_CARD');
  };

  const handleIssueCardSubmit = async () => {
    try {
      await issueCardMutation.mutateAsync({
        cardholderName,
        initialFundingUsd: initialFunding,
        card_type: cardType,
        label: cardLabel,
      });
      setActiveModal(null);
      Alert.alert('Succès', `Carte virtuelle ${cardType === 'BUSINESS' ? 'Business ($10k)' : 'Standard ($5k)'} émise et provisionnée avec succès !`);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { detail?: string } }; message?: string };
      if (err.response?.status === 403) {
        setActiveModal('KYC');
      } else {
        Alert.alert('Erreur', err.response?.data?.detail || err.message || 'Erreur');
      }
    }
  };

  const handleInitiate3DS = async (cardId: string, merchant: string, amountUsd: string) => {
    try {
      const challenge = await initiate3DSMutation.mutateAsync({
        cardId,
        merchantName: merchant,
        amountUsd,
      });
      setActive3DSChallenge(challenge);
      setActiveModal('THREE_DS');
    } catch (e: unknown) {
      Alert.alert('Erreur 3DS', getApiErrorMessage(e));
    }
  };

  const handleVerify3DS = async (challengeId: string, otpCode: string, cardId: string) => {
    try {
      await verify3DSMutation.mutateAsync({
        challengeId,
        otpCode,
        cardId,
      });
      Alert.alert('🛡️ 3DS Validé', `Paiement marchand de $${Number(active3DSChallenge?.amount || '0').toFixed(2)} USD confirmé avec succès !`);
      setActive3DSChallenge(null);
      return;
    } catch (e: unknown) {
      throw e;
    }
  };

  const handleDepositSubmit = async (
    operator: 'WAVE' | 'ORANGE_MONEY',
    amount: string,
    phone: string,
    otp: string
  ) => {
    try {
      await depositMutation.mutateAsync({
        operator,
        amount,
        phone_number: phone,
        otp_code: otp,
      });
      Alert.alert('Recharge Réussie', `+${Number(amount).toLocaleString()} XOF crédités via ${operator}.`);
    } catch (e: unknown) {
      Alert.alert('Échec Recharge', getApiErrorMessage(e));
      throw e;
    }
  };

  const handleWithdrawSubmit = async (
    operator: 'WAVE' | 'ORANGE_MONEY',
    amount: string,
    phone: string
  ) => {
    try {
      await withdrawMutation.mutateAsync({
        operator,
        amount,
        phone_number: phone,
      });
      Alert.alert('Retrait Confirmé', `${Number(amount).toLocaleString()} XOF transférés vers votre compte ${operator}.`);
    } catch (e: unknown) {
      Alert.alert('Échec Retrait', getApiErrorMessage(e));
      throw e;
    }
  };

  const handleTopupCardSubmit = async (cardId: string, amountUsd: string) => {
    try {
      await topupCardMutation.mutateAsync({ cardId, amountUsd });
      Alert.alert('Carte Rechargée', `+$${Number(amountUsd).toFixed(2)} USD ajoutés à votre carte.`);
      setActiveModal(null);
    } catch (e: unknown) {
      Alert.alert('Échec Recharge Carte', getApiErrorMessage(e));
      throw e;
    }
  };

  const handleUpdateLimitSubmit = async (cardId: string, newLimitUsd: string) => {
    try {
      await updateLimitMutation.mutateAsync({ cardId, spendingLimitMonthly: newLimitUsd });
      Alert.alert('Plafond Mis à Jour', `Nouveau plafond mensuel : $${Number(newLimitUsd).toFixed(0)} USD.`);
      setActiveModal(null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      Alert.alert('Échec Modification', err.response?.data?.detail || err.message || 'Erreur');
      throw e;
    }
  };

  const handleConvertSubmit = async (quoteId: string) => {
    try {
      await convertMutation.mutateAsync({ quoteId });
      Alert.alert('Succès', 'Conversion effectuée instantanément au taux garanti.');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      Alert.alert('Échec Conversion', err.response?.data?.detail || err.message || 'Erreur');
      throw e;
    }
  };

  const handleSimulateDebit = async (
    cardId: string,
    merchant: string,
    amountUsd: string,
    simulateChaos: boolean
  ) => {
    try {
      const res = await debitMutation.mutateAsync({
        card_id: cardId,
        merchant_name: merchant,
        amount_usd: amountUsd,
        simulate_network_failure: simulateChaos,
      });

      if (res.rolled_back) {
        Alert.alert(
          '🛡️ Rollback de Compensation Exécuté',
          `Coupure réseau simulée détectée.\nLe prélèvement de ${amountUsd} USD a été automatiquement compensé et restitué sur le compte.`
        );
      } else if (res.approved) {
        Alert.alert('Prélèvement Autorisé', `Débit marchand ${merchant} de ${amountUsd} USD validé avec succès.`);
      } else {
        Alert.alert('Prélèvement Refusé', res.decline_reason || 'Paiement décliné.');
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      Alert.alert('Erreur Simulation', err.response?.data?.detail || err.message || 'Erreur');
    }
  };

  const handleRunReconciliation = async (
    provider: 'WAVE' | 'ORANGE_MONEY',
    simulateDiscrepancy: boolean
  ) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const mockStatements = [
        {
          reference: `STMT_${provider}_${today}`,
          amount: simulateDiscrepancy ? '15000.00' : '25000.00',
        },
      ];

      const res = await runReconciliationMutation.mutateAsync({
        provider,
        reconciliation_date: today,
        partner_statements: mockStatements,
      });

      const discrepancyCount = res.discrepancies.length;
      if (discrepancyCount > 0) {
        Alert.alert(
          '⚠️ Écart Détecté (Audit Flagged)',
          `Rapprochement terminé avec ${discrepancyCount} anomalie(s).\nTotal Grand Livre: ${Number(res.total_ledger).toLocaleString()} XOF\nTotal Opérateur: ${Number(res.total_partner).toLocaleString()} XOF\nÉcart net: ${Number(res.discrepancy_total).toLocaleString()} XOF.`
        );
      } else {
        Alert.alert(
          '✅ Rapprochement Parfait',
          `Toutes les écritures du Grand Livre concordent exactement avec les relevés ${provider} (${res.matched_count} concordances, 0 écart).`
        );
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      Alert.alert('Erreur Rapprochement', err.response?.data?.detail || err.message || 'Erreur');
    }
  };

  const handleExportLedger = async () => {
    try {
      const csvData = await exportLedgerMutation.mutateAsync();
      const fileName = `cortex_grand_livre_${new Date().toISOString().split('T')[0]}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, csvData, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exporter le Grand Livre CortexPay (Audit Trail)',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Export Réussi', `Fichier sauvegardé localement : ${fileName}`);
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      Alert.alert('Échec Export', err.response?.data?.detail || err.message || 'Impossible d\'exporter le Grand Livre.');
    }
  };

  const handleOpenDispute = (entry: LedgerEntry) => {
    // Extract card debit posting
    const cardPost = entry.postings.find((p) => p.account_number.startsWith('CARD_ACC_'));
    const cardId = cardPost ? cardPost.account_number.replace('CARD_ACC_', '') : (cards?.[0]?.card_id || 'card_unknown');
    const amountUsd = cardPost ? String(cardPost.amount) : '20.00';

    Alert.alert(
      '🛡️ Litige Visa / Contestation',
      `Confirmez-vous l'ouverture d'un litige pour le prélèvement de $${amountUsd} USD (Réf: ${entry.reference}) ?\n\n` +
      `Motif: Débit frauduleux ou marchand non conforme.\n` +
      `L'état passera à OPENED conformément à la Dispute FSM.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Ouvrir le Litige',
          style: 'destructive',
          onPress: () => {
            void openDisputeMutation
              .mutateAsync({
                transactionReference: entry.reference,
                cardId,
                amount: amountUsd,
                reason: 'FRAUD_OR_UNAUTHORIZED_CHARGE',
                description: `Contestation client pour ${entry.narration}`,
              })
              .then((dispute) => {
                Alert.alert(
                  '✅ Litige Ouvert (FSM: OPENED)',
                  `Dossier de contestation n° ${dispute.dispute_id} enregistré avec succès.\n` +
                  `Statut: OPENED (Sous revue conformité Visa).`
                );
              })
              .catch((e: unknown) => {
                Alert.alert('Erreur Litige', getApiErrorMessage(e));
              });
          },
        },
      ]
    );
  };

  const handleResolveDispute = async (disputeId: string, decision: 'WON' | 'LOST') => {
    try {
      const res = await resolveDisputeMutation.mutateAsync({
        disputeId,
        decision,
        resolutionNotes: `Arbitrage Visa simulé : ${decision === 'WON' ? 'Favorable au porteur (Chargeback)' : 'Défavorable (Frais maintenus)'}`,
      });
      Alert.alert(
        'Arbitrage Terminé',
        `Litige ${disputeId} arbitré avec succès.\nNouveau statut : ${res.status}\n` +
          (decision === 'WON' ? 'Le crédit de remboursement a été inscrit au Grand Livre.' : 'Dossier clos sans remboursement.')
      );
    } catch (e: unknown) {
      Alert.alert('Erreur Arbitrage', getApiErrorMessage(e, 'Échec de l\'arbitrage'));
    }
  };

  return (
    <View style={[styles.rootWrapper, { paddingTop: insets.top }]}>
      <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingWallets || isLoadingCards || isLoadingTransactions}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* Header & Greeting */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <IconButton
              icon="menu"
              size={26}
              onPress={() => setMenuVisible(true)}
              style={styles.menuButton}
            />
            <View style={styles.headerTitles}>
              <Text variant="headlineSmall" style={styles.appTitle}>
                CortexPay
              </Text>
              <Text variant="bodySmall" style={styles.appSubtitle}>
                {user ? `Bonjour, ${user.first_name}` : 'FinTech Multi-Devises'}
              </Text>
            </View>
            <IconButton
              icon="flask-outline"
              size={22}
              iconColor="#6B7280"
              onPress={() => setActiveModal('SIMULATOR')}
              accessibilityLabel="Mode Test / Sandbox"
            />
          </View>
        </View>

        {/* KYC Compliance Banner if not Tier 1 approved */}
        {!isKYCApproved && (
          <Surface style={styles.kycBanner} elevation={1}>
            <View style={styles.kycBannerLeft}>
              <Text variant="labelLarge" style={styles.kycBannerTitle}>
                🛡️ Conformité Réglementaire (KYC)
              </Text>
              <Text variant="bodySmall" style={styles.kycBannerSubtitle}>
                {kycData?.kyc_status === 'SUBMITTED'
                  ? 'Pièces d\'identité en cours d\'examen.'
                  : 'Vérifiez votre identité pour débloquer les cartes Visa USD.'}
              </Text>
            </View>
            <Button
              mode="contained-tonal"
              compact
              onPress={() => setActiveModal('KYC')}
              style={styles.kycBannerBtn}
            >
              {kycData?.kyc_status === 'SUBMITTED' ? 'Voir l\'état' : 'Vérifier'}
            </Button>
          </Surface>
        )}

        {/* Neobank Hero Balance (Option B: Clean Minimalist) */}
        <NeobankHeroBalance
          xofBalance={xofWallet?.balance || '0'}
          usdBalance={usdWallet?.balance || '0.00'}
          onRefresh={handleRefresh}
          isRefreshing={isLoadingWallets || isLoadingCards || isLoadingTransactions}
        />

        {/* Neobank Circular Quick Actions */}
        <NeobankActionRow
          onDeposit={() => setActiveModal('DEPOSIT')}
          onConvert={() => setActiveModal('CONVERT')}
          onWithdraw={() => setActiveModal('WITHDRAW')}
          onIssueCard={handleOpenIssueCard}
        />

        {/* Cards Section */}
        <View style={styles.sectionHeader}>
          <Text variant="titleLarge" style={styles.sectionTitle}>
            Mes Cartes Virtuelles USD ({cards?.length || 0})
          </Text>
        </View>

        {cards && cards.length > 0 ? (
          cards.map((c) => (
            <NeobankCardView
              key={c.card_id}
              card={c}
              onToggleFreeze={(cardId) => {
                freezeMutation.mutate(cardId);
              }}
              onManage={(card) => {
                setSelectedCard(card);
                setActiveModal('CARD_DETAILS');
              }}
              isFreezing={freezeMutation.isPending}
            />
          ))
        ) : (
          <Surface style={styles.emptyCardContainer} elevation={1}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {isKYCApproved
                ? 'Vous n\'avez pas encore de carte virtuelle USD active.'
                : 'Effectuez votre vérification d\'identité pour émettre votre première carte Visa.'}
            </Text>
            <Button
              mode="contained"
              icon={isKYCApproved ? 'credit-card-plus' : 'shield-account'}
              onPress={handleOpenIssueCard}
              style={styles.emptyBtn}
            >
              {isKYCApproved ? 'Créer ma 1ère Carte Virtuelle USD' : 'Valider mon identité (KYC)'}
            </Button>
          </Surface>
        )}

        {/* Double-Entry Ledger Transaction Activity */}
        <TransactionHistory
          entries={transactions}
          isLoading={isLoadingTransactions}
          onRefresh={() => void refetchTransactions()}
          onExportLedger={() => {
            void handleExportLedger();
          }}
          onOpenDispute={handleOpenDispute}
          isExporting={exportLedgerMutation.isPending}
          userId={effectiveUserId}
        />

        {/* Unified Dashboard Modals */}
        <DashboardModals
          activeModal={activeModal}
          onClose={() => {
            setActiveModal(null);
            setSelectedCard(null);
            setActive3DSChallenge(null);
          }}
          xofBalance={xofWallet?.balance || '0'}
          usdBalance={usdWallet?.balance || '0.00'}
          cards={cards || []}
          selectedCard={selectedCard}
          disputes={userDisputes || []}
          kycData={kycData}
          active3DSChallenge={active3DSChallenge}
          cardType={cardType}
          setCardType={setCardType}
          cardLabel={cardLabel}
          setCardLabel={setCardLabel}
          cardholderName={cardholderName}
          setCardholderName={setCardholderName}
          initialFunding={initialFunding}
          setInitialFunding={setInitialFunding}
          onDeposit={handleDepositSubmit}
          onWithdraw={handleWithdrawSubmit}
          onGetQuote={async (amt) => fxQuoteMutation.mutateAsync({ from_amount_xof: amt })}
          onConvert={handleConvertSubmit}
          onIssueCard={handleIssueCardSubmit}
          onTopupCard={handleTopupCardSubmit}
          onUpdateLimit={handleUpdateLimitSubmit}
          onSubmitKYC={async (params) => {
            await submitKYCMutation.mutateAsync(params);
            Alert.alert('Documents Reçus', 'Vos pièces d\'identité sont enregistrées.');
          }}
          onSimulateKYC={async (decision, tier, reason) => {
            await simulateKYCDecisionMutation.mutateAsync({ decision, tier, rejection_reason: reason });
            Alert.alert('Statut KYC mis à jour', `Décision appliquée : ${decision}`);
          }}
          onSimulateDebit={handleSimulateDebit}
          onInitiate3DS={handleInitiate3DS}
          onVerify3DS={handleVerify3DS}
          onRunReconciliation={handleRunReconciliation}
          onResolveDispute={handleResolveDispute}
          isDepositing={depositMutation.isPending}
          isWithdrawing={withdrawMutation.isPending}
          isGettingQuote={fxQuoteMutation.isPending}
          isConverting={convertMutation.isPending}
          isIssuingCard={issueCardMutation.isPending}
          isToppingUpCard={topupCardMutation.isPending}
          isUpdatingLimit={updateLimitMutation.isPending}
          isSubmittingKYC={submitKYCMutation.isPending}
          isDebiting={debitMutation.isPending}
          isInitiating3DS={initiate3DSMutation.isPending}
          isVerifying3DS={verify3DSMutation.isPending}
          isReconciling={runReconciliationMutation.isPending}
          isResolvingDispute={resolveDisputeMutation.isPending}
        />
      </ScrollView>

      {/* Biometric Security Overlay when App is locked */}
      {isAppLocked && (
        <Surface style={styles.lockOverlay} elevation={5}>
          <View style={styles.lockContent}>
            <View style={styles.lockIconCircle}>
              <IconButton icon="lock" size={42} iconColor="#2563EB" />
            </View>
            <Text variant="headlineSmall" style={styles.lockTitle}>
              CortexPay Verrouillé
            </Text>
            <Text variant="bodyMedium" style={styles.lockSubtitle}>
              Authentifiez-vous avec votre empreinte digitale ou Face ID pour accéder à vos soldes et cartes.
            </Text>
            <Button
              mode="contained"
              icon="fingerprint"
              buttonColor="#2563EB"
              onPress={() => void handleBiometricUnlock()}
              style={styles.unlockBtn}
            >
              Déverrouiller
            </Button>
          </View>
        </Surface>
      )}
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    rootWrapper: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    contentContainer: {
      padding: 16,
      paddingBottom: 40,
    },
    header: {
      marginBottom: 16,
    },
    headerTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    menuButton: {
      marginLeft: -8,
      marginRight: 4,
    },
    headerTitles: {
      flex: 1,
    },
    appTitle: {
      fontWeight: 'bold',
      color: theme.colors.primary,
    },
    appSubtitle: {
      color: theme.colors.onSurfaceVariant,
    },
    kycBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      borderRadius: 12,
      backgroundColor: '#EFF6FF',
      borderLeftWidth: 4,
      borderLeftColor: '#2563EB',
      marginBottom: 16,
    },
    kycBannerLeft: {
      flex: 1,
      marginRight: 8,
    },
    kycBannerTitle: {
      fontWeight: 'bold',
      color: '#1E40AF',
      fontSize: 13,
    },
    kycBannerSubtitle: {
      color: '#3B82F6',
      fontSize: 11,
      marginTop: 2,
    },
    kycBannerBtn: {
      borderRadius: 8,
    },
    walletsRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    walletCard: {
      flex: 1,
      padding: 14,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
    },
    walletLabel: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 11,
      fontWeight: 'bold',
    },
    walletAmount: {
      fontWeight: 'bold',
      marginTop: 4,
      color: theme.colors.onSurface,
    },
    walletAmountUsd: {
      fontWeight: 'bold',
      marginTop: 4,
      color: '#16A34A',
    },
    quickActionsContainer: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
    },
    actionBtn: {
      flex: 1,
      borderRadius: 12,
    },
    actionBtnContent: {
      paddingVertical: 4,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontWeight: 'bold',
      color: theme.colors.onSurface,
    },
    emptyCardContainer: {
      padding: 24,
      borderRadius: 14,
      alignItems: 'center',
      marginVertical: 10,
      backgroundColor: theme.colors.surfaceVariant,
    },
    emptyText: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 14,
      textAlign: 'center',
    },
    emptyBtn: {
      marginTop: 4,
    },
    lockOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      padding: 24,
    },
    lockContent: {
      alignItems: 'center',
      maxWidth: 320,
    },
    lockIconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: '#EFF6FF',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
      borderWidth: 1,
      borderColor: '#BFDBFE',
    },
    lockTitle: {
      fontWeight: 'bold',
      color: theme.colors.onSurface,
      marginBottom: 8,
      textAlign: 'center',
    },
    lockSubtitle: {
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    unlockBtn: {
      borderRadius: 12,
      paddingHorizontal: 16,
    },
  });
