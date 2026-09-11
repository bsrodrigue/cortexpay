import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Modal, Portal, ProgressBar, Surface, Text, TextInput } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

import { FXQuoteResponse } from '../types';

interface ConvertModalProps {
  visible: boolean;
  onDismiss: () => void;
  xofBalance: string;
  onGetQuote: (amountXof: string) => Promise<FXQuoteResponse>;
  onExecuteConvert: (quoteId: string) => Promise<void>;
  isGettingQuote: boolean;
  isConverting: boolean;
}

export const ConvertModal: React.FC<ConvertModalProps> = ({
  visible,
  onDismiss,
  xofBalance,
  onGetQuote,
  onExecuteConvert,
  isGettingQuote,
  isConverting,
}) => {
  const styles = useThemedStyles(createStyles);
  const [amountXof, setAmountXof] = useState('25000');
  const [activeQuote, setActiveQuote] = useState<FXQuoteResponse | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-fetch quote when modal opens or amount changes
  useEffect(() => {
    if (!visible) {
      setActiveQuote(null);
      setSecondsRemaining(0);
      setQuoteError(null);
      return;
    }

    const num = Number(amountXof);
    if (!amountXof || isNaN(num) || num <= 0) {
      setActiveQuote(null);
      return;
    }

    if (num > Number(xofBalance)) {
      setQuoteError('Solde XOF insuffisant');
      setActiveQuote(null);
      return;
    }
    setQuoteError(null);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const quote = await onGetQuote(amountXof);
          setActiveQuote(quote);
        } catch (err: unknown) {
          const apiError = err as { response?: { data?: { detail?: string } } };
          setQuoteError(apiError.response?.data?.detail || 'Impossible de calculer le taux');
        }
      })();
    }, 400);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [visible, amountXof, xofBalance, onGetQuote]);

  // Countdown for quote validity
  useEffect(() => {
    if (!activeQuote) return;

    setSecondsRemaining(activeQuote.ttl_remaining_seconds || 90);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setActiveQuote(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeQuote]);

  const handleConfirm = () => {
    if (!activeQuote) return;
    void onExecuteConvert(activeQuote.quote_id)
      .then(() => {
        onDismiss();
      })
      .catch((e) => {
        console.error(e);
      });
  };

  const progress = secondsRemaining / 90;
  const numAmount = Number(amountXof);
  const isInvalid = !amountXof || isNaN(numAmount) || numAmount <= 0 || numAmount > Number(xofBalance);

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <Text variant="headlineSmall" style={styles.modalTitle}>
          Convertir XOF ➔ USD
        </Text>
        <Text variant="bodySmall" style={styles.subtitle}>
          Solde XOF disponible : {Number(xofBalance).toLocaleString()} XOF
        </Text>

        <TextInput
          label="Montant à débiter (XOF)"
          value={amountXof}
          onChangeText={setAmountXof}
          keyboardType="numeric"
          mode="outlined"
          style={styles.input}
        />

        {quoteError && <HelperText type="error" visible>{quoteError}</HelperText>}

        {isGettingQuote && !activeQuote && (
          <Text variant="bodySmall" style={styles.loadingText}>
            Calcul du taux garanti...
          </Text>
        )}

        {activeQuote && (
          <Surface style={styles.quoteSummary} elevation={1}>
            <View style={styles.summaryRow}>
              <Text variant="bodyMedium" style={styles.label}>Vous recevez :</Text>
              <Text variant="headlineSmall" style={styles.usdAmount}>
                ${Number(activeQuote.to_amount).toFixed(2)} USD
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.rateRow}>
              <Text variant="bodySmall" style={styles.rateText}>
                Taux garanti (1 USD = {Number(activeQuote.effective_rate).toFixed(2)} XOF)
              </Text>
              <Text variant="labelSmall" style={styles.timerText}>
                {secondsRemaining}s
              </Text>
            </View>

            <ProgressBar progress={progress} color="#16A34A" style={styles.progressBar} />
          </Surface>
        )}

        <View style={styles.actionButtons}>
          <Button mode="text" onPress={onDismiss} style={styles.cancelBtn}>
            Annuler
          </Button>
          <Button
            mode="contained"
            onPress={handleConfirm}
            loading={isConverting}
            disabled={isConverting || isInvalid || !activeQuote || secondsRemaining <= 0}
            buttonColor="#16A34A"
            style={styles.confirmBtn}
          >
            Confirmer l&apos;échange
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
    input: {
      marginBottom: 12,
    },
    loadingText: {
      color: theme.colors.primary,
      fontStyle: 'italic',
      marginVertical: 8,
    },
    quoteSummary: {
      backgroundColor: theme.colors.surfaceVariant,
      padding: 16,
      borderRadius: 14,
      marginTop: 8,
      marginBottom: 16,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    label: {
      color: theme.colors.onSurfaceVariant,
      fontWeight: '600',
    },
    usdAmount: {
      fontWeight: 'bold',
      color: '#16A34A',
    },
    divider: {
      height: 1,
      backgroundColor: 'rgba(0,0,0,0.06)',
      marginVertical: 10,
    },
    rateRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    rateText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
    },
    timerText: {
      fontWeight: 'bold',
      color: '#2563EB',
    },
    progressBar: {
      height: 4,
      borderRadius: 2,
    },
    actionButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
    },
    cancelBtn: {},
    confirmBtn: {
      minWidth: 160,
    },
  });
