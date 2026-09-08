import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, TextInput, Button, Switch, SegmentedButtons, HelperText } from 'react-native-paper';
import { useThemedStyles, Theme } from '@/modules/shared/theme';
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

  const selectedCard = cards[0];

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
              { value: 'WAVE', label: 'Wave USSD' },
              { value: 'ORANGE_MONEY', label: 'Orange Money' },
            ]}
            style={styles.operatorButtons}
          />
          <TextInput
            label="Numéro mobile"
            value={phone}
            onChangeText={setPhone}
            mode="outlined"
            style={styles.input}
          />
          <HelperText type="info">Terminer par 999 pour simuler un rejet USSD utilisateur.</HelperText>

          <TextInput
            label="Montant Recharge (XOF)"
            value={depositAmount}
            onChangeText={setDepositAmount}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Code OTP Déterministe"
            value={otp}
            onChangeText={setOtp}
            mode="outlined"
            style={styles.input}
          />

          <Button
            mode="contained"
            buttonColor="#3B82F6"
            onPress={() => onSimulateDeposit(operator, depositAmount, phone, otp)}
            loading={isDepositing}
            disabled={isDepositing}
            style={styles.actionBtn}
          >
            Déclencher Push USSD & Créditer Wallet
          </Button>
        </View>
      ) : (
        <View style={styles.tabContent}>
          {!selectedCard ? (
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
                label="Montant du prélèvement (USD)"
                value={debitAmount}
                onChangeText={setDebitAmount}
                keyboardType="numeric"
                mode="outlined"
                style={styles.input}
              />

              <View style={styles.switchRow}>
                <View style={styles.switchTextContainer}>
                  <Text variant="bodyMedium" style={styles.switchTitle}>
                    ⚡ Scénario de Chaos (Coupure Réseau)
                  </Text>
                  <Text variant="bodySmall" style={styles.switchSub}>
                    Simule un crash réseau lors du débit et vérifie le rollback automatique du solde.
                  </Text>
                </View>
                <Switch value={simulateChaos} onValueChange={setSimulateChaos} color="#EF4444" />
              </View>

              <Button
                mode="contained"
                buttonColor={simulateChaos ? '#EF4444' : '#10B981'}
                onPress={() => onSimulateDebit(selectedCard.card_id, merchant, debitAmount, simulateChaos)}
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
      marginVertical: 10,
    },
    title: {
      fontWeight: 'bold',
      color: theme.colors.onSurface,
    },
    subtitle: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 12,
    },
    segmented: {
      marginBottom: 14,
    },
    tabContent: {
      gap: 8,
    },
    operatorButtons: {
      marginBottom: 6,
    },
    input: {
      marginBottom: 4,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 10,
      backgroundColor: '#FEF2F2',
      borderRadius: 10,
      marginVertical: 6,
    },
    switchTextContainer: {
      flex: 1,
      paddingRight: 10,
    },
    switchTitle: {
      fontWeight: 'bold',
      color: '#991B1B',
    },
    switchSub: {
      color: '#B91C1C',
      fontSize: 11,
    },
    actionBtn: {
      marginTop: 8,
    },
    noCardText: {
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      padding: 20,
    },
  });
