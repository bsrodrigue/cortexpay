import React, { useState } from 'react';
import { ScrollView, View, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Text, Surface, Button, Portal, Modal, TextInput, IconButton } from 'react-native-paper';
import { useThemedStyles, Theme } from '@/modules/shared/theme';
import { SideMenu } from '@/modules/shared/components/SideMenu';
import { useAuthStore } from '@/modules/auth/store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useWallets,
  useUserCards,
  useDepositMobileMoney,
  useFXQuote,
  useConvertCurrency,
  useIssueCard,
  useToggleFreezeCard,
  useSimulateMerchantDebit,
} from '../hooks';
import { VirtualCardView } from '../components/VirtualCardView';
import { ConvertModal } from '../components/ConvertModal';
import { DepositModal } from '../components/DepositModal';
import { SimulatorPanel } from '../components/SimulatorPanel';

export const CortexDashboardScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuthStore();
  const [menuVisible, setMenuVisible] = useState(false);

  // Queries
  const { data: walletsData, isLoading: isLoadingWallets, refetch: refetchWallets } = useWallets();
  const { data: cards, isLoading: isLoadingCards, refetch: refetchCards } = useUserCards();

  // Mutations
  const depositMutation = useDepositMobileMoney();
  const fxQuoteMutation = useFXQuote();
  const convertMutation = useConvertCurrency();
  const issueCardMutation = useIssueCard();
  const freezeMutation = useToggleFreezeCard();
  const debitMutation = useSimulateMerchantDebit();

  // Modal states
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [convertModalVisible, setConvertModalVisible] = useState(false);
  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [simulatorModalVisible, setSimulatorModalVisible] = useState(false);

  const [cardholderName, setCardholderName] = useState(
    user ? `${user.first_name} ${user.last_name || ''}`.trim() : 'Solo Dev Lead'
  );
  const [initialFunding, setInitialFunding] = useState('25.00');

  const xofWallet = walletsData?.wallets?.XOF;
  const usdWallet = walletsData?.wallets?.USD;

  const handleRefresh = () => {
    refetchWallets();
    refetchCards();
  };

  const handleIssueCardSubmit = async () => {
    try {
      await issueCardMutation.mutateAsync({
        cardholderName,
        initialFundingUsd: initialFunding,
      });
      setIssueModalVisible(false);
      Alert.alert('Succès', 'Carte virtuelle USD émise et provisionnée avec succès !');
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.detail || e.message);
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
    } catch (e: any) {
      Alert.alert('Échec Recharge', e?.response?.data?.detail || e.message);
      throw e;
    }
  };

  const handleConvertSubmit = async (quoteId: string) => {
    try {
      await convertMutation.mutateAsync({ quoteId });
      Alert.alert('Succès', 'Conversion effectuée instantanément au taux garanti.');
    } catch (e: any) {
      Alert.alert('Échec Conversion', e?.response?.data?.detail || e.message);
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
    } catch (e: any) {
      Alert.alert('Erreur Simulation', e?.response?.data?.detail || e.message);
    }
  };

  return (
    <View style={[styles.rootWrapper, { paddingTop: insets.top }]}>
      <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={isLoadingWallets || isLoadingCards} onRefresh={handleRefresh} />}
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
              onPress={() => setSimulatorModalVisible(true)}
              accessibilityLabel="Mode Test / Sandbox"
            />
          </View>
        </View>

        {/* Wallets Overview */}
        <View style={styles.walletsRow}>
          <Surface style={styles.walletCard} elevation={2}>
            <Text variant="labelMedium" style={styles.walletLabel}>
              PORTEFEUILLE XOF
            </Text>
            <Text variant="headlineSmall" style={styles.walletAmount}>
              {Number(xofWallet?.balance || 0).toLocaleString()} XOF
            </Text>
          </Surface>

          <Surface style={styles.walletCard} elevation={2}>
            <Text variant="labelMedium" style={styles.walletLabel}>
              PORTEFEUILLE USD
            </Text>
            <Text variant="headlineSmall" style={styles.walletAmountUsd}>
              ${Number(usdWallet?.balance || 0).toFixed(2)} USD
            </Text>
          </Surface>
        </View>

        {/* Consumer Quick Actions */}
        <View style={styles.quickActionsContainer}>
          <Button
            mode="contained"
            icon="plus"
            onPress={() => setDepositModalVisible(true)}
            style={styles.actionBtn}
            contentStyle={styles.actionBtnContent}
          >
            Recharger
          </Button>
          <Button
            mode="contained-tonal"
            icon="swap-horizontal"
            onPress={() => setConvertModalVisible(true)}
            style={styles.actionBtn}
            contentStyle={styles.actionBtnContent}
          >
            Convertir
          </Button>
          <Button
            mode="outlined"
            icon="credit-card-plus-outline"
            onPress={() => setIssueModalVisible(true)}
            style={styles.actionBtn}
            contentStyle={styles.actionBtnContent}
          >
            + Carte
          </Button>
        </View>

        {/* Cards Section */}
        <View style={styles.sectionHeader}>
          <Text variant="titleLarge" style={styles.sectionTitle}>
            Mes Cartes Virtuelles USD ({cards?.length || 0})
          </Text>
        </View>

        {cards && cards.length > 0 ? (
          cards.map((c) => (
            <VirtualCardView
              key={c.card_id}
              card={c}
              onToggleFreeze={(cardId) => freezeMutation.mutate(cardId)}
              isFreezing={freezeMutation.isPending}
            />
          ))
        ) : (
          <Surface style={styles.emptyCardContainer} elevation={1}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              Vous n'avez pas encore de carte virtuelle USD active.
            </Text>
            <Button
              mode="contained"
              icon="credit-card-plus"
              onPress={() => setIssueModalVisible(true)}
              style={styles.emptyBtn}
            >
              Créer ma 1ère Carte Virtuelle USD
            </Button>
          </Surface>
        )}

        {/* Convert Modal (with background quote locking) */}
        <ConvertModal
          visible={convertModalVisible}
          onDismiss={() => setConvertModalVisible(false)}
          xofBalance={xofWallet?.balance || '0'}
          onGetQuote={async (amt) => fxQuoteMutation.mutateAsync({ from_amount_xof: amt })}
          onExecuteConvert={handleConvertSubmit}
          isGettingQuote={fxQuoteMutation.isPending}
          isConverting={convertMutation.isPending}
        />

        {/* Deposit Modal */}
        <DepositModal
          visible={depositModalVisible}
          onDismiss={() => setDepositModalVisible(false)}
          onDeposit={handleDepositSubmit}
          isDepositing={depositMutation.isPending}
        />

        {/* Sandbox / Simulator Modal */}
        <Portal>
          <Modal
            visible={simulatorModalVisible}
            onDismiss={() => setSimulatorModalVisible(false)}
            contentContainerStyle={styles.simulatorModalContent}
          >
            <View style={styles.modalCloseRow}>
              <IconButton icon="close" size={20} onPress={() => setSimulatorModalVisible(false)} />
            </View>
            <SimulatorPanel
              cards={cards || []}
              onSimulateDeposit={handleDepositSubmit}
              onSimulateDebit={handleSimulateDebit}
              isDepositing={depositMutation.isPending}
              isDebiting={debitMutation.isPending}
            />
          </Modal>
        </Portal>

        {/* Issue Card Modal */}
        <Portal>
          <Modal
            visible={issueModalVisible}
            onDismiss={() => setIssueModalVisible(false)}
            contentContainerStyle={styles.modalContent}
          >
            <Text variant="titleLarge" style={styles.modalTitle}>
              Créer une Carte Virtuelle USD
            </Text>
            <TextInput
              label="Nom du titulaire"
              value={cardholderName}
              onChangeText={setCardholderName}
              mode="outlined"
              style={styles.modalInput}
            />
            <TextInput
              label="Provisionnement initial (USD)"
              value={initialFunding}
              onChangeText={setInitialFunding}
              keyboardType="numeric"
              mode="outlined"
              style={styles.modalInput}
            />
            <Button
              mode="contained"
              onPress={handleIssueCardSubmit}
              loading={issueCardMutation.isPending}
              disabled={issueCardMutation.isPending}
              style={styles.modalBtn}
            >
              Émettre la carte
            </Button>
          </Modal>
        </Portal>
      </ScrollView>
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
    modalContent: {
      backgroundColor: '#FFFFFF',
      padding: 20,
      margin: 20,
      borderRadius: 16,
    },
    simulatorModalContent: {
      backgroundColor: 'transparent',
      margin: 10,
    },
    modalCloseRow: {
      alignItems: 'flex-end',
      marginBottom: -10,
      zIndex: 10,
    },
    modalTitle: {
      fontWeight: 'bold',
      marginBottom: 16,
    },
    modalInput: {
      marginBottom: 12,
    },
    modalBtn: {
      marginTop: 8,
    },
  });
