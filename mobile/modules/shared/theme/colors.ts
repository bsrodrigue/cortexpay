/**
 * Appends an alpha channel to a 6-digit hex color.
 */
export const toAlpha = (color: string, alpha: number): string => {
  const hex = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `${color}${hex}`;
};

export const palette = {
  // CortexPay FinTech Brand Colors (Deep Navy, Vibrant Cyan/Electric Blue, Emerald Green & Gold)
  primary: '#0F172A',         // Deep Slate / Navy Blue
  primaryDark: '#38BDF8',     // Vibrant Electric Sky Blue
  secondary: '#2563EB',       // Trust Blue
  secondaryDark: '#60A5FA',   // Soft Tech Blue
  tertiary: '#10B981',        // Emerald Green (Success & Growth)
  tertiaryDark: '#34D399',    // Mint / Neon Emerald
  error: '#DC2626',
  errorDark: '#F87171',
  neutral: '#64748B',
  neutralDark: '#94A3B8',

  // Surfaces & Backgrounds
  lightBackground: '#F8FAFC',
  lightSurface: '#FFFFFF',
  lightSurfaceVariant: '#F1F5F9',
  darkBackground: '#0B0F19',  // Deep Cyber Dark
  darkSurface: '#111827',     // Dark Card Slate
  darkSurfaceVariant: '#1F2937',

  // Text & Icons
  black: '#000000',
  white: '#FFFFFF',
  gray500: '#64748B',
  gray400: '#94A3B8',

  // FinTech Highlights
  gold: '#F59E0B',
  cyan: '#06B6D4',
  transparent: 'transparent',
  whatsapp: '#25D366',
  googleBlue: '#4285F4',
};

export type ThemeColors = typeof darkColors;

export const darkColors = {
  // Backgrounds
  background: palette.darkBackground,
  inputBackground: palette.darkSurfaceVariant,
  cardBackground: palette.darkSurface,

  // Text
  text: '#F8FAFC',
  textBlack: palette.black,
  inputText: '#F8FAFC',
  textSecondary: palette.gray400,
  textOnPrimary: '#0B0F19',
  placeholder: palette.gray500,

  // Brand / MD3
  primary: palette.primaryDark,
  onPrimary: '#0B0F19',
  primaryContainer: '#0369A1',
  onPrimaryContainer: '#E0F2FE',

  accent: palette.secondaryDark,
  onSecondary: '#0F172A',
  secondaryContainer: '#1E3A8A',
  onSecondaryContainer: '#DBEAFE',

  tertiaryContainer: '#064E3B',
  onTertiaryContainer: '#D1FAE5',

  surface: palette.darkSurface,
  onSurface: '#F8FAFC',
  surfaceVariant: palette.darkSurfaceVariant,
  onSurfaceVariant: '#94A3B8',

  outline: '#475569',
  splashBackground: '#0B0F19',

  // Feedback
  error: palette.errorDark,
  onError: '#450A0A',
  errorContainer: '#7F1D1D',
  onErrorContainer: '#FEE2E2',
  success: palette.tertiaryDark,
  warning: palette.gold,
  disabled: 'rgba(248, 250, 252, 0.38)',

  // UI Elements
  border: palette.darkSurfaceVariant,

  // Compat
  whiteBackground: palette.white,
  textWhite: palette.white,
  textLight: palette.gray400,
  transparent: palette.transparent,
  whatsapp: palette.whatsapp,
  amber: '#F59E0B',
  amber900: '#D97706',
  blue900: '#1E3A8A',
  red600: '#DC2626',
  statusDelivered: '#10B981',
  statusCancelled: '#EF4444',
  statusDelivery: '#38BDF8',
  statusPreparing: '#F59E0B',
  statusPendingConfirmation: '#8B5CF6',
  shadow: palette.black,
  overlay: 'rgba(0,0,0,0.7)',
  whiteAlpha20: 'rgba(255,255,255,0.2)',
  whiteAlpha70: 'rgba(255,255,255,0.7)',
  whiteAlpha96: 'rgba(255,255,255,0.96)',
  googleBlue: palette.googleBlue,
  skeleton: 'rgba(255,255,255,0.08)',
};

export const lightColors: ThemeColors = {
  // Backgrounds
  background: palette.lightBackground,
  inputBackground: palette.lightSurfaceVariant,
  cardBackground: palette.lightSurface,

  // Text
  text: '#0F172A',
  textBlack: palette.black,
  inputText: '#0F172A',
  textSecondary: palette.gray500,
  textOnPrimary: palette.white,
  placeholder: palette.gray400,

  // Brand / MD3
  primary: '#0284C7', // Oceanic Tech Blue
  onPrimary: palette.white,
  primaryContainer: '#E0F2FE',
  onPrimaryContainer: '#0369A1',

  accent: palette.secondary,
  onSecondary: palette.white,
  secondaryContainer: '#DBEAFE',
  onSecondaryContainer: '#1E40AF',

  tertiaryContainer: '#D1FAE5',
  onTertiaryContainer: '#065F46',

  surface: palette.lightSurface,
  onSurface: '#0F172A',
  surfaceVariant: palette.lightSurfaceVariant,
  onSurfaceVariant: '#64748B',

  outline: '#CBD5E1',
  splashBackground: '#0F172A',

  // Feedback
  error: palette.error,
  onError: palette.white,
  errorContainer: '#FEE2E2',
  onErrorContainer: '#991B1B',
  success: '#059669',
  warning: palette.gold,
  disabled: 'rgba(15, 23, 42, 0.38)',

  // UI Elements
  border: '#E2E8F0',

  // Compat
  whiteBackground: palette.white,
  textWhite: '#0F172A',
  textLight: palette.gray500,
  transparent: palette.transparent,
  whatsapp: palette.whatsapp,
  amber: '#F59E0B',
  amber900: '#D97706',
  blue900: '#1E3A8A',
  red600: '#DC2626',
  statusDelivered: '#10B981',
  statusCancelled: '#EF4444',
  statusDelivery: '#0284C7',
  statusPreparing: '#F59E0B',
  statusPendingConfirmation: '#8B5CF6',
  shadow: palette.black,
  overlay: 'rgba(0,0,0,0.4)',
  whiteAlpha20: 'rgba(255,255,255,0.2)',
  whiteAlpha70: 'rgba(255,255,255,0.7)',
  googleBlue: palette.googleBlue,
  whiteAlpha96: 'rgba(255,255,255,0.96)',
  skeleton: '#E2E8F0',
};
