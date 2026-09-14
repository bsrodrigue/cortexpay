import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, SegmentedButtons, Surface, Switch, Text, TextInput } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

import { Dispute, VirtualCard } from '../types';

interface SimulatorPanelProps {
  cards: VirtualCard[];
  disputes?: Dispute[];
  onSimulateDeposit: (operator: 'WAVE' | 'ORANGE_MONEY', amount: string, phone: string, otp: string) => Promise<void>;
  onSimulateDebit: (cardId: string, merchant: string, amountUsd: string, simulateChaos: boolean) => Promise<void>;
  onInitiate3DS?: (cardId: string, merchant: string, amountUsd: string) => Promise<void>;
  onRunReconciliation?: (provider: 'WAVE' | 'ORANGE_MONEY', withDiscrepancy: boolean) => Promise<void>;
  onResolveDispute?: (disputeId: string, decision: 'WON' | 'LOST') => Promise<void>;
  isDepositing: boolean;
  isDebiting: boolean;
  isInitiating3DS?: boolean;
  isReconciling?: boolean;
  isResolvingDispute?: boolean;
}

export const SimulatorPanel: React.FC<SimulatorPanelProps> = ({
  cards,
  disputes = [],
  onSimulateDeposit,
  onSimulateDebit,
  onInitiate3DS,
  onRunReconciliation,
  onResolveDispute,
  isDepositing,
  isDebiting,
  isInitiating3DS = false,
  isReconciling = false,
  isResolvingDispute = false,
}) => {
  const styles = useThemedStyles(createStyles);
  const [activeTab, setActiveTab] = useState<'DEPOSIT' | 'DEBIT' | 'RECONCILIATION' | 'DISPUTES'>('DEPOSIT');

  // Deposit state
  const [operator, setOperator] = useState<'WAVE' | 'ORANGE_MONEY'>('WAVE');
  const [depositAmount, setDepositAmount] = useState('50000');
  const [phone, setPhone] = useState('+221771234567');
  const [otp, setOtp] = useState('123456');

  // Debit state
  const [merchant, setMerchant] = useState('OpenAI');
  const [debitAmount, setDebitAmount] = useState('20.00');
  const [simulateChaos, setSimulateChaos] = useState(false);

  // Reconciliation state
  const [recProvider, setRecProvider] = useState<'WAVE' | 'ORANGE_MONEY'>('WAVE');
  const [simulateDiscrepancy, setSimulateDiscrepancy] = useState(true);

  const hasCards = cards.length > 0;
  const firstCard = cards[0] as VirtualCard | undefined;

  const handleDeposit = () => {
    void onSimulateDeposit(operator, depositAmount, phone, otp);
  };

  const handleDebit = () => {
    if (firstCard) {
      void onSimulateDebit(firstCard.card_id, merchant, debitAmount, simulateChaos);
    }
  };

  const handle3DS = () => {
    if (firstCard && onInitiate3DS) {
      void onInitiate3DS(firstCard.card_id, merchant, debitAmount);
    }
  };

  return (
    <Surface style={styles.container} elevation={2}>
      <Text variant="titleMedium" style={styles.title}>
        🧪 Panneau Simulateur Déterministe
      </Text>
      <Text variant="bodySmall" style={styles.subtitle}>
        Validez les pushs USSD Wave/OM et testez les pannes réseau sans compte sandbox.
      </Text>

      <SegmentedButtons
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'DEPOSIT' | 'DEBIT' | 'RECONCILIATION' | 'DISPUTES')}
        buttons={[
          { value: 'DEPOSIT', label: 'Push Dépôt' },
          { value: 'DEBIT', label: 'Débit' },
          { value: 'RECONCILIATION', label: 'Audit' },
          { value: 'DISPUTES', label: 'Litiges FSM' },
        ]}
        style={styles.segmented}
      />

      {activeTab === 'DEPOSIT' && (
        <View style={styles.tabContent}>
          <SegmentedButtons
            value={operator}
            onValueChange={(val) => setOperator(val as 'WAVE' | 'ORANGE_MONEY')}
            buttons={[
              { value: 'WAVE', label: 'Wave Sénégal' },
              { value: 'ORANGE_MONEY', label: 'Orange Money' },
            ]}
            style={styles.segmentedSub}
          />

          <TextInput
            label="Numéro de téléphone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Montant (XOF)"
            value={depositAmount}
            onChangeText={setDepositAmount}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Code OTP Déterministe (Défaut: 123456)"
            value={otp}
            onChangeText={setOtp}
            mode="outlined"
            style={styles.input}
          />

          <Button
            mode="contained"
            buttonColor="#3B82F6"
            onPress={handleDeposit}
            loading={isDepositing}
            disabled={isDepositing}
            style={styles.actionBtn}
          >
            Déclencher Push USSD &amp; Créditer Wallet
          </Button>
        </View>
      )}

      {activeTab === 'DEBIT' && (
        <View style={styles.tabContent}>
          {!hasCards || !firstCard ? (
            <Text style={styles.noCardText}>Veuillez émettre une carte virtuelle avant de simuler un débit.</Text>
          ) : (
            <>
              <TextInput
                label="Marchand SaaS"
                value={merchant}
                onChangeText={setMerchant}
                mode="outlined"
                style={styles.input}
              />

              <TextInput
                label="Montant Débit (USD)"
                value={debitAmount}
                onChangeText={setDebitAmount}
                keyboardType="numeric"
                mode="outlined"
                style={styles.input}
              />

              <View style={styles.chaosRow}>
                <View style={styles.chaosLabelBox}>
                  <Text variant="labelLarge" style={styles.chaosTitle}>
                    ⚡ Simuler Coupure Réseau (Chaos)
                  </Text>
                  <Text variant="bodySmall" style={styles.chaosSubtitle}>
                    Déclenche un crash après débit pour forcer le Rollback de compensation automatique.
                  </Text>
                </View>
                <Switch value={simulateChaos} onValueChange={setSimulateChaos} color="#EF4444" />
              </View>

              <Button
                mode="contained"
                buttonColor={simulateChaos ? '#EF4444' : '#10B981'}
                onPress={handleDebit}
                loading={isDebiting}
                disabled={isDebiting}
                style={styles.actionBtn}
              >
                {simulateChaos ? 'Exécuter Test Chaos & Rollback' : 'Simuler Prélèvement SaaS'}
              </Button>

              {onInitiate3DS && (
                <Button
                  mode="outlined"
                  icon="shield-check"
                  textColor="#2563EB"
                  onPress={handle3DS}
                  loading={isInitiating3DS}
                  disabled={isInitiating3DS || isDebiting}
                  style={styles.actionBtn3DS}
                >
                  Simuler Challenge 3D Secure (OTP)
                </Button>
              )}
            </>
          )}
        </View>
      )}

      {activeTab === 'RECONCILIATION' && (
        <View style={styles.tabContent}>
          <Text variant="bodySmall" style={styles.recExplainer}>
            Compare les écritures du Grand Livre avec le relevé de l&apos;opérateur pour détecter les écarts de trésorerie (End of Day Batch).
          </Text>

          <SegmentedButtons
            value={recProvider}
            onValueChange={(val) => setRecProvider(val as 'WAVE' | 'ORANGE_MONEY')}
            buttons={[
              { value: 'WAVE', label: 'Wave Sénégal' },
              { value: 'ORANGE_MONEY', label: 'Orange Money' },
            ]}
            style={styles.segmentedSub}
          />

          <View style={styles.chaosRow}>
            <View style={styles.chaosLabelBox}>
              <Text variant="labelLarge" style={styles.chaosTitle}>
                🔍 Injecter un Écart Partenaire
              </Text>
              <Text variant="bodySmall" style={styles.chaosSubtitle}>
                Simule un montant manquant chez l&apos;opérateur pour déclencher une alerte d&apos;audit.
              </Text>
            </View>
            <Switch
              value={simulateDiscrepancy}
              onValueChange={setSimulateDiscrepancy}
              color="#F59E0B"
            />
          </View>

          <Button
            mode="contained"
            buttonColor="#4F46E5"
            icon="scale-balance"
            onPress={() => {
              if (onRunReconciliation) {
                void onRunReconciliation(recProvider, simulateDiscrepancy);
              }
            }}
            loading={isReconciling}
            disabled={isReconciling}
            style={styles.actionBtn}
          >
            Lancer le Rapprochement Automatique
          </Button>
        </View>
      )}

      {activeTab === 'DISPUTES' && (
        <View style={styles.tabContent}>
          <Text variant="bodySmall" style={styles.recExplainer}>
            Simulez l&apos;arbitrage Visa pour tester les transitions de la Dispute FSM et le crédit de compensation au Grand Livre.
          </Text>

          {disputes.length === 0 ? (
            <Text style={styles.noCardText}>
              Aucun litige ouvert. Pour tester, cliquez sur une transaction de débit dans l&apos;historique puis choisissez &quot;Contester la Transaction&quot;.
            </Text>
          ) : (
            disputes.map((d) => (
              <View key={d.dispute_id} style={styles.disputeCard}>
                <View style={styles.disputeHeaderRow}>
                  <Text variant="labelLarge" style={styles.disputeId}>
                    {d.dispute_id}
                  </Text>
                  <Text
                    variant="labelSmall"
                    style={[
                      styles.disputeStatusBadge,
                      d.status === 'WON_REFUNDED'
                        ? styles.badgeWon
                        : d.status === 'LOST_CLOSED'
                        ? styles.badgeLost
                        : styles.badgeReview,
                    ]}
                  >
                    {d.status}
                  </Text>
                </View>

                <Text variant="bodySmall" style={styles.disputeDetail}>
                  Montant : ${Number(d.amount).toFixed(2)} USD • Réf : {d.transaction_reference}
                </Text>

                {d.status === 'OPENED' || d.status === 'UNDER_REVIEW' ? (
                  <View style={styles.disputeBtnRow}>
                    <Button
                      mode="contained"
                      buttonColor="#16A34A"
                      icon="check-decagram"
                      onPress={() => {
                        if (onResolveDispute) {
                          void onResolveDispute(d.dispute_id, 'WON');
                        }
                      }}
                      loading={isResolvingDispute}
                      disabled={isResolvingDispute}
                      style={styles.arbitrateBtn}
                      contentStyle={styles.arbitrateBtnContent}
                    >
                      Arbitrer : Gain (Chargeback)
                    </Button>
                    <Button
                      mode="outlined"
                      textColor="#DC2626"
                      icon="close-octagon-outline"
                      onPress={() => {
                        if (onResolveDispute) {
                          void onResolveDispute(d.dispute_id, 'LOST');
                        }
                      }}
                      loading={isResolvingDispute}
                      disabled={isResolvingDispute}
                      style={styles.arbitrateBtn}
                      contentStyle={styles.arbitrateBtnContent}
                    >
                      Arbitrer : Rejet
                    </Button>
                  </View>
                ) : (
                  <Text variant="labelSmall" style={styles.terminalNotice}>
                    ✓ État terminal immuable (Aucune modification autorisée par la FSM)
                  </Text>
                )}
              </View>
            ))
          )}
        </View>
      )}
    </Surface>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      padding: 16,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      marginVertical: 14,
    },
    title: {
      fontWeight: 'bold',
      color: theme.colors.onSurface,
    },
    subtitle: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 12,
      marginTop: 2,
    },
    segmented: {
      marginBottom: 12,
    },
    segmentedSub: {
      marginBottom: 12,
    },
    tabContent: {
      marginTop: 6,
    },
    recExplainer: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 12,
      lineHeight: 18,
    },
    input: {
      marginBottom: 10,
    },
    actionBtn: {
      marginTop: 6,
    },
    actionBtn3DS: {
      marginTop: 8,
      borderColor: '#2563EB',
    },
    noCardText: {
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      padding: 16,
    },
    chaosRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 10,
      marginVertical: 10,
    },
    chaosLabelBox: {
      flex: 1,
      marginRight: 10,
    },
    chaosTitle: {
      fontWeight: 'bold',
      color: '#EF4444',
    },
    chaosSubtitle: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 11,
    },
    disputeCard: {
      padding: 12,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceVariant,
      marginBottom: 10,
    },
    disputeHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    disputeId: {
      fontWeight: 'bold',
      color: theme.colors.onSurface,
    },
    disputeStatusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: 'hidden',
      fontWeight: 'bold',
    },
    badgeWon: { backgroundColor: '#DCFCE7', color: '#16A34A' },
    badgeLost: { backgroundColor: '#FEE2E2', color: '#DC2626' },
    badgeReview: { backgroundColor: '#FEF3C7', color: '#D97706' },
    disputeDetail: { color: theme.colors.onSurfaceVariant, marginBottom: 8 },
    disputeBtnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    arbitrateBtn: { flex: 1, borderRadius: 8 },
    arbitrateBtnContent: { height: 36 },
    terminalNotice: { color: theme.colors.onSurfaceVariant, fontStyle: 'italic', fontSize: 11, marginTop: 4 },
  });
