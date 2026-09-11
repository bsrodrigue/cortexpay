import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, SegmentedButtons, Surface, Switch, Text, TextInput } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

import { VirtualCard } from '../types';

interface SimulatorPanelProps {
  cards: VirtualCard[];
  onSimulateDeposit: (operator: 'WAVE' | 'ORANGE_MONEY', amount: string, phone: string, otp: string) => Promise<void>;
  onSimulateDebit: (cardId: string, merchant: string, amountUsd: string, simulateChaos: boolean) => Promise<void>;
  isDepositing: boolean;
  isDebiting: boolean;
}

export const SimulatorPanel: React.FC<SimulatorPanelProps> = ({
  cards,
  onSimulateDeposit,
  onSimulateDebit,
  isDepositing,
  isDebiting,
}) => {
  const styles = useThemedStyles(createStyles);
  const [activeTab, setActiveTab] = useState<'DEPOSIT' | 'DEBIT'>('DEPOSIT');

  // Deposit state
  const [operator, setOperator] = useState<'WAVE' | 'ORANGE_MONEY'>('WAVE');
  const [depositAmount, setDepositAmount] = useState('50000');
  const [phone, setPhone] = useState('+221771234567');
  const [otp, setOtp] = useState('123456');

  // Debit state
  const [merchant, setMerchant] = useState('OpenAI');
  const [debitAmount, setDebitAmount] = useState('20.00');
  const [simulateChaos, setSimulateChaos] = useState(false);

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
        onValueChange={(val) => setActiveTab(val as 'DEPOSIT' | 'DEBIT')}
        buttons={[
          { value: 'DEPOSIT', label: 'Push Mobile Money' },
          { value: 'DEBIT', label: 'Débit SaaS (Chaos)' },
        ]}
        style={styles.segmented}
      />

      {activeTab === 'DEPOSIT' ? (
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
      ) : (
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
            </>
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
    input: {
      marginBottom: 10,
    },
    actionBtn: {
      marginTop: 6,
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
  });
