import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Chip, Divider, IconButton, Modal, Portal, Surface, Text } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

import { LedgerEntry } from '../types';

interface TransactionReceiptModalProps {
  visible: boolean;
  onDismiss: () => void;
  entry: LedgerEntry | null;
}

export const TransactionReceiptModal: React.FC<TransactionReceiptModalProps> = ({
  visible,
  onDismiss,
  entry,
}) => {
  const styles = useThemedStyles(createStyles);

  if (!entry) {
    return null;
  }

  const formattedDate = new Date(entry.created_at).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const handleExportShare = async () => {
    try {
      const csvContent = [
        '--- CORTEX PAY REÇU DE TRANSACTION ---',
        `Reference: ${entry.reference}`,
        `Idempotency Key: ${entry.idempotency_key}`,
        `Date: ${formattedDate}`,
        `Narration: ${entry.narration}`,
        `Status: ${entry.status}`,
        '',
        '--- ECRITURES DE COMPTABILITE EN PARTIE DOUBLE ---',
        'Compte,Direction,Montant,Devise,Type',
        ...entry.postings.map(
          (p) =>
            `${p.account_number},${p.direction},${p.amount},${p.currency},${p.account_type || 'ACCOUNT'}`
        ),
      ].join('\n');

      const fileName = `recu_cortex_${entry.reference}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: `Partager le reçu ${entry.reference}`,
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Reçu Généré', `Fichier enregistré localement : ${fileName}`);
      }
    } catch (e: unknown) {
      const err = e as Error;
      Alert.alert('Erreur Export', err.message || 'Impossible de générer le reçu.');
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modalContainer}
      >
        <Surface style={styles.receiptCard} elevation={4}>
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <Text variant="titleLarge" style={styles.brandTitle}>
                CORTEX PAY
              </Text>
              <IconButton icon="close" size={20} onPress={onDismiss} style={styles.closeBtn} />
            </View>
            <Text variant="labelSmall" style={styles.receiptSubtitle}>
              REÇU ÉLECTRONIQUE DE TRANSACTION
            </Text>
            <Chip compact style={styles.statusChip} textStyle={styles.statusChipText}>
              ✓ {entry.status}
            </Chip>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.body}>
            <View style={styles.row}>
              <Text variant="bodySmall" style={styles.label}>
                RÉFÉRENCE
              </Text>
              <Text variant="bodyMedium" style={styles.valueBold}>
                {entry.reference}
              </Text>
            </View>

            <View style={styles.row}>
              <Text variant="bodySmall" style={styles.label}>
                DATE &amp; HEURE
              </Text>
              <Text variant="bodySmall" style={styles.value}>
                {formattedDate}
              </Text>
            </View>

            <View style={styles.row}>
              <Text variant="bodySmall" style={styles.label}>
                DESCRIPTION
              </Text>
              <Text variant="bodyMedium" style={styles.value}>
                {entry.narration}
              </Text>
            </View>

            <View style={styles.row}>
              <Text variant="bodySmall" style={styles.label}>
                CLÉ D&apos;IDEMPOTENCE
              </Text>
              <Text variant="bodySmall" style={styles.monospaceValue}>
                {entry.idempotency_key}
              </Text>
            </View>

            <Divider style={styles.innerDivider} />

            <Text variant="labelSmall" style={styles.ledgerSectionTitle}>
              ÉCRITURES EN PARTIE DOUBLE (LEDGER POSTINGS)
            </Text>

            {entry.postings.map((p, idx) => (
              <View key={p.id || idx} style={styles.postingRow}>
                <View style={styles.postingLeft}>
                  <Text variant="bodySmall" style={styles.accountNumber}>
                    {p.account_number}
                  </Text>
                  <Text variant="labelSmall" style={styles.accountType}>
                    {p.account_type || 'ACCOUNT'}
                  </Text>
                </View>
                <View style={styles.postingRight}>
                  <Text
                    variant="labelMedium"
                    style={[
                      styles.postingAmount,
                      p.direction === 'CREDIT' ? styles.creditText : styles.debitText,
                    ]}
                  >
                    {p.direction === 'CREDIT' ? '+ ' : '- '}
                    {Number(p.amount).toLocaleString()} {p.currency}
                  </Text>
                  <Text variant="labelSmall" style={styles.directionBadge}>
                    {p.direction}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <Divider style={styles.divider} />

          <View style={styles.footer}>
            <Button
              mode="contained"
              icon="file-download-outline"
              buttonColor="#2563EB"
              onPress={() => {
                void handleExportShare();
              }}
              style={styles.actionBtn}
            >
              Exporter le Reçu (CSV / Partage)
            </Button>
            <Button mode="text" onPress={onDismiss} style={styles.closeActionBtn}>
              Fermer
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
      padding: 16,
    },
    receiptCard: {
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      padding: 20,
    },
    header: {
      alignItems: 'center',
    },
    logoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
    },
    brandTitle: {
      fontWeight: '900',
      letterSpacing: 2,
      color: '#1E3A8A',
    },
    closeBtn: {
      margin: 0,
    },
    receiptSubtitle: {
      letterSpacing: 1,
      color: '#64748B',
      marginTop: 2,
    },
    statusChip: {
      backgroundColor: '#DCFCE7',
      marginTop: 8,
      height: 24,
    },
    statusChipText: {
      color: '#15803D',
      fontWeight: 'bold',
      fontSize: 11,
    },
    divider: {
      marginVertical: 14,
    },
    innerDivider: {
      marginVertical: 10,
    },
    body: {
      gap: 10,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    label: {
      color: '#64748B',
      fontWeight: '600',
      letterSpacing: 0.5,
      fontSize: 10,
    },
    value: {
      color: theme.colors.onSurface,
      flexShrink: 1,
      textAlign: 'right',
      marginLeft: 8,
    },
    valueBold: {
      color: theme.colors.onSurface,
      fontWeight: 'bold',
    },
    monospaceValue: {
      fontFamily: 'monospace',
      fontSize: 10,
      color: '#475569',
    },
    ledgerSectionTitle: {
      color: '#94A3B8',
      letterSpacing: 1,
      fontWeight: 'bold',
      marginTop: 4,
    },
    postingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#F1F5F9',
    },
    postingLeft: {
      flex: 1,
    },
    accountNumber: {
      fontWeight: '600',
      fontSize: 11,
      color: '#1E293B',
    },
    accountType: {
      color: '#64748B',
      fontSize: 9,
    },
    postingRight: {
      alignItems: 'flex-end',
    },
    postingAmount: {
      fontWeight: 'bold',
      fontSize: 12,
    },
    creditText: {
      color: '#16A34A',
    },
    debitText: {
      color: '#DC2626',
    },
    directionBadge: {
      color: '#94A3B8',
      fontSize: 8,
    },
    footer: {
      marginTop: 8,
      gap: 6,
    },
    actionBtn: {
      borderRadius: 10,
    },
    closeActionBtn: {
      borderRadius: 10,
    },
  });
