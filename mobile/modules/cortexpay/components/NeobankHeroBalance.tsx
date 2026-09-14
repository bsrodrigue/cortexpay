import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

interface NeobankHeroBalanceProps {
  xofBalance: string | number;
  usdBalance: string | number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const NeobankHeroBalance: React.FC<NeobankHeroBalanceProps> = ({
  xofBalance,
  usdBalance,
  onRefresh,
  isRefreshing = false,
}) => {
  const styles = useThemedStyles(createStyles);
  const [selectedCurrency, setSelectedCurrency] = useState<'XOF' | 'USD'>('XOF');
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);

  const numXof = Number(xofBalance || 0);
  const numUsd = Number(usdBalance || 0);

  const toggleCurrency = (currency: 'XOF' | 'USD') => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCurrency(currency);
  };

  const togglePrivacy = () => {
    void Haptics.selectionAsync();
    setIsPrivacyMode((prev) => !prev);
  };

  return (
    <View style={styles.container}>
      {/* Top row: Label & Controls */}
      <View style={styles.headerRow}>
        <View style={styles.labelGroup}>
          <Text style={styles.balanceLabel}>SOLDE DISPONIBLE</Text>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>En direct</Text>
          </View>
        </View>

        <View style={styles.controlsGroup}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={togglePrivacy}
            activeOpacity={0.7}
            accessibilityLabel="Mode confidentialité"
          >
            <IconButton
              icon={isPrivacyMode ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              iconColor={styles.controlIconColor.color}
              style={styles.miniIcon}
            />
          </TouchableOpacity>

          {onRefresh && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onRefresh();
              }}
              activeOpacity={0.7}
              disabled={isRefreshing}
            >
              <IconButton
                icon="refresh"
                size={18}
                iconColor={styles.controlIconColor.color}
                style={styles.miniIcon}
                loading={isRefreshing}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Hero Big Amount Display */}
      <View style={styles.amountDisplayRow}>
        {isPrivacyMode ? (
          <Text style={styles.privacyMask}>••••••••</Text>
        ) : selectedCurrency === 'XOF' ? (
          <View style={styles.amountWrap}>
            <Text style={styles.amountInteger}>
              {numXof.toLocaleString('fr-FR')}
            </Text>
            <Text style={styles.currencyCode}>XOF</Text>
          </View>
        ) : (
          <View style={styles.amountWrap}>
            <Text style={styles.currencySymbol}>$</Text>
            <Text style={styles.amountInteger}>
              {numUsd.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <Text style={styles.currencyCode}>USD</Text>
          </View>
        )}
      </View>

      {/* Currency Switcher Tabs (Wise/Mercury Style Pills) */}
      <View style={styles.pillSelectorRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => toggleCurrency('XOF')}
          style={[
            styles.currencyPill,
            selectedCurrency === 'XOF' && styles.currencyPillActive,
          ]}
        >
          <Text
            style={[
              styles.currencyPillFlag,
              selectedCurrency === 'XOF' && styles.currencyPillTextActive,
            ]}
          >
            🇸🇳
          </Text>
          <Text
            style={[
              styles.currencyPillText,
              selectedCurrency === 'XOF' && styles.currencyPillTextActive,
            ]}
          >
            XOF {isPrivacyMode ? '•••' : `${(numXof / 1000).toFixed(0)}k`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => toggleCurrency('USD')}
          style={[
            styles.currencyPill,
            selectedCurrency === 'USD' && styles.currencyPillActive,
          ]}
        >
          <Text
            style={[
              styles.currencyPillFlag,
              selectedCurrency === 'USD' && styles.currencyPillTextActive,
            ]}
          >
            🇺🇸
          </Text>
          <Text
            style={[
              styles.currencyPillText,
              selectedCurrency === 'USD' && styles.currencyPillTextActive,
            ]}
          >
            USD {isPrivacyMode ? '•••' : `$${numUsd.toFixed(2)}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      marginBottom: 16,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 12,
      elevation: 2,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    labelGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    balanceLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: theme.colors.onSurfaceVariant,
    },
    liveIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#DCFCE7',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 12,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#16A34A',
    },
    liveText: {
      fontSize: 10,
      fontWeight: '600',
      color: '#15803D',
    },
    controlsGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    iconBtn: {
      padding: 2,
    },
    miniIcon: {
      margin: 0,
    },
    controlIconColor: {
      color: theme.colors.onSurfaceVariant,
    },
    amountDisplayRow: {
      marginVertical: 6,
    },
    amountWrap: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    currencySymbol: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.colors.onSurface,
      marginRight: 4,
    },
    amountInteger: {
      fontSize: 38,
      fontWeight: '800',
      letterSpacing: -0.5,
      color: theme.colors.onSurface,
      fontVariant: ['tabular-nums'],
    },
    currencyCode: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.onSurfaceVariant,
      marginLeft: 8,
    },
    privacyMask: {
      fontSize: 36,
      fontWeight: '700',
      letterSpacing: 4,
      color: theme.colors.onSurfaceVariant,
    },
    pillSelectorRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: '#F1F5F9',
    },
    currencyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: '#F8FAFC',
      borderWidth: 1,
      borderColor: '#E2E8F0',
      gap: 6,
    },
    currencyPillActive: {
      backgroundColor: '#0F172A',
      borderColor: '#0F172A',
    },
    currencyPillFlag: {
      fontSize: 13,
    },
    currencyPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#475569',
    },
    currencyPillTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
  });
