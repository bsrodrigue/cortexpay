import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Modal, Portal, ProgressBar, Surface, Text, TextInput } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

import { VirtualCard } from '../types';

interface CardDetailsModalProps {
  visible: boolean;
  onDismiss: () => void;
  card: VirtualCard | null;
  walletUsdBalance: string;
  onTopup: (cardId: string, amountUsd: string) => Promise<void>;
  onUpdateLimit: (cardId: string, newLimitUsd: string) => Promise<void>;
  isToppingUp: boolean;
  isUpdatingLimit: boolean;
}

export const CardDetailsModal: React.FC<CardDetailsModalProps> = ({
  visible,
  onDismiss,
  card,
  walletUsdBalance,
  onTopup,
  onUpdateLimit,
  isToppingUp,
  isUpdatingLimit,
}) => {
  const styles = useThemedStyles(createStyles);

  const [topupAmount, setTopupAmount] = useState('20.00');
  const [newLimit, setNewLimit] = useState(card ? card.spending_limit_monthly : '5000');
  const [topupError, setTopupError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<string | null>(null);

  if (!card) return null;

  const currentBalance = Number(card.balance);
  const monthlySpent = Number(card.current_month_spent);
  const monthlyLimit = Number(card.spending_limit_monthly) || 1;
  const usageRatio = Math.min(Math.max(monthlySpent / monthlyLimit, 0), 1);

  const handleTopupSubmit = () => {
    const amt = Number(topupAmount);
    if (isNaN(amt) || amt <= 0) {
      setTopupError('Montant invalide');
      return;
    }
    if (amt > Number(walletUsdBalance)) {
      setTopupError(`Solde USD insuffisant ($${Number(walletUsdBalance).toFixed(2)})`);
      return;
    }
    setTopupError(null);
    void onTopup(card.card_id, topupAmount).then(() => {
      setTopupAmount('20.00');
    });
  };

  const handleLimitSubmit = () => {
    const lim = Number(newLimit);
    if (isNaN(lim) || lim <= 0) {
      setLimitError('Plafond mensuel invalide');
      return;
    }
    setLimitError(null);
    void onUpdateLimit(card.card_id, newLimit);
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modalContent}>
        <Text variant="titleLarge" style={styles.modalTitle}>
          Gestion de la Carte
        </Text>
        <Text variant="bodySmall" style={styles.cardSubtitle}>
          {card.masked_pan} • {card.cardholder_name}
        </Text>

        {/* Balance & Monthly Progress */}
        <Surface style={styles.metricsCard} elevation={1}>
          <View style={styles.metricRow}>
            <View>
              <Text variant="labelSmall" style={styles.metricLabel}>
                SOLDE CARTE
              </Text>
              <Text variant="headlineSmall" style={styles.metricBalance}>
                ${currentBalance.toFixed(2)} USD
              </Text>
            </View>
            <View style={styles.spentRight}>
              <Text variant="labelSmall" style={styles.metricLabel}>
                DÉPENSES DU MOIS
              </Text>
              <Text variant="titleMedium" style={styles.spentValue}>
                ${monthlySpent.toFixed(2)} / ${monthlyLimit.toFixed(0)}
              </Text>
            </View>
          </View>

          <ProgressBar
            progress={usageRatio}
            color={usageRatio > 0.85 ? '#EF4444' : '#3B82F6'}
            style={styles.progressBar}
          />
          <Text variant="labelSmall" style={styles.usageText}>
            {(usageRatio * 100).toFixed(0)}% du plafond mensuel consommé
          </Text>
        </Surface>

        {/* Top Up Section */}
        <Surface style={styles.actionCard} elevation={1}>
          <Text variant="titleMedium" style={styles.actionTitle}>
            Recharger la Carte
          </Text>
          <Text variant="bodySmall" style={styles.actionSubtitle}>
            Transférer depuis votre Portefeuille USD (Dispo : ${Number(walletUsdBalance).toFixed(2)})
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              mode="outlined"
              label="Montant (USD)"
              value={topupAmount}
              onChangeText={setTopupAmount}
              keyboardType="numeric"
              style={styles.amountInput}
              dense
            />
            <Button
              mode="contained"
              onPress={handleTopupSubmit}
              loading={isToppingUp}
              disabled={isToppingUp}
              style={styles.submitBtn}
            >
              Recharger
            </Button>
          </View>
          {topupError && <HelperText type="error">{topupError}</HelperText>}
        </Surface>

        {/* Adjust Monthly Limit Section */}
        <Surface style={styles.actionCard} elevation={1}>
          <Text variant="titleMedium" style={styles.actionTitle}>
            Plafond Mensuel
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              mode="outlined"
              label="Nouveau plafond (USD)"
              value={newLimit}
              onChangeText={setNewLimit}
              keyboardType="numeric"
              style={styles.amountInput}
              dense
            />
            <Button
              mode="contained-tonal"
              onPress={handleLimitSubmit}
              loading={isUpdatingLimit}
              disabled={isUpdatingLimit}
              style={styles.submitBtn}
            >
              Modifier
            </Button>
          </View>
          {limitError && <HelperText type="error">{limitError}</HelperText>}
        </Surface>

        <Button mode="text" onPress={onDismiss} style={styles.closeBtn}>
          Fermer
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
      flexWrap: 'wrap',
    },
    cardSubtitle: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 16,
      flexWrap: 'wrap',
    },
    metricsCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    metricRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    metricLabel: {
      color: '#64748B',
      fontWeight: '600',
    },
    metricBalance: {
      fontWeight: 'bold',
      color: '#059669',
      marginTop: 2,
    },
    spentRight: {
      alignItems: 'flex-end',
      flexShrink: 1,
      marginLeft: 8,
    },
    spentValue: {
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginTop: 2,
      textAlign: 'right',
    },
    progressBar: {
      height: 8,
      borderRadius: 4,
      backgroundColor: '#E2E8F0',
    },
    usageText: {
      color: '#64748B',
      marginTop: 6,
      textAlign: 'right',
    },
    actionCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
    },
    actionTitle: {
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    actionSubtitle: {
      color: theme.colors.onSurfaceVariant,
      marginBottom: 8,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    amountInput: {
      flex: 1,
      backgroundColor: theme.colors.surface,
    },
    submitBtn: {
      borderRadius: 8,
    },
    closeBtn: {
      marginTop: 8,
    },
  });
