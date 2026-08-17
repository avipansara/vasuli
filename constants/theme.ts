/**
 * Ambient / Liquid Glass UI Theme
 * Supports both dark and light modes with teal/cyan accents
 */

import { Platform } from 'react-native';

// ============================================
// COLOR CONSTANTS
// ============================================

// Primary accents
export const ACCENT_TEAL = '#2DD4BF';
export const ACCENT_GREEN = '#0cca51ff';
export const ACCENT_PURPLE = '#A78BFA';
export const ACCENT_YELLOW = '#FACC15';

// Status colors
export const SUCCESS_DARK = '#10b981';
export const SUCCESS_LIGHT = '#22C55E';
export const ERROR_COLOR = '#EF4444';

// Dark mode backgrounds
export const BG_DARK = '#0A0A0F';
export const BG_CARD_DARK = '#12121A';
export const BG_GLASS_DARK = 'rgba(26, 26, 36, 0.8)';
export const BG_ICON_DARK = 'rgba(45, 212, 191, 0.15)';
export const BG_ICON_SUCCESS_DARK = 'rgba(16, 185, 129, 0.15)';

// Light mode backgrounds
export const BG_LIGHT = '#F5F5F5';
export const BG_CARD_LIGHT = '#FFFFFF';
export const BG_ICON_LIGHT = 'rgba(34, 197, 94, 0.1)';

// Borders
export const BORDER_DARK = 'rgba(45, 212, 191, 0.2)';
export const BORDER_LIGHT = '#E5E5E5';
export const BORDER_ACCENT_DARK = 'rgba(45, 212, 191, 0.3)';
export const BORDER_ACCENT_LIGHT = 'rgba(34, 197, 94, 0.3)';

// Text colors
export const TEXT_DARK = '#f4f4f5';
export const TEXT_LIGHT = '#1A1A1A';
export const TEXT_SECONDARY_DARK = '#9CA3AF';
export const TEXT_SECONDARY_LIGHT = '#6B7280';

// Button backgrounds
export const BTN_CLOSE_DARK = 'rgba(255, 255, 255, 0.1)';
export const BTN_CLOSE_LIGHT = 'rgba(0, 0, 0, 0.05)';
export const BTN_DISABLED_DARK = ['#1A1A24', '#12121A'] as const;
export const BTN_DISABLED_LIGHT = ['#E5E5E5', '#D4D4D4'] as const;

export const Colors = {
  light: {
    text: '#1A1A1A',
    textSecondary: '#374151',
    background: BG_LIGHT,
    tint: ACCENT_GREEN,
    icon: '#6B7280',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: ACCENT_GREEN,
    // Extended palette
    accent: ACCENT_GREEN,
    accentSecondary: '#FACC15', // Yellow accent like reference
    card: BG_CARD_LIGHT,
    cardGlass: '#FFFFFF',
    border: BORDER_LIGHT,
    success: '#22C55E',
    error: '#EF4444',
    // Additional light mode colors
    inputBackground: '#FFFFFF',
    inputBorder: '#E5E5E5',
    modalBackground: '#F5F5F5',
    headerBackground: '#F5F5F5',
  },
  dark: {
    text: '#f4f4f5',
    textSecondary: '#9CA3AF',
    background: BG_DARK,
    tint: ACCENT_TEAL,
    icon: '#6B7280',
    tabIconDefault: '#4B5563',
    tabIconSelected: ACCENT_TEAL,
    // Extended palette
    accent: ACCENT_TEAL,
    accentSecondary: ACCENT_PURPLE,
    card: BG_CARD_DARK,
    cardGlass: BG_GLASS_DARK,
    border: BORDER_DARK,
    success: '#10B981',
    error: '#EF4444',
    // Additional dark mode colors
    inputBackground: 'rgba(26, 26, 36, 0.8)',
    inputBorder: 'rgba(45, 212, 191, 0.2)',
    modalBackground: '#0A0A0F',
    headerBackground: '#0D1B1E',
  },
};

export const ExpenseDetailTheme = {
  light: {
    accent: ACCENT_GREEN,
    onAccent: BG_DARK,
    surface: BG_CARD_LIGHT,
    surfaceBorder: BORDER_LIGHT,
    mutedSurface: 'rgba(250, 250, 250, 0.96)',
    mutedSurfaceBorder: BORDER_LIGHT,
    accentSurface: BG_ICON_LIGHT,
    accentSurfaceBorder: 'rgba(34, 197, 94, 0.22)',
    selectedSurface: BG_ICON_LIGHT,
    avatarSurface: 'rgba(34, 197, 94, 0.12)',
    danger: ERROR_COLOR,
    dangerSurface: 'rgba(239, 68, 68, 0.1)',
    dangerBorder: 'rgba(239, 68, 68, 0.22)',
    warning: '#F59E0B',
    neutralPillSurface: 'rgba(107, 114, 128, 0.1)',
    divider: 'rgba(156, 163, 175, 0.35)',
    backgroundAccentTop: 'rgba(34, 197, 94, 0.08)',
    backgroundAccentMiddle: 'rgba(167, 139, 250, 0.06)',
    backgroundAccentBottom: 'rgba(45, 212, 191, 0.05)',
  },
  dark: {
    accent: ACCENT_TEAL,
    onAccent: BG_DARK,
    surface: 'rgba(20, 35, 38, 0.82)',
    surfaceBorder: 'rgba(45, 212, 191, 0.16)',
    mutedSurface: 'rgba(18, 18, 26, 0.72)',
    mutedSurfaceBorder: 'rgba(45, 212, 191, 0.14)',
    accentSurface: 'rgba(45, 212, 191, 0.12)',
    accentSurfaceBorder: 'rgba(45, 212, 191, 0.24)',
    selectedSurface: 'rgba(45, 212, 191, 0.12)',
    avatarSurface: 'rgba(45, 212, 191, 0.14)',
    danger: ERROR_COLOR,
    dangerSurface: 'rgba(239, 68, 68, 0.14)',
    dangerBorder: 'rgba(239, 68, 68, 0.22)',
    warning: '#F59E0B',
    neutralPillSurface: 'rgba(156, 163, 175, 0.12)',
    divider: 'rgba(156, 163, 175, 0.35)',
    backgroundAccentTop: 'rgba(45, 212, 191, 0.08)',
    backgroundAccentMiddle: 'rgba(167, 139, 250, 0.06)',
    backgroundAccentBottom: 'rgba(45, 212, 191, 0.05)',
  },
};

export const FriendsTheme = {
  light: {
    actionSurface: BG_ICON_LIGHT,
    actionBorder: BORDER_ACCENT_LIGHT,
    actionIcon: ACCENT_GREEN,
    primaryButtonText: BG_DARK,
    emptyIconSurface: 'rgba(34, 197, 94, 0.1)',
    settledSurface: 'rgba(107, 114, 128, 0.06)',
    cardSurface: BG_CARD_LIGHT,
    cardBorder: BORDER_LIGHT,
    cardShadow: BG_DARK,
    cardShadowOpacity: 0.06,
    avatarSurface: 'rgba(34, 197, 94, 0.12)',
    branch: ACCENT_GREEN,
    dangerSurface: 'rgba(239, 68, 68, 0.16)',
    onDanger: BG_CARD_LIGHT,
  },
  dark: {
    actionSurface: BG_ICON_DARK,
    actionBorder: BORDER_ACCENT_DARK,
    actionIcon: ACCENT_TEAL,
    primaryButtonText: BG_DARK,
    emptyIconSurface: 'rgba(45, 212, 191, 0.1)',
    settledSurface: 'rgba(20, 35, 38, 0.4)',
    cardSurface: 'rgba(20, 35, 38, 0.6)',
    cardBorder: 'rgba(45, 212, 191, 0.14)',
    cardShadow: BG_DARK,
    cardShadowOpacity: 0,
    avatarSurface: BG_ICON_DARK,
    branch: ACCENT_TEAL,
    dangerSurface: 'rgba(239, 68, 68, 0.18)',
    onDanger: TEXT_DARK,
  },
};

export const FriendDetailTheme = {
  light: {
    actionSurface: BG_ICON_LIGHT,
    actionBorder: BORDER_ACCENT_LIGHT,
    actionIcon: ACCENT_GREEN,
    warningSurface: 'rgba(251, 191, 36, 0.15)',
    warningBorder: 'rgba(251, 191, 36, 0.3)',
    warning: '#F59E0B',
    dangerSurface: 'rgba(239, 68, 68, 0.12)',
    dangerBorder: 'rgba(239, 68, 68, 0.28)',
    danger: ERROR_COLOR,
    surface: BG_CARD_LIGHT,
    surfaceBorder: BORDER_LIGHT,
    mutedSurface: 'rgba(250, 250, 250, 0.96)',
    avatarSurface: 'rgba(34, 197, 94, 0.12)',
    avatarBorder: 'rgba(34, 197, 94, 0.22)',
    positive: SUCCESS_LIGHT,
    positiveSurface: 'rgba(34, 197, 94, 0.1)',
    positiveBorder: 'rgba(34, 197, 94, 0.24)',
    negative: ERROR_COLOR,
    negativeSurface: 'rgba(239, 68, 68, 0.1)',
    settledSurface: BG_ICON_LIGHT,
    onPrimary: BG_DARK,
    onDanger: BG_CARD_LIGHT,
    backgroundAccentTop: 'rgba(34, 197, 94, 0.08)',
    backgroundAccentMiddle: 'rgba(167, 139, 250, 0.06)',
    backgroundAccentBottom: 'rgba(45, 212, 191, 0.05)',
  },
  dark: {
    actionSurface: BG_ICON_DARK,
    actionBorder: BORDER_ACCENT_DARK,
    actionIcon: ACCENT_TEAL,
    warningSurface: 'rgba(245, 158, 11, 0.15)',
    warningBorder: 'rgba(245, 158, 11, 0.3)',
    warning: '#F59E0B',
    dangerSurface: 'rgba(239, 68, 68, 0.15)',
    dangerBorder: 'rgba(239, 68, 68, 0.3)',
    danger: ERROR_COLOR,
    surface: 'rgba(20, 35, 38, 0.72)',
    surfaceBorder: 'rgba(45, 212, 191, 0.14)',
    mutedSurface: 'rgba(18, 18, 26, 0.72)',
    avatarSurface: BG_ICON_DARK,
    avatarBorder: BORDER_ACCENT_DARK,
    positive: SUCCESS_DARK,
    positiveSurface: BG_ICON_SUCCESS_DARK,
    positiveBorder: 'rgba(16, 185, 129, 0.26)',
    negative: ERROR_COLOR,
    negativeSurface: 'rgba(239, 68, 68, 0.14)',
    settledSurface: BG_ICON_DARK,
    onPrimary: BG_DARK,
    onDanger: TEXT_DARK,
    backgroundAccentTop: 'rgba(45, 212, 191, 0.08)',
    backgroundAccentMiddle: 'rgba(167, 139, 250, 0.06)',
    backgroundAccentBottom: 'rgba(45, 212, 191, 0.05)',
  },
};

// Gradient presets for liquid glass effects - Dark mode
export const Gradients = {
  dark: {
    screenBackground: ['#0D1B1E', '#0A1214', '#080E10'] as [string, string, string],
    cardPrimary: ['#1A2428', '#141C1E'] as [string, string],
    cardAccent: ['rgba(45, 212, 191, 0.15)', 'rgba(139, 92, 246, 0.1)'] as [string, string],
    hero: ['#0D1B1E', '#0A1214'] as [string, string],
    buttonPrimary: ['#2DD4BF', '#14B8A6'] as [string, string],
    purpleAccent: ['#A78BFA', '#8B5CF6'] as [string, string],
    glassOverlay: ['rgba(26, 26, 36, 0.9)', 'rgba(18, 18, 26, 0.95)'] as [string, string],
    cardGlass: ['rgba(20, 35, 38, 0.9)', 'rgba(15, 25, 28, 0.95)'] as [string, string],
  },
  light: {
    screenBackground: ['#F5F5F5', '#F5F5F5', '#F5F5F5'] as [string, string, string],
    cardPrimary: ['#FFFFFF', '#FFFFFF'] as [string, string],
    cardAccent: ['#FFFFFF', '#FFFFFF'] as [string, string],
    hero: ['#F5F5F5', '#F5F5F5'] as [string, string],
    buttonPrimary: ['#22C55E', '#0F4C3A'] as [string, string],
    purpleAccent: ['#FACC15', '#EAB308'] as [string, string],
    glassOverlay: ['#FFFFFF', '#FFFFFF'] as [string, string],
    cardGlass: ['#FFFFFF', '#FFFFFF'] as [string, string],
  },
};

// Glow/shadow effects for ambient UI
export const Glows = {
  teal: {
    shadowColor: '#2DD4BF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  purple: {
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
