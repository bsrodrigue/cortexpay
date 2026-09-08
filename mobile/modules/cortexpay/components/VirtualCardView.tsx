import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, Button, IconButton } from 'react-native-paper';
import { VirtualCard } from '../types';
import { useThemedStyles, Theme } from '@/modules/shared/theme';

interface VirtualCardViewProps {
  card: VirtualCard;
  onToggleFreeze: (cardId: string) => void;
  isFreezing?: boolean;
}

export const VirtualCardView: React.FC<VirtualCardViewProps> = ({
  card,
  onToggleFreeze,
  isFreezing = false,
}) => {
  const [revealed, setRevealed] = useState(false);
  const styles = useThemedStyles(createStyles);

  const displayPan = revealed && card.pan ? card.pan : card.masked_pan;
  const displayCvv = revealed && card.cvv ? card.cvv : '•••';

  return (
    <Surface style={[styles.cardContainer, card.status === 'FROZEN' && styles.frozenCard]} elevation={4}>
      <View style={styles.headerRow}>
        <Text variant="titleMedium" style={styles.cardBrand}>
          CORTEX PAY
        </Text>
        <Text variant="labelLarge" style={styles.cardType}>
          {card.status === 'FROZEN' ? '❄️ GELÉE' : 'VISA PLATINUM'}
        </Text>
      </View>

      <View style={styles.chipRow}>
        <View style={styles.chip} />
        <IconButton
          icon={revealed ? 'eye-off' : 'eye'}
          iconColor="#FFFFFF"
          size={20}
          onPress={() => setRevealed(!revealed)}
        />
      </View>

      <Text variant="headlineSmall" style={styles.panText}>
        {displayPan}
      </Text>

      <View style={styles.footerRow}>
        <View>
          <Text variant="labelSmall" style={styles.subLabel}>
            TITULAIRE
          </Text>
          <Text variant="bodyMedium" style={styles.cardHolder}>
            {card.cardholder_name.toUpperCase()}
          </Text>
        </View>

        <View>
          <Text variant="labelSmall" style={styles.subLabel}>
            EXPIRE
          </Text>
          <Text variant="bodyMedium" style={styles.footerValue}>
            {String(card.expiry_month).padStart(2, '0')}/{card.expiry_year}
          </Text>
        </View>

        <View>
          <Text variant="labelSmall" style={styles.subLabel}>
            CVV
          </Text>
          <Text variant="bodyMedium" style={styles.footerValue}>
            {displayCvv}
          </Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Button
          mode={card.status === 'FROZEN' ? 'contained' : 'outlined'}
          onPress={() => onToggleFreeze(card.card_id)}
          loading={isFreezing}
          style={styles.freezeButton}
          textColor="#FFFFFF"
        >
          {card.status === 'FROZEN' ? 'Dégeler la carte' : 'Geler 1-Clic'}
        </Button>
      </View>
    </Surface>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    cardContainer: {
      borderRadius: 16,
      padding: 20,
      marginVertical: 12,
      backgroundColor: '#1E1B4B',
      minHeight: 210,
      justifyContent: 'space-between',
    },
    frozenCard: {
      backgroundColor: '#334155',
      opacity: 0.85,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardBrand: {
      color: '#FFFFFF',
      fontWeight: 'bold',
      letterSpacing: 1.5,
    },
    cardType: {
      color: '#93C5FD',
      fontWeight: '600',
    },
    chipRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
    },
    chip: {
      width: 42,
      height: 30,
      borderRadius: 6,
      backgroundColor: '#F59E0B',
    },
    panText: {
      color: '#FFFFFF',
      letterSpacing: 2,
      fontFamily: 'monospace',
      marginVertical: 8,
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    subLabel: {
      color: '#94A3B8',
      fontSize: 10,
    },
    cardHolder: {
      color: '#FFFFFF',
      fontWeight: '600',
    },
    footerValue: {
      color: '#FFFFFF',
      fontFamily: 'monospace',
    },
    actionRow: {
      marginTop: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: '#475569',
      paddingTop: 10,
    },
    freezeButton: {
      borderColor: '#94A3B8',
    },
  });
