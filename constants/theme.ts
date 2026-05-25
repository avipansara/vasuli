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
export const ACCENT_GREEN = '#22C55E';
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

// Legacy aliases for backward compatibility
const accentTeal = ACCENT_TEAL;
const accentGreen = ACCENT_GREEN;
const accentPurple = ACCENT_PURPLE;
const backgroundDark = BG_DARK;
const backgroundCardDark = BG_CARD_DARK;
const backgroundLight = BG_LIGHT;
const backgroundCardLight = BG_CARD_LIGHT;
const surfaceGlassDark = BG_GLASS_DARK;
const surfaceBorderDark = BORDER_DARK;
const surfaceBorderLight = BORDER_LIGHT;

export const Colors = {
  light: {
    text: '#1A1A1A',
    textSecondary: '#6B7280',
    background: backgroundLight,
    tint: accentGreen,
    icon: '#6B7280',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: accentGreen,
    // Extended palette
    accent: accentGreen,
    accentSecondary: '#FACC15', // Yellow accent like reference
    card: backgroundCardLight,
    cardGlass: '#FFFFFF',
    border: surfaceBorderLight,
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
    background: backgroundDark,
    tint: accentTeal,
    icon: '#6B7280',
    tabIconDefault: '#4B5563',
    tabIconSelected: accentTeal,
    // Extended palette
    accent: accentTeal,
    accentSecondary: accentPurple,
    card: backgroundCardDark,
    cardGlass: surfaceGlassDark,
    border: surfaceBorderDark,
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
    buttonPrimary: ['#22C55E', '#16A34A'] as [string, string],
    purpleAccent: ['#FACC15', '#EAB308'] as [string, string],
    glassOverlay: ['#FFFFFF', '#FFFFFF'] as [string, string],
    cardGlass: ['#FFFFFF', '#FFFFFF'] as [string, string],
  },
  // Keep these for backward compatibility - will be deprecated
  screenBackground: ['#0D1B1E', '#0A1214', '#080E10'] as [string, string, string],
  cardPrimary: ['#1A2428', '#141C1E'] as [string, string],
  cardAccent: ['rgba(45, 212, 191, 0.15)', 'rgba(139, 92, 246, 0.1)'] as [string, string],
  hero: ['#0D1B1E', '#0A1214'] as [string, string],
  buttonPrimary: ['#2DD4BF', '#14B8A6'] as [string, string],
  purpleAccent: ['#A78BFA', '#8B5CF6'] as [string, string],
  glassOverlay: ['rgba(26, 26, 36, 0.9)', 'rgba(18, 18, 26, 0.95)'] as [string, string],
  cardGlass: ['rgba(20, 35, 38, 0.9)', 'rgba(15, 25, 28, 0.95)'] as [string, string],
};

// Helper function to get gradients based on color scheme
export const getGradients = (colorScheme: 'light' | 'dark') => Gradients[colorScheme];

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
