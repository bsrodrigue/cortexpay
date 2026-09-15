import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Theme, useThemedStyles } from '@/modules/shared/theme';

export type TabKey = 'home' | 'cards' | 'activity' | 'settings';

interface ModernTabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onActionPress?: () => void;
}

interface TabItemConfig {
  key: TabKey;
  label: string;
  icon: string;
  activeIcon: string;
}

const TABS: TabItemConfig[] = [
  { key: 'home', label: 'Accueil', icon: 'home-outline', activeIcon: 'home' },
  { key: 'cards', label: 'Cartes', icon: 'credit-card-outline', activeIcon: 'credit-card' },
  { key: 'activity', label: 'Activité', icon: 'clock-outline', activeIcon: 'clock' },
  { key: 'settings', label: 'Profil', icon: 'account-outline', activeIcon: 'account' },
];

export const ModernTabBar: React.FC<ModernTabBarProps> = ({
  activeTab,
  onTabChange,
  onActionPress,
}) => {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);

  const handleTabPress = (tab: TabKey) => {
    void Haptics.selectionAsync();
    onTabChange(tab);
  };

  const handleAction = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onActionPress) {
      onActionPress();
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.tabBarSurface}>
        {/* Left tabs: Home, Cards */}
        {TABS.slice(0, 2).map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => handleTabPress(tab.key)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              <View style={[styles.iconWrapper, isActive && styles.activeIconWrapper]}>
                <IconButton
                  icon={isActive ? tab.activeIcon : tab.icon}
                  size={22}
                  iconColor={isActive ? '#2563EB' : '#94A3B8'}
                  style={styles.icon}
                />
              </View>
              <Text
                variant="labelSmall"
                style={[styles.tabLabel, isActive && styles.activeTabLabel]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Center Floating Action Button (Quick Pay / Transfer) */}
        <TouchableOpacity
          style={styles.centerActionItem}
          onPress={handleAction}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Action rapide"
        >
          <View style={styles.fabGlow}>
            <View style={styles.centerFab}>
              <IconButton icon="swap-horizontal" size={24} iconColor="#FFFFFF" style={styles.fabIcon} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Right tabs: Activity, Profile/Settings */}
        {TABS.slice(2, 4).map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => handleTabPress(tab.key)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              <View style={[styles.iconWrapper, isActive && styles.activeIconWrapper]}>
                <IconButton
                  icon={isActive ? tab.activeIcon : tab.icon}
                  size={22}
                  iconColor={isActive ? '#2563EB' : '#94A3B8'}
                  style={styles.icon}
                />
              </View>
              <Text
                variant="labelSmall"
                style={[styles.tabLabel, isActive && styles.activeTabLabel]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: 'center',
      paddingHorizontal: 16,
      backgroundColor: 'transparent',
      pointerEvents: 'box-none',
    },
    tabBarSurface: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.surface,
      borderRadius: 28,
      paddingHorizontal: 8,
      paddingVertical: 4,
      width: '100%',
      maxWidth: 420,
      borderWidth: 1,
      borderColor: 'rgba(226, 232, 240, 0.8)',
      ...Platform.select({
        ios: {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 24,
        },
        android: {
          elevation: 12,
        },
      }),
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
    },
    iconWrapper: {
      borderRadius: 16,
      padding: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activeIconWrapper: {
      backgroundColor: '#EFF6FF',
    },
    icon: {
      margin: 0,
    },
    tabLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: '#94A3B8',
      marginTop: 2,
    },
    activeTabLabel: {
      color: '#2563EB',
      fontWeight: '700',
    },
    centerActionItem: {
      alignItems: 'center',
      justifyContent: 'center',
      top: -14,
      paddingHorizontal: 4,
    },
    fabGlow: {
      borderRadius: 30,
      padding: 4,
      backgroundColor: theme.colors.surface,
      ...Platform.select({
        ios: {
          shadowColor: '#2563EB',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 10,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    centerFab: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: '#2563EB',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabIcon: {
      margin: 0,
    },
  });
