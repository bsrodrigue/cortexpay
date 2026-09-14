import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

interface NeobankActionRowProps {
  onDeposit: () => void;
  onConvert: () => void;
  onWithdraw: () => void;
  onIssueCard: () => void;
}

export const NeobankActionRow: React.FC<NeobankActionRowProps> = ({
  onDeposit,
  onConvert,
  onWithdraw,
  onIssueCard,
}) => {
  const styles = useThemedStyles(createStyles);

  const handleAction = (cb: () => void) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    cb();
  };

  return (
    <View style={styles.container}>
      {/* 1. Deposit / Recharger */}
      <TouchableOpacity
        style={styles.actionItem}
        onPress={() => handleAction(onDeposit)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconCircle, styles.primaryCircle]}>
          <IconButton icon="plus" size={24} iconColor="#FFFFFF" style={styles.icon} />
        </View>
        <Text style={styles.actionLabel}>Recharger</Text>
      </TouchableOpacity>

      {/* 2. Convert / Changer */}
      <TouchableOpacity
        style={styles.actionItem}
        onPress={() => handleAction(onConvert)}
        activeOpacity={0.7}
      >
        <View style={styles.iconCircle}>
          <IconButton icon="swap-horizontal" size={24} iconColor="#0F172A" style={styles.icon} />
        </View>
        <Text style={styles.actionLabel}>Convertir</Text>
      </TouchableOpacity>

      {/* 3. Withdraw / Cash-Out */}
      <TouchableOpacity
        style={styles.actionItem}
        onPress={() => handleAction(onWithdraw)}
        activeOpacity={0.7}
      >
        <View style={styles.iconCircle}>
          <IconButton icon="arrow-up" size={24} iconColor="#0F172A" style={styles.icon} />
        </View>
        <Text style={styles.actionLabel}>Retrait</Text>
      </TouchableOpacity>

      {/* 4. Issue Card / Nouvelle carte */}
      <TouchableOpacity
        style={styles.actionItem}
        onPress={() => handleAction(onIssueCard)}
        activeOpacity={0.7}
      >
        <View style={styles.iconCircle}>
          <IconButton icon="credit-card-plus-outline" size={24} iconColor="#0F172A" style={styles.icon} />
        </View>
        <Text style={styles.actionLabel}>+ Carte</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
      paddingHorizontal: 8,
    },
    actionItem: {
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    iconCircle: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: '#F1F5F9',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#E2E8F0',
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    primaryCircle: {
      backgroundColor: '#0F172A',
      borderColor: '#0F172A',
    },
    icon: {
      margin: 0,
    },
    actionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
  });
