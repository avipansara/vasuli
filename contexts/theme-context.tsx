import React, { createContext, useContext, useEffect, useState } from 'react';
import { Appearance, useColorScheme as useSystemColorScheme } from 'react-native';

type ColorScheme = 'light' | 'dark';

interface ThemeContextType {
  colorScheme: ColorScheme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (scheme: ColorScheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const initialColorScheme: ColorScheme = systemColorScheme === 'light' ? 'light' : 'dark';
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(initialColorScheme);

  function setTheme(scheme: ColorScheme) {
    setColorSchemeState(scheme);
  }

  function toggleTheme() {
    const newScheme = colorScheme === 'dark' ? 'light' : 'dark';
    setTheme(newScheme);
  }

  useEffect(() => {
    Appearance?.setColorScheme?.(colorScheme);
  }, [colorScheme]);

  const value: ThemeContextType = {
    colorScheme,
    isDark: colorScheme === 'dark',
    toggleTheme,
    setTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
