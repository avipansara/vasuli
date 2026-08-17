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
export const ACCENT_GREEN = '#005E44'; // #0CCCA51FF
export const ACCENT_PURPLE = '#A78BFA';
export const ACCENT_YELLOW = '#FACC15';

// Status colors
export const SUCCESS_DARK = '#10b981';
export const SUCCESS_LIGHT = '#005E44'; // #22C55E
export const ERROR_COLOR = '#990000';

// Dark mode backgrounds
export const BG_DARK = '#0A0A0F';
export const BG_CARD_DARK = '#12121A';
export const BG_GLASS_DARK = 'rgba(26, 26, 36, 0.8)';
export const BG_ICON_DARK = 'rgba(45, 212, 191, 0.15)';
export const BG_ICON_SUCCESS_DARK = 'rgba(16, 185, 129, 0.15)';

// Light mode backgrounds
export const BG_LIGHT = '#F1F5F9';
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
    success: '#005E44',
    error: '#990000',
    // Additional light mode colors
    inputBackground: '#FFFFFF',
    inputBorder: '#E5E5E5',
    modalBackground: '#F5F5F5',
    headerBackground: '#F5F5F5',
  },
  dark: {
    text: '#f8fafc',
    textSecondary: '#9ba6b8',
    background: '#040914',
    tint: '#10b981',
    icon: '#64748b',
    tabIconDefault: '#64748b',
    tabIconSelected: '#10b981',
    // Extended palette
    accent: '#10b981',
    accentSecondary: '#4edea3',
    card: '#0f172a',
    cardGlass: 'rgba(30, 41, 59, 0.4)',
    border: '#2a3441',
    success: '#10b981',
    error: '#ffb4ab',
    // Additional dark mode colors
    inputBackground: '#0b1120',
    inputBorder: '#2a3441',
    modalBackground: '#040914',
    headerBackground: '#040914',
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
    accent: '#10b981',
    onAccent: '#003827',
    surface: '#0b1120',
    surfaceBorder: 'rgba(42, 52, 65, 0.5)',
    mutedSurface: '#0f172a',
    mutedSurfaceBorder: 'rgba(42, 52, 65, 0.5)',
    accentSurface: 'rgba(16, 185, 129, 0.15)',
    accentSurfaceBorder: 'rgba(16, 185, 129, 0.3)',
    selectedSurface: '#0f172a',
    avatarSurface: '#162032',
    danger: '#ffb4ab',
    dangerSurface: '#93000a',
    dangerBorder: 'rgba(239, 68, 68, 0.3)',
    warning: '#F59E0B',
    neutralPillSurface: 'rgba(155, 166, 184, 0.12)',
    divider: '#2a3441',
    backgroundAccentTop: 'rgba(16, 185, 129, 0.1)',
    backgroundAccentMiddle: 'rgba(167, 139, 250, 0.06)',
    backgroundAccentBottom: 'rgba(16, 185, 129, 0.05)',
    background: '#060b18',
    textPrimary: '#f8fafc',
    textSecondary: '#9ba6b8',
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
    actionSurface: '#0f172a',
    actionBorder: '#2a3441',
    actionIcon: '#10b981',
    primaryButtonText: '#003827',
    emptyIconSurface: '#064e3b',
    settledSurface: '#162032',
    cardSurface: '#0f172a',
    cardBorder: 'transparent',
    cardShadow: '#000000',
    cardShadowOpacity: 0.35,
    avatarSurface: '#064e3b',
    branch: '#10b981',
    dangerSurface: '#93000a',
    onDanger: '#ffb4ab',
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
    actionSurface: 'rgba(13, 19, 33, 0.6)',
    actionBorder: 'rgba(255, 255, 255, 0.05)',
    actionIcon: '#10b981',
    warningSurface: 'rgba(245, 158, 11, 0.15)',
    warningBorder: 'rgba(245, 158, 11, 0.3)',
    warning: '#F59E0B',
    dangerSurface: 'rgba(136, 29, 36, 0.2)',
    dangerBorder: 'rgba(239, 68, 68, 0.3)',
    danger: '#ffb3b0',
    surface: '#0d1321',
    surfaceBorder: 'rgba(255, 255, 255, 0.05)',
    mutedSurface: '#131b2e',
    avatarSurface: '#2d3449',
    avatarBorder: 'rgba(255, 255, 255, 0.08)',
    positive: '#45dfa4',
    positiveSurface: 'rgba(0, 185, 130, 0.1)',
    positiveBorder: 'rgba(69, 223, 164, 0.26)',
    negative: '#ffb3b0',
    negativeSurface: 'rgba(136, 29, 36, 0.2)',
    settledSurface: '#1e293b',
    onPrimary: '#ffffff',
    onDanger: '#050914',
    backgroundAccentTop: 'rgba(136, 29, 36, 0.2)',
    backgroundAccentMiddle: 'rgba(167, 139, 250, 0.06)',
    backgroundAccentBottom: 'rgba(0, 185, 130, 0.1)',
    heroBackground: '#0d1321',
    heroBorder: 'rgba(255, 255, 255, 0.05)',
    buttonBackground: '#10b981',
    buttonText: '#ffffff',
    background: '#050914',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
  },
};

export const SettleTheme = {
  light: {
    heroBackground: '#FFFFFF',
    heroBorder: 'rgba(191, 201, 195, 0.3)',
    pillBackground: '#E1E8FD',
    buttonBackground: '#003527',
    accentText: '#064E3B',
    cardBackground: '#FFFFFF',
    cardBorder: 'rgba(191, 201, 195, 0.35)',
    selectedCardBackground: '#D1EEEE',
    avatarBackground: '#95D3BA',
    avatarText: '#0B513D',
  },
  dark: {
    heroBackground: '#131b2e',
    heroBorder: 'rgba(60, 74, 66, 0.3)',
    pillBackground: '#222a3d',
    buttonBackground: '#4edea3',
    buttonText: '#003824',
    accentText: '#10b981',
    cardBackground: '#060e20',
    cardBorder: 'rgba(60, 74, 66, 0.3)',
    selectedCardBackground: '#222a3d',
    avatarBackground: '#4edea3',
    avatarText: '#005236',
    background: '#0b1326',
    textPrimary: '#dae2fd',
    textSecondary: '#bbcabf',
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
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  purple: {
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
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
