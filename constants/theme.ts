/**
 * Ambient / Liquid Glass UI Theme
 * Supports both dark and light modes with teal/cyan accents
 */

import { Platform } from 'react-native';

// Primary accent - Teal/Cyan for dark mode
const accentTeal = '#2DD4BF'; // Bright teal
// Green accent for light mode (matching reference)
const accentGreen = '#22C55E'; // Green like reference image

// Secondary accent - Purple/Violet gradient colors
const accentPurple = '#A78BFA'; // Violet

// Dark mode background colors
const backgroundDark = '#0A0A0F'; // Near black with slight blue
const backgroundCardDark = '#12121A'; // Slightly lighter for cards

// Light mode background colors (clean white/gray like reference)
const backgroundLight = '#F5F5F5'; // Light gray background
const backgroundCardLight = '#FFFFFF'; // White for cards

// Surface colors for glass effect - Dark mode
const surfaceGlassDark = 'rgba(26, 26, 36, 0.8)'; // Semi-transparent glass
const surfaceBorderDark = 'rgba(45, 212, 191, 0.2)'; // Teal border glow

// Surface colors for light mode
const surfaceBorderLight = '#E5E5E5'; // Light gray border

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
