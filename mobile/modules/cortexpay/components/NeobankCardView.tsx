import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';

import { BiometricService } from '@/modules/auth/services/biometricService';
import { Theme, useThemedStyles } from '@/modules/shared/theme';

import { VirtualCard } from '../types';

interface NeobankCardViewProps {
  card: VirtualCard;
  onToggleFreeze: (cardId: string) => void;
  onManage?: (card: VirtualCard) => void;
  isFreezing?: boolean;
}

export const NeobankCardView: React.FC<NeobankCardViewProps> = ({
  card,
  onToggleFreeze,
  onManage,
  isFreezing = false,
}) => {
  const [revealed, setRevealed] = useState(false);
  const styles = useThemedStyles(createStyles);

  const isBusiness = card.card_type === 'BUSINESS';
  const isFrozen = card.status === 'FROZEN';

  const displayPan = revealed && card.pan ? card.pan : card.masked_pan;
  const displayCvv = revealed && card.cvv ? card.cvv : '•••';

  const handleToggleReveal = async () => {
    if (!revealed) {
      const success = await BiometricService.authenticate(
        'Authentifiez-vous pour révéler le numéro complet et le CVV'
      );
      if (success) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setRevealed(true);
      }
    } else {
      void Haptics.selectionAsync();
      setRevealed(false);
    }
  };

  const handleCopyPan = async () => {
    if (revealed && card.pan) {
      await Clipboard.setStringAsync(card.pan.replace(/\s+/g, ''));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Copié', 'Numéro de carte copié dans le presse-papier.');
    }
  };

  // Modern subtle gradients for cards
  const gradientColors: [string, string, ...string[]] = isFrozen
    ? ['#334155', '#1E293B'] // Slate Frost
    : isBusiness
    ? ['#0F172A', '#1E293B', '#0F172A'] // Obsidian Deep
    : ['#1E3A8A', '#2563EB', '#1D4ED8']; // Cobalt Trust

  return (
    <View style={styles.outerContainer}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.cardSurface, isFrozen && styles.frozenSurface]}
      >
        {/* Top bar: Brand, Label & Status Badge */}
        <View style={styles.topRow}>
          <View>
            <Text style={styles.brandTitle}>CORTEX</Text>
            <Text style={styles.cardCustomLabel}>
              {card.label || (isBusiness ? 'Carte Entreprise' : 'Dépenses Quotidiennes')}
            </Text>
          </View>

          <View
            style={[
              styles.pillBadge,
              isFrozen
                ? styles.frozenPill
                : isBusiness
                ? styles.businessPill
                : styles.standardPill,
            ]}
          >
            <Text
              style={[
                styles.pillBadgeText,
                isFrozen
                  ? styles.frozenPillText
                  : isBusiness
                  ? styles.businessPillText
                  : styles.standardPillText,
              ]}
            >
              {isFrozen ? '❄️ GELÉE' : isBusiness ? 'BUSINESS' : 'PLATINUM'}
            </Text>
          </View>
        </View>

        {/* EMV Chip & Privacy Reveal Toggle */}
        <View style={styles.chipRow}>
          <View style={styles.emvChip}>
            <View style={styles.chipInnerLine} />
            <View style={styles.chipCrossLine} />
          </View>

          <TouchableOpacity
            style={styles.revealBtn}
            onPress={() => void handleToggleReveal()}
            activeOpacity={0.7}
          >
            <IconButton
              icon={revealed ? 'eye-off' : 'eye'}
              iconColor="#FFFFFF"
              size={18}
              style={styles.noMarginIcon}
            />
            <Text style={styles.revealText}>
              {revealed ? 'Masquer' : 'Afficher'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Card PAN with Tap to Copy */}
        <TouchableOpacity
          activeOpacity={revealed ? 0.7 : 1}
          onPress={() => void handleCopyPan()}
          style={styles.panRow}
        >
          <Text style={styles.panNumber}>{displayPan}</Text>
          {revealed && (
            <IconButton icon="content-copy" iconColor="#93C5FD" size={16} style={styles.noMarginIcon} />
          )}
        </TouchableOpacity>

        {/* Bottom Details & Visa Logo */}
        <View style={styles.bottomRow}>
          <View style={styles.holderColumn}>
            <Text style={styles.metaLabel}>TITULAIRE</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {card.cardholder_name.toUpperCase()}
            </Text>
          </View>

          <View style={styles.expiryColumn}>
            <Text style={styles.metaLabel}>EXPIRE</Text>
            <Text style={styles.metaValue}>
              {String(card.expiry_month).padStart(2, '0')}/{card.expiry_year}
            </Text>
          </View>

          <View style={styles.cvvColumn}>
            <Text style={styles.metaLabel}>CVV</Text>
            <Text style={styles.metaValue}>{displayCvv}</Text>
          </View>

          <View style={styles.networkLogoWrap}>
            <Text style={styles.visaText}>VISA</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Card Quick Action Bar (Freeze & Manage) */}
      <View style={styles.actionsBar}>
        <TouchableOpacity
          style={[styles.actionPill, isFrozen && styles.actionPillUnfreeze]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onToggleFreeze(card.card_id);
          }}
          disabled={isFreezing}
          activeOpacity={0.7}
        >
          <IconButton
            icon={isFrozen ? 'lock-open-variant-outline' : 'snowflake'}
            size={16}
            iconColor={isFrozen ? '#2563EB' : '#475569'}
            style={styles.noMarginIcon}
          />
          <Text style={[styles.actionPillLabel, isFrozen && styles.actionPillLabelActive]}>
            {isFrozen ? 'Dégeler la carte' : 'Geler 1-Clic'}
          </Text>
        </TouchableOpacity>

        {onManage && (
          <TouchableOpacity
            style={styles.actionPill}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onManage(card);
            }}
            activeOpacity={0.7}
          >
            <IconButton icon="tune-variant" size={16} iconColor="#475569" style={styles.noMarginIcon} />
            <Text style={styles.actionPillLabel}>Gérer & Plafonds</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    outerContainer: {
      marginBottom: 20,
    },
    cardSurface: {
      borderRadius: 18,
      padding: 20,
      minHeight: 205,
      justifyContent: 'space-between',
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 18,
      elevation: 6,
    },
    frozenSurface: {
      opacity: 0.88,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    brandTitle: {
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 2,
      color: '#FFFFFF',
    },
    cardCustomLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: 'rgba(255, 255, 255, 0.7)',
      marginTop: 2,
    },
    pillBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    standardPill: {
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
    },
    standardPillText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    businessPill: {
      backgroundColor: '#FEF3C7',
    },
    businessPillText: {
      color: '#B45309',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    frozenPill: {
      backgroundColor: '#EFF6FF',
    },
    frozenPillText: {
      color: '#1D4ED8',
      fontSize: 10,
      fontWeight: '700',
    },
    pillBadgeText: {
      fontSize: 10,
    },
    chipRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginVertical: 10,
    },
    emvChip: {
      width: 38,
      height: 28,
      borderRadius: 6,
      backgroundColor: '#E2E8F0',
      borderWidth: 1,
      borderColor: '#CBD5E1',
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
    },
    chipInnerLine: {
      position: 'absolute',
      width: '100%',
      height: 1,
      backgroundColor: '#94A3B8',
    },
    chipCrossLine: {
      position: 'absolute',
      height: '100%',
      width: 1,
      backgroundColor: '#94A3B8',
    },
    revealBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.14)',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 14,
      gap: 2,
    },
    revealText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '600',
    },
    panRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginVertical: 4,
    },
    panNumber: {
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: 2,
      color: '#FFFFFF',
      fontVariant: ['tabular-nums'],
    },
    bottomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingTop: 8,
    },
    holderColumn: {
      flex: 2,
    },
    expiryColumn: {
      flex: 1,
    },
    cvvColumn: {
      flex: 1,
    },
    metaLabel: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: 'rgba(255, 255, 255, 0.6)',
      marginBottom: 2,
    },
    metaValue: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    networkLogoWrap: {
      alignItems: 'flex-end',
    },
    visaText: {
      fontSize: 20,
      fontWeight: '900',
      fontStyle: 'italic',
      color: '#FFFFFF',
      letterSpacing: 1,
    },
    actionsBar: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 10,
    },
    actionPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      gap: 4,
    },
    actionPillUnfreeze: {
      borderColor: '#BFDBFE',
      backgroundColor: '#EFF6FF',
    },
    actionPillLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: '#334155',
    },
    actionPillLabelActive: {
      color: '#2563EB',
    },
    noMarginIcon: {
      margin: 0,
      padding: 0,
    },
  });
