import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, IconButton, Surface, Text } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

import { LedgerEntry } from '../types';

interface TransactionHistoryProps {
  entries: LedgerEntry[];
  isLoading: boolean;
  onRefresh?: () => void;
  userId: string;
}

interface ParsedTransaction {
  id: string;
  type: 'DEPOSIT' | 'CONVERT' | 'CARD_ISSUE' | 'MERCHANT_DEBIT' | 'ROLLBACK' | 'OTHER';
  title: string;
  subtitle: string;
  date: string;
  amount: string;
  currency: string;
  isPositive: boolean;
  status: string;
  icon: string;
  color: string;
}

function parseLedgerEntry(entry: LedgerEntry, userId: string): ParsedTransaction {
  const narration = entry.narration;
  const dateObj = new Date(entry.created_at);
  const formattedDate = dateObj.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Postings affecting the user
  const userPostings = entry.postings.filter(
    (p) => p.user_id === userId || p.account_number.includes(userId)
  );

  // 1. Mobile Money Deposit
  if (narration.includes('Mobile Money deposit')) {
    const operator = narration.includes('WAVE') ? 'Wave' : 'Orange Money';
    const foundCredit = userPostings.find((p) => p.direction === 'CREDIT');
    const post = foundCredit || entry.postings[1] || entry.postings[0];
    const amountVal = Number(post.amount);
    const currencyVal = post.currency;
    return {
      id: entry.id,
      type: 'DEPOSIT',
      title: `Recharge ${operator}`,
      subtitle: `Dépôt Mobile Money • ${entry.reference}`,
      date: formattedDate,
      amount: `+${amountVal.toLocaleString()}`,
      currency: currencyVal,
      isPositive: true,
      status: entry.status,
      icon: 'arrow-down-bold-circle',
      color: '#10B981', // green
    };
  }

  // 2. Compensation Rollback (Chaos)
  if (narration.includes('COMPENSATION ROLLBACK')) {
    const foundCredit = userPostings.find((p) => p.direction === 'CREDIT');
    const post = foundCredit || entry.postings[1] || entry.postings[0];
    const amountVal = Number(post.amount);
    const currencyVal = post.currency;
    return {
      id: entry.id,
      type: 'ROLLBACK',
      title: 'Rollback de Compensation',
      subtitle: 'Restitution réseau • Débit annulé',
      date: formattedDate,
      amount: `+${amountVal.toFixed(2)}`,
      currency: currencyVal,
      isPositive: true,
      status: 'ROLLED_BACK',
      icon: 'shield-refresh',
      color: '#6366F1', // indigo
    };
  }

  // 3. Merchant Card Debit
  if (narration.includes('Card debit at')) {
    const merchantMatch = narration.match(/Card debit at (.+?) for/);
    const merchant = merchantMatch ? merchantMatch[1] : 'Marchand';
    const foundDebit = userPostings.find((p) => p.direction === 'DEBIT');
    const post = foundDebit || entry.postings[0];
    const amountVal = Number(post.amount);
    const currencyVal = post.currency;
    return {
      id: entry.id,
      type: 'MERCHANT_DEBIT',
      title: `Paiement ${merchant}`,
      subtitle: 'Débit carte virtuelle USD',
      date: formattedDate,
      amount: `-${amountVal.toFixed(2)}`,
      currency: currencyVal,
      isPositive: false,
      status: entry.status,
      icon: 'credit-card-outline',
      color: '#EF4444', // red
    };
  }

  // 4. FX Conversion
  if (narration.includes('FX Conversion')) {
    const usdPost = userPostings.find((p) => p.currency === 'USD' && p.direction === 'CREDIT');
    const xofPost = userPostings.find((p) => p.currency === 'XOF' && p.direction === 'DEBIT');
    const usdAmount = usdPost ? Number(usdPost.amount).toFixed(2) : '0.00';
    const xofAmount = xofPost ? Number(xofPost.amount).toLocaleString() : '0';
    return {
      id: entry.id,
      type: 'CONVERT',
      title: 'Conversion FX',
      subtitle: `-${xofAmount} XOF ➔ +$${usdAmount} USD`,
      date: formattedDate,
      amount: `+$${usdAmount}`,
      currency: 'USD',
      isPositive: true,
      status: entry.status,
      icon: 'swap-horizontal-bold',
      color: '#3B82F6', // blue
    };
  }

  // 5. Funding Virtual Card
  if (narration.includes('Funding virtual card')) {
    const cardPost = entry.postings.find((p) => p.direction === 'CREDIT');
    const cardAmount = cardPost ? Number(cardPost.amount).toFixed(2) : '0.00';
    return {
      id: entry.id,
      type: 'CARD_ISSUE',
      title: 'Provision de Carte',
      subtitle: 'Transfert Wallet USD ➔ Carte',
      date: formattedDate,
      amount: `$${cardAmount}`,
      currency: 'USD',
      isPositive: true,
      status: entry.status,
      icon: 'credit-card-plus',
      color: '#8B5CF6', // purple
    };
  }

  // Default fallback
  const firstPost = userPostings[0] || entry.postings[0];
  const isCredit = firstPost.direction === 'CREDIT';
  const fallbackAmount = Number(firstPost.amount).toLocaleString();
  const fallbackCurrency = firstPost.currency;
  return {
    id: entry.id,
    type: 'OTHER',
    title: narration.slice(0, 30) || 'Écriture Comptable',
    subtitle: entry.reference,
    date: formattedDate,
    amount: `${isCredit ? '+' : '-'}${fallbackAmount}`,
    currency: fallbackCurrency,
    isPositive: isCredit,
    status: entry.status,
    icon: 'book-outline',
    color: '#64748B',
  };
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  entries,
  isLoading,
  onRefresh,
  userId,
}) => {
  const styles = useThemedStyles(createStyles);

  if (isLoading && entries.length === 0) {
    return (
      <Surface style={styles.card} elevation={1}>
        <Text variant="bodyMedium" style={styles.emptyText}>
          Chargement de l&apos;activité comptable...
        </Text>
      </Surface>
    );
  }

  if (entries.length === 0) {
    return (
      <Surface style={styles.card} elevation={1}>
        <View style={styles.emptyContainer}>
          <IconButton icon="receipt" size={32} iconColor="#94A3B8" />
          <Text variant="titleMedium" style={styles.emptyTitle}>
            Aucune transaction
          </Text>
          <Text variant="bodySmall" style={styles.emptyText}>
            Vos recharges, conversions et débits apparaîtront ici en temps réel.
          </Text>
        </View>
      </Surface>
    );
  }

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.headerRow}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Activité Récente ({entries.length})
        </Text>
        {onRefresh && (
          <IconButton icon="refresh" size={20} onPress={onRefresh} style={styles.refreshBtn} />
        )}
      </View>

      <View style={styles.list}>
        {entries.map((entry, index) => {
          const item = parseLedgerEntry(entry, userId);
          const isLast = index === entries.length - 1;

          return (
            <View key={item.id} style={[styles.itemRow, !isLast && styles.itemBorder]}>
              <View style={[styles.iconContainer, { backgroundColor: `${item.color}15` }]}>
                <IconButton icon={item.icon} iconColor={item.color} size={22} style={styles.itemIcon} />
              </View>

              <View style={styles.itemInfo}>
                <Text variant="labelLarge" style={styles.itemTitle}>
                  {item.title}
                </Text>
                <Text variant="bodySmall" style={styles.itemSubtitle}>
                  {item.subtitle}
                </Text>
                <Text variant="labelSmall" style={styles.itemDate}>
                  {item.date}
                </Text>
              </View>

              <View style={styles.itemAmountContainer}>
                <Text
                  variant="labelLarge"
                  style={[styles.itemAmount, item.isPositive ? styles.positiveAmount : styles.negativeAmount]}
                >
                  {item.amount} {item.currency}
                </Text>
                <Chip compact style={styles.statusChip} textStyle={styles.statusChipText}>
                  {item.status}
                </Chip>
              </View>
            </View>
          );
        })}
      </View>
    </Surface>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      borderRadius: 16,
      padding: 16,
      backgroundColor: theme.colors.surface,
      marginVertical: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: {
      fontWeight: 'bold',
      color: theme.colors.onSurface,
    },
    refreshBtn: {
      margin: 0,
    },
    list: {
      marginTop: 4,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },
    itemBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#E2E8F0',
    },
    iconContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    itemIcon: {
      margin: 0,
    },
    itemInfo: {
      flex: 1,
    },
    itemTitle: {
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    itemSubtitle: {
      color: theme.colors.onSurfaceVariant,
      marginTop: 2,
    },
    itemDate: {
      color: '#94A3B8',
      marginTop: 2,
    },
    itemAmountContainer: {
      alignItems: 'flex-end',
      marginLeft: 8,
    },
    itemAmount: {
      fontWeight: 'bold',
      fontSize: 14,
    },
    positiveAmount: {
      color: '#059669',
    },
    negativeAmount: {
      color: '#DC2626',
    },
    statusChip: {
      marginTop: 4,
      height: 22,
      backgroundColor: '#F1F5F9',
    },
    statusChipText: {
      fontSize: 10,
      color: '#475569',
      marginVertical: 0,
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    emptyTitle: {
      fontWeight: '600',
      color: theme.colors.onSurface,
      marginTop: 4,
    },
    emptyText: {
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
      marginTop: 4,
    },
  });
