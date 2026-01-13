/**
 * Ambient / Liquid Glass UI Theme
 * Dark theme with teal/cyan accents and purple gradient highlights
 */

import { Platform } from 'react-native';

// Primary accent - Teal/Cyan (from reference)
const accentTeal = '#2DD4BF'; // Bright teal

// Secondary accent - Purple/Violet gradient colors
const accentPurple = '#A78BFA'; // Violet

// Background colors - Deep dark
const backgroundDark = '#0A0A0F'; // Near black with slight blue
const backgroundCard = '#12121A'; // Slightly lighter for cards

// Surface colors for glass effect
const surfaceGlass = 'rgba(26, 26, 36, 0.8)'; // Semi-transparent glass
const surfaceBorder = 'rgba(45, 212, 191, 0.2)'; // Teal border glow

export const Colors = {
  light: {
    text: '#f4f4f5',
    background: backgroundDark,
    tint: accentTeal,
    icon: '#6B7280',
    tabIconDefault: '#4B5563',
    tabIconSelected: accentTeal,
    // Extended palette
    accent: accentTeal,
    accentSecondary: accentPurple,
    card: backgroundCard,
    cardGlass: surfaceGlass,
    border: surfaceBorder,
    success: '#10B981',
    error: '#EF4444',
  },
  dark: {
    text: '#f4f4f5',
    background: backgroundDark,
    tint: accentTeal,
    icon: '#6B7280',
    tabIconDefault: '#4B5563',
    tabIconSelected: accentTeal,
    // Extended palette
    accent: accentTeal,
    accentSecondary: accentPurple,
    card: backgroundCard,
    cardGlass: surfaceGlass,
    border: surfaceBorder,
    success: '#10B981',
    error: '#EF4444',
  },
};

// Gradient presets for liquid glass effects
export const Gradients = {
  // Screen background - dark teal gradient like the reference
  screenBackground: ['#0D1B1E', '#0A1214', '#080E10'] as [string, string, string],
  // Card gradient - teal to purple
  cardPrimary: ['#1A2428', '#141C1E'] as [string, string],
  // Accent card with teal glow
  cardAccent: ['rgba(45, 212, 191, 0.15)', 'rgba(139, 92, 246, 0.1)'] as [string, string],
  // Header/hero gradient
  hero: ['#0D1B1E', '#0A1214'] as [string, string],
  // Button gradient
  buttonPrimary: ['#2DD4BF', '#14B8A6'] as [string, string],
  // Purple accent gradient
  purpleAccent: ['#A78BFA', '#8B5CF6'] as [string, string],
  // Glass overlay
  glassOverlay: ['rgba(26, 26, 36, 0.9)', 'rgba(18, 18, 26, 0.95)'] as [string, string],
  // Card with subtle teal border glow
  cardGlass: ['rgba(20, 35, 38, 0.9)', 'rgba(15, 25, 28, 0.95)'] as [string, string],
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
