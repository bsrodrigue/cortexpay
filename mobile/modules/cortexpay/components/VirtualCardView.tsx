import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, IconButton, Surface, Text } from 'react-native-paper';

import { BiometricService } from '@/modules/auth/services/biometricService';
import { Theme, useThemedStyles } from '@/modules/shared/theme';

import { VirtualCard } from '../types';

interface VirtualCardViewProps {
  card: VirtualCard;
  onToggleFreeze: (cardId: string) => void;
  onManage?: (card: VirtualCard) => void;
  isFreezing?: boolean;
}

export const VirtualCardView: React.FC<VirtualCardViewProps> = ({
  card,
  onToggleFreeze,
  onManage,
  isFreezing = false,
}) => {
  const [revealed, setRevealed] = useState(false);
  const styles = useThemedStyles(createStyles);

  const isBusiness = card.card_type === 'BUSINESS';

  const formatCardNumber = (num: string) => {
    const cleaned = num.replace(/\s+/g, '');
    return cleaned.replace(/(\d{4})/g, '$1 ').trim();
  };

  const rawPan = revealed && card.pan ? card.pan : card.masked_pan;
  const displayPan = formatCardNumber(rawPan);
  const displayCvv = revealed && card.cvv ? card.cvv : '•••';

  const handleToggleReveal = async () => {
    if (!revealed) {
      // Prompt biometric authentication before revealing sensitive PAN & CVV
      const success = await BiometricService.authenticate(
        'Authentifiez-vous pour afficher le numéro complet et le CVV'
      );
      if (success) {
        setRevealed(true);
      }
    } else {
      setRevealed(false);
    }
  };

  return (
    <Surface
      style={[
        styles.cardContainer,
        isBusiness && styles.businessCard,
        card.status === 'FROZEN' && styles.frozenCard,
      ]}
      elevation={4}
    >
      <View style={styles.headerRow}>
        <View>
          <Text variant="titleMedium" style={styles.cardBrand}>
            CORTEX PAY
          </Text>
          <Text variant="labelSmall" style={styles.cardLabelText}>
            {card.label || 'Ma Carte Cortex'}
          </Text>
        </View>
        <View style={[styles.badgeContainer, isBusiness ? styles.businessBadge : styles.standardBadge]}>
          <Text variant="labelSmall" style={styles.badgeText}>
            {card.status === 'FROZEN' ? '❄️ GELÉE' : isBusiness ? '🏢 BUSINESS VISA' : '✨ STANDARD VISA'}
          </Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        <View style={styles.chip} />
        <IconButton
          icon={revealed ? 'eye-off' : 'eye'}
          iconColor="#FFFFFF"
          size={20}
          onPress={() => void handleToggleReveal()}
        />
      </View>

      <Text
        variant="headlineSmall"
        style={styles.panText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
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
        {onManage && (
          <Button
            mode="contained-tonal"
            icon="cog-outline"
            onPress={() => onManage(card)}
            style={styles.manageButton}
          >
            Gérer / Recharger
          </Button>
        )}
      </View>
    </Surface>
  );
};

const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    cardContainer: {
      borderRadius: 16,
      padding: 20,
      marginVertical: 12,
      backgroundColor: '#1E1B4B',
      minHeight: 210,
      justifyContent: 'space-between',
    },
    businessCard: {
      backgroundColor: '#0F172A',
      borderWidth: 1,
      borderColor: '#3B82F6',
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
    cardLabelText: {
      color: '#94A3B8',
      marginTop: 2,
    },
    badgeContainer: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    standardBadge: {
      backgroundColor: 'rgba(99, 102, 241, 0.2)',
    },
    businessBadge: {
      backgroundColor: 'rgba(59, 130, 246, 0.25)',
      borderWidth: 1,
      borderColor: '#60A5FA',
    },
    badgeText: {
      color: '#93C5FD',
      fontWeight: '700',
      fontSize: 10,
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
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    freezeButton: {
      borderColor: '#94A3B8',
      flex: 1,
    },
    manageButton: {
      flex: 1,
      backgroundColor: '#312E81',
    },
  });
