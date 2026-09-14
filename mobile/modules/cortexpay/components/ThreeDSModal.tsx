import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Modal, Portal, Surface, Text, TextInput } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

import { ThreeDSChallenge } from '../types';

interface ThreeDSModalProps {
  visible: boolean;
  onDismiss: () => void;
  challenge: ThreeDSChallenge | null;
  onVerify: (challengeId: string, otpCode: string, cardId: string) => Promise<void>;
  isVerifying: boolean;
}

export const ThreeDSModal: React.FC<ThreeDSModalProps> = ({
  visible,
  onDismiss,
  challenge,
  onVerify,
  isVerifying,
}) => {
  const styles = useThemedStyles(createStyles);
  const [otpCode, setOtpCode] = useState('123456');
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (challenge?.otp_code) {
      setOtpCode(challenge.otp_code);
    } else {
      setOtpCode('123456');
    }
    setErrorText(null);
  }, [challenge]);

  if (!challenge) {
    return null;
  }

  const handleConfirm = async () => {
    try {
      setErrorText(null);
      await onVerify(challenge.challenge_id, otpCode, challenge.card_id);
      onDismiss();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setErrorText(err.response?.data?.detail || err.message || 'Échec validation 3DS');
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modalContainer}
      >
        <Surface style={styles.content} elevation={4}>
          <View style={styles.header}>
            <View style={styles.shieldBadge}>
              <Text style={styles.shieldIcon}>🛡️</Text>
            </View>
            <Text variant="headlineSmall" style={styles.title}>
              Visa 3-D Secure
            </Text>
            <Text variant="bodySmall" style={styles.subtitle}>
              Autorisation d&apos;authentification forte requise
            </Text>
          </View>

          <View style={styles.detailsBox}>
            <View style={styles.detailRow}>
              <Text variant="bodyMedium" style={styles.detailLabel}>
                Marchand :
              </Text>
              <Text variant="bodyLarge" style={styles.detailValue}>
                {challenge.merchant_name}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text variant="bodyMedium" style={styles.detailLabel}>
                Montant :
              </Text>
              <Text variant="headlineSmall" style={styles.amountValue}>
                ${Number(challenge.amount).toFixed(2)} USD
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text variant="bodyMedium" style={styles.detailLabel}>
                Carte N° :
              </Text>
              <Text variant="bodyMedium" style={styles.detailValue}>
                {challenge.card_id}
              </Text>
            </View>
          </View>

          <View style={styles.instructionBox}>
            <Text variant="bodySmall" style={styles.instructionText}>
              Un code de sécurité à 6 chiffres a été simulé par le réseau Visa. Entrez le code ou conservez le code déterministe pour valider.
            </Text>
          </View>

          <TextInput
            label="Code OTP 3DS (6 chiffres)"
            value={otpCode}
            onChangeText={(text) => {
              setOtpCode(text);
              setErrorText(null);
            }}
            keyboardType="number-pad"
            maxLength={6}
            mode="outlined"
            style={styles.otpInput}
          />

          {errorText && (
            <HelperText type="error" visible={!!errorText}>
              {errorText}
            </HelperText>
          )}

          <View style={styles.actionButtons}>
            <Button
              mode="contained"
              buttonColor="#2563EB"
              onPress={() => void handleConfirm()}
              loading={isVerifying}
              disabled={isVerifying || otpCode.length < 6}
              style={styles.confirmBtn}
            >
              Confirmer le paiement
            </Button>
            <Button
              mode="outlined"
              onPress={onDismiss}
              disabled={isVerifying}
              style={styles.cancelBtn}
            >
              Refuser / Annuler
            </Button>
          </View>
        </Surface>
      </Modal>
    </Portal>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    modalContainer: {
      padding: 20,
    },
    content: {
      borderRadius: 20,
      padding: 24,
      backgroundColor: theme.colors.surface,
    },
    header: {
      alignItems: 'center',
      marginBottom: 16,
    },
    shieldBadge: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: '#EFF6FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
      borderWidth: 1,
      borderColor: '#BFDBFE',
    },
    shieldIcon: {
      fontSize: 26,
    },
    title: {
      fontWeight: 'bold',
      color: theme.colors.onSurface,
      letterSpacing: 0.5,
    },
    subtitle: {
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginTop: 2,
    },
    detailsBox: {
      backgroundColor: theme.colors.surfaceVariant,
      padding: 16,
      borderRadius: 12,
      marginVertical: 12,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: 4,
    },
    detailLabel: {
      color: theme.colors.onSurfaceVariant,
    },
    detailValue: {
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    amountValue: {
      fontWeight: 'bold',
      color: '#2563EB',
    },
    instructionBox: {
      backgroundColor: '#F8FAFC',
      padding: 12,
      borderRadius: 8,
      marginBottom: 14,
      borderLeftWidth: 3,
      borderLeftColor: '#3B82F6',
    },
    instructionText: {
      color: '#475569',
      lineHeight: 18,
    },
    otpInput: {
      textAlign: 'center',
      fontSize: 20,
      letterSpacing: 6,
      marginBottom: 8,
    },
    actionButtons: {
      marginTop: 12,
      gap: 8,
    },
    confirmBtn: {
      borderRadius: 10,
    },
    cancelBtn: {
      borderRadius: 10,
    },
  });
