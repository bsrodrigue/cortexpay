import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, HelperText, Modal, Portal, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

interface WithdrawModalProps {
  visible: boolean;
  onDismiss: () => void;
  xofBalance: string;
  onWithdraw: (operator: 'WAVE' | 'ORANGE_MONEY', amount: string, phone: string) => Promise<void>;
  isWithdrawing: boolean;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  visible,
  onDismiss,
  xofBalance,
  onWithdraw,
  isWithdrawing,
}) => {
  const styles = useThemedStyles(createStyles);
  const [operator, setOperator] = useState<'WAVE' | 'ORANGE_MONEY'>('WAVE');
  const [amount, setAmount] = useState('10000');
  const [phone, setPhone] = useState('+221771234567');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const num = Number(amount);
    if (isNaN(num) || num <= 0) {
      setError('Montant invalide.');
      return;
    }
    if (num > Number(xofBalance)) {
      setError(`Solde insuffisant (${Number(xofBalance).toLocaleString()} XOF disponibles).`);
      return;
    }
    if (!phone || phone.trim().length < 9) {
      setError('Numéro de téléphone invalide.');
      return;
    }

    setError(null);
    void onWithdraw(operator, amount, phone.trim())
      .then(() => {
        onDismiss();
      })
      .catch((e: unknown) => {
        const err = e as { response?: { data?: { detail?: string } }; message?: string };
        setError(err.response?.data?.detail || err.message || 'Échec du retrait');
      });
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modalContent}>
        <Text variant="titleLarge" style={styles.modalTitle}>
          Retrait Mobile Money (Cash-Out)
        </Text>
        <Text variant="bodySmall" style={styles.modalSubtitle}>
          Transférez instantanément vos XOF vers votre compte Wave ou Orange Money.
        </Text>

        <Text variant="labelMedium" style={styles.availableLabel}>
          Solde disponible : {Number(xofBalance).toLocaleString()} XOF
        </Text>

        <SegmentedButtons
          value={operator}
          onValueChange={(val) => setOperator(val as 'WAVE' | 'ORANGE_MONEY')}
          buttons={[
            { value: 'WAVE', label: 'Wave', icon: 'wave' },
            { value: 'ORANGE_MONEY', label: 'Orange Money', icon: 'cellphone' },
          ]}
          style={styles.segmentedButtons}
        />

        <TextInput
          label="Montant du retrait (XOF)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          mode="outlined"
          style={styles.input}
        />

        <TextInput
          label="Numéro de téléphone destinataire"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          mode="outlined"
          style={styles.input}
        />

        {error && <HelperText type="error">{error}</HelperText>}

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={isWithdrawing}
          disabled={isWithdrawing}
          style={styles.submitBtn}
        >
          Confirmer le Retrait
        </Button>

        <Button mode="text" onPress={onDismiss} style={styles.cancelBtn}>
          Annuler
        </Button>
      </Modal>
    </Portal>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    modalContent: {
      backgroundColor: theme.colors.background,
      padding: 20,
      margin: 20,
      borderRadius: 16,
    },
    modalTitle: {
      fontWeight: 'bold',
      color: theme.colors.onSurface,
    },
    modalSubtitle: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
      marginBottom: 12,
    },
    availableLabel: {
      fontWeight: '600',
      color: theme.colors.primary,
      marginBottom: 12,
    },
    segmentedButtons: {
      marginBottom: 16,
    },
    input: {
      marginBottom: 12,
      backgroundColor: theme.colors.surface,
    },
    submitBtn: {
      marginTop: 8,
      borderRadius: 8,
    },
    cancelBtn: {
      marginTop: 8,
    },
  });
