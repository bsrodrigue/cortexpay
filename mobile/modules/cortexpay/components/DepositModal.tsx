import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Modal, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

interface DepositModalProps {
  visible: boolean;
  onDismiss: () => void;
  onDeposit: (operator: 'WAVE' | 'ORANGE_MONEY', amount: string, phone: string, otp: string) => Promise<void>;
  isDepositing: boolean;
}

export const DepositModal: React.FC<DepositModalProps> = ({
  visible,
  onDismiss,
  onDeposit,
  isDepositing,
}) => {
  const styles = useThemedStyles(createStyles);
  const [operator, setOperator] = useState<'WAVE' | 'ORANGE_MONEY'>('WAVE');
  const [amount, setAmount] = useState('25000');
  const [phone, setPhone] = useState('+221771234567');
  const [otp, setOtp] = useState('123456');

  const handleConfirm = () => {
    void onDeposit(operator, amount, phone, otp)
      .then(() => {
        onDismiss();
      })
      .catch((e) => {
        console.error(e);
      });
  };

  const isInvalid = !amount || Number(amount) <= 0 || !phone;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <Text variant="headlineSmall" style={styles.modalTitle}>
          Recharger en XOF
        </Text>
        <Text variant="bodySmall" style={styles.subtitle}>
          Dépôt instantané par Mobile Money (Push USSD)
        </Text>

        <SegmentedButtons
          value={operator}
          onValueChange={(val) => setOperator(val as 'WAVE' | 'ORANGE_MONEY')}
          buttons={[
            { value: 'WAVE', label: 'Wave Senegal' },
            { value: 'ORANGE_MONEY', label: 'Orange Money' },
          ]}
          style={styles.segmented}
        />

        <TextInput
          label="Montant (XOF)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          mode="outlined"
          style={styles.input}
        />

        <TextInput
          label="Numéro de téléphone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          mode="outlined"
          style={styles.input}
        />

        {operator === 'ORANGE_MONEY' && (
          <TextInput
            label="Code d'autorisation OTP (#144#)"
            value={otp}
            onChangeText={setOtp}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
          />
        )}

        <View style={styles.actionButtons}>
          <Button mode="text" onPress={onDismiss}>
            Annuler
          </Button>
          <Button
            mode="contained"
            onPress={handleConfirm}
            loading={isDepositing}
            disabled={isDepositing || isInvalid}
            style={styles.confirmBtn}
          >
            Confirmer la recharge
          </Button>
        </View>
      </Modal>
    </Portal>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    modal: {
      backgroundColor: theme.colors.surface,
      margin: 20,
      padding: 24,
      borderRadius: 20,
    },
    modalTitle: {
      fontWeight: 'bold',
      color: theme.colors.onSurface,
    },
    subtitle: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 16,
      marginTop: 4,
    },
    segmented: {
      marginBottom: 16,
    },
    input: {
      marginBottom: 12,
    },
    actionButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
      marginTop: 12,
    },
    confirmBtn: {
      minWidth: 160,
    },
  });
