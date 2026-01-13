import { ThemedText } from '@/components/themed-text';
import { FormInput } from '@/components/ui/form-input';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

export default function SignUpScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await signUp(name.trim(), email.trim(), password);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={gradients.screenBackground} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={[styles.logoContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
              <IconSymbol name="person.badge.plus" size={48} color={isDark ? '#2DD4BF' : colors.tint} />
            </View>
            <ThemedText type="title" style={[styles.title, !isDark && { color: colors.text }]}>
              Create Account
            </ThemedText>
            <ThemedText style={[styles.subtitle, !isDark && { color: colors.textSecondary }]}>
              Start splitting expenses with friends
            </ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, !isDark && { color: colors.textSecondary }]}>Name</ThemedText>
              <FormInput
                placeholder="Enter your name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoComplete="name"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, !isDark && { color: colors.textSecondary }]}>Email</ThemedText>
              <FormInput
                placeholder="Enter your email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, !isDark && { color: colors.textSecondary }]}>Password</ThemedText>
              <FormInput
                placeholder="Create a password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.label, !isDark && { color: colors.textSecondary }]}>Confirm Password</ThemedText>
              <FormInput
                placeholder="Confirm your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="new-password"
              />
            </View>

            <Pressable
              onPress={handleSignUp}
              disabled={loading}
              style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}>
              <LinearGradient
                colors={gradients.buttonPrimary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.submitButtonGradient, loading && styles.submitButtonDisabled]}>
                {loading ? (
                  <ThemedText style={styles.submitButtonText}>Creating account...</ThemedText>
                ) : (
                  <>
                    <ThemedText style={styles.submitButtonText}>Sign Up</ThemedText>
                    <IconSymbol name="arrow.right" size={18} color="#0A0A0F" />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <ThemedText style={[styles.footerText, !isDark && { color: colors.textSecondary }]}>
              {"Already have an account? "}
            </ThemedText>
            <Link href="/sign-in" asChild>
              <Pressable>
                <ThemedText style={[styles.linkText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                  Sign In
                </ThemedText>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
  },
  form: {
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    opacity: 0.8,
  },
  submitButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  submitButtonPressed: {
    opacity: 0.9,
  },
  submitButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#0A0A0F',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
