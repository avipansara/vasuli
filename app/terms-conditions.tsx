import { ThemedText } from '@/components/themed-text';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

export default function TermsConditionsScreen() {
  const { gradients, colors } = useThemeColors();

  return (
    <LinearGradient colors={gradients.screenBackground} style={styles.container}>
      <NavigationHeader title="Terms & Conditions" onBack={() => router.back()} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        
        <ThemedText style={[styles.lastUpdated, { color: colors.textSecondary }]}>
          Last updated: January 16, 2026
        </ThemedText>

        <Section title="Agreement to Terms">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            By downloading, installing, or using Vasuli, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use the application.
          </ThemedText>
        </Section>

        <Section title="Description of Service">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            Vasuli is a mobile application designed to help users track and split expenses with friends and groups. The app allows you to:
          </ThemedText>
          <BulletPoint text="Create and manage expense groups" color={colors.textSecondary} />
          <BulletPoint text="Add and track shared expenses" color={colors.textSecondary} />
          <BulletPoint text="Calculate balances between friends" color={colors.textSecondary} />
          <BulletPoint text="Settle debts and track payments" color={colors.textSecondary} />
        </Section>

        <Section title="User Accounts">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            To use Vasuli, you must create an account. You are responsible for:
          </ThemedText>
          <BulletPoint text="Maintaining the confidentiality of your account credentials" color={colors.textSecondary} />
          <BulletPoint text="All activities that occur under your account" color={colors.textSecondary} />
          <BulletPoint text="Providing accurate and complete information" color={colors.textSecondary} />
          <BulletPoint text="Notifying us of any unauthorized use of your account" color={colors.textSecondary} />
        </Section>

        <Section title="Acceptable Use">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            You agree not to:
          </ThemedText>
          <BulletPoint text="Use the app for any illegal or unauthorized purpose" color={colors.textSecondary} />
          <BulletPoint text="Attempt to gain unauthorized access to our systems" color={colors.textSecondary} />
          <BulletPoint text="Interfere with or disrupt the app or servers" color={colors.textSecondary} />
          <BulletPoint text="Upload malicious code or content" color={colors.textSecondary} />
          <BulletPoint text="Harass, abuse, or harm other users" color={colors.textSecondary} />
          <BulletPoint text="Use the app to send spam or unsolicited messages" color={colors.textSecondary} />
        </Section>

        <Section title="Financial Disclaimer">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            Vasuli is an expense tracking tool only. We do not process payments, transfer money, or provide financial services. Any actual money transfers between users must be conducted through separate payment methods. We are not responsible for any financial disputes between users.
          </ThemedText>
        </Section>

        <Section title="Intellectual Property">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            The Vasuli app, including its design, features, and content, is owned by us and protected by intellectual property laws. You may not copy, modify, distribute, or reverse engineer any part of the application without our written consent.
          </ThemedText>
        </Section>

        <Section title="Limitation of Liability">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            To the maximum extent permitted by law, Vasuli and its developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the application. This includes but is not limited to:
          </ThemedText>
          <BulletPoint text="Loss of data or information" color={colors.textSecondary} />
          <BulletPoint text="Financial losses from expense miscalculations" color={colors.textSecondary} />
          <BulletPoint text="Disputes between users" color={colors.textSecondary} />
          <BulletPoint text="Service interruptions or downtime" color={colors.textSecondary} />
        </Section>

        <Section title="Termination">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            We reserve the right to suspend or terminate your account at any time for violations of these terms or for any other reason at our discretion. You may also delete your account at any time through the app settings.
          </ThemedText>
        </Section>

        <Section title="Changes to Terms">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            We may modify these Terms and Conditions at any time. Continued use of the app after changes constitutes acceptance of the new terms. We will notify users of significant changes through the app or via email.
          </ThemedText>
        </Section>

        <Section title="Governing Law">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            These terms shall be governed by and construed in accordance with applicable laws. Any disputes arising from these terms or your use of the app shall be resolved through appropriate legal channels.
          </ThemedText>
        </Section>

        <Section title="Contact Us">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            If you have any questions about these Terms and Conditions, please contact us at:
          </ThemedText>
          <ThemedText style={[styles.contactInfo, { color: colors.accent }]}>
            support@split-space.com
          </ThemedText>
        </Section>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </LinearGradient>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {children}
    </View>
  );
}

function BulletPoint({ text, color }: { text: string; color: string }) {
  return (
    <View style={styles.bulletPoint}>
      <ThemedText style={[styles.bullet, { color }]}>•</ThemedText>
      <ThemedText style={[styles.bulletText, { color }]}>{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  lastUpdated: {
    fontSize: 14,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 12,
  },
  bulletPoint: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  bullet: {
    fontSize: 15,
    marginRight: 8,
  },
  bulletText: {
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
  },
  contactInfo: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
  },
  bottomSpacer: {
    height: 40,
  },
});
