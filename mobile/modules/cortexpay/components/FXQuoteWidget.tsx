import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, TextInput, Button, ProgressBar } from 'react-native-paper';
import { FXQuoteResponse } from '../types';
import { useThemedStyles, Theme } from '@/modules/shared/theme';

interface FXQuoteWidgetProps {
  xofBalance: string;
  onGetQuote: (amountXof: string) => Promise<FXQuoteResponse>;
  onExecuteConvert: (quoteId: string) => Promise<void>;
  isGettingQuote: boolean;
  isConverting: boolean;
}

export const FXQuoteWidget: React.FC<FXQuoteWidgetProps> = ({
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

  const handleFetchQuote = async () => {
    try {
      const quote = await onGetQuote(amountXof);
      setActiveQuote(quote);
    } catch (e) {
      console.error(e);
    }
  };

  const handleConvert = async () => {
    if (!activeQuote) return;
    try {
      await onExecuteConvert(activeQuote.quote_id);
      setActiveQuote(null);
    } catch (e) {
      console.error(e);
    }
  };

  const progress = secondsRemaining / 90;

  return (
    <Surface style={styles.container} elevation={2}>
      <Text variant="titleMedium" style={styles.title}>
        💱 Moteur FX & Quote Locking (TTL 90s)
      </Text>
      <Text variant="bodySmall" style={styles.balanceHint}>
        Solde disponible: {Number(xofBalance).toLocaleString()} XOF
      </Text>

      <View style={styles.inputContainer}>
        <TextInput
          label="Montant à convertir (XOF)"
          value={amountXof}
          onChangeText={setAmountXof}
          keyboardType="numeric"
          mode="outlined"
          style={styles.input}
        />
        <Button
          mode="contained"
          onPress={handleFetchQuote}
          loading={isGettingQuote}
          disabled={isGettingQuote || !amountXof || Number(amountXof) <= 0}
          style={styles.quoteButton}
        >
          Bloquer Devis
        </Button>
      </View>

      {activeQuote && (
        <Surface style={styles.quoteCard} elevation={1}>
          <View style={styles.quoteHeader}>
            <Text variant="labelLarge" style={styles.lockedText}>
              🔒 Devis Verrouillé
            </Text>
            <Text variant="bodyMedium" style={styles.timerText}>
              Expire dans: {secondsRemaining}s
            </Text>
          </View>

          <ProgressBar progress={progress} color="#2563EB" style={styles.progressBar} />

          <View style={styles.rateDetails}>
            <Text variant="bodyMedium">
              Vous donnez: <Text style={styles.bold}>{Number(activeQuote.from_amount).toLocaleString()} XOF</Text>
            </Text>
            <Text variant="headlineSmall" style={styles.receivedAmount}>
              ≈ {Number(activeQuote.to_amount).toFixed(2)} USD
            </Text>
            <Text variant="bodySmall" style={styles.rateSub}>
              Taux: 1 USD = {Number(activeQuote.effective_rate).toFixed(2)} XOF (Spread inclus)
            </Text>
          </View>

          <Button
            mode="contained"
            buttonColor="#16A34A"
            onPress={handleConvert}
            loading={isConverting}
            disabled={isConverting || secondsRemaining <= 0}
            style={styles.convertButton}
          >
            Confirmer la conversion instantanée
          </Button>
        </Surface>
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
      marginBottom: 4,
    },
    balanceHint: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 12,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    input: {
      flex: 1,
    },
    quoteButton: {
      marginTop: 6,
    },
    quoteCard: {
      marginTop: 16,
      padding: 14,
      borderRadius: 12,
      backgroundColor: theme.colors.surfaceVariant,
    },
    quoteHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    lockedText: {
      fontWeight: 'bold',
      color: '#2563EB',
    },
    timerText: {
      fontWeight: 'bold',
      color: '#DC2626',
    },
    progressBar: {
      height: 6,
      borderRadius: 3,
      marginBottom: 12,
    },
    rateDetails: {
      alignItems: 'center',
      marginVertical: 8,
    },
    bold: {
      fontWeight: 'bold',
    },
    receivedAmount: {
      fontWeight: 'bold',
      color: '#16A34A',
      marginVertical: 4,
    },
    rateSub: {
      color: theme.colors.onSurfaceVariant,
    },
    convertButton: {
      marginTop: 10,
    },
  });
