import { ThemedText } from '@/components/themed-text';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

export default function PrivacyPolicyScreen() {
  const { gradients, colors } = useThemeColors();

  return (
    <LinearGradient colors={gradients.screenBackground} style={styles.container}>
      <NavigationHeader title="Privacy Policy" onBack={() => router.back()} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        
        <ThemedText style={[styles.lastUpdated, { color: colors.textSecondary }]}>
          Last updated: January 16, 2026
        </ThemedText>

        <Section title="Introduction">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            Welcome to Vasuli. We are committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application.
          </ThemedText>
        </Section>

        <Section title="Information We Collect">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            We collect information that you provide directly to us, including:
          </ThemedText>
          <BulletPoint text="Account information (name, email address, phone number)" color={colors.textSecondary} />
          <BulletPoint text="Profile information (profile picture, display name)" color={colors.textSecondary} />
          <BulletPoint text="Expense and transaction data you enter into the app" color={colors.textSecondary} />
          <BulletPoint text="Group and friend information you create or join" color={colors.textSecondary} />
          <BulletPoint text="Device information and usage data" color={colors.textSecondary} />
        </Section>

        <Section title="How We Use Your Information">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            We use the information we collect to:
          </ThemedText>
          <BulletPoint text="Provide, maintain, and improve our services" color={colors.textSecondary} />
          <BulletPoint text="Process and track shared expenses between users" color={colors.textSecondary} />
          <BulletPoint text="Send you notifications about expense activities" color={colors.textSecondary} />
          <BulletPoint text="Respond to your comments, questions, and requests" color={colors.textSecondary} />
          <BulletPoint text="Monitor and analyze trends, usage, and activities" color={colors.textSecondary} />
          <BulletPoint text="Detect, investigate, and prevent fraudulent transactions" color={colors.textSecondary} />
        </Section>

        <Section title="Data Storage and Security">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            Your data is stored securely in the cloud using Supabase, our backend service provider. Supabase employs industry-standard security measures including encrypted data transmission, secure PostgreSQL database storage, and regular security audits.
          </ThemedText>
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            Session data is stored locally on your device using secure encrypted storage to keep you logged in between app sessions.
          </ThemedText>
        </Section>

        <Section title="Information Sharing">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:
          </ThemedText>
          <BulletPoint text="With other users you choose to share expenses with" color={colors.textSecondary} />
          <BulletPoint text="With service providers who assist in our operations" color={colors.textSecondary} />
          <BulletPoint text="If required by law or to protect our rights" color={colors.textSecondary} />
          <BulletPoint text="In connection with a merger or acquisition" color={colors.textSecondary} />
        </Section>

        <Section title="Your Rights">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            You have the right to:
          </ThemedText>
          <BulletPoint text="Access and update your personal information" color={colors.textSecondary} />
          <BulletPoint text="Delete your account and associated data" color={colors.textSecondary} />
          <BulletPoint text="Opt out of promotional communications" color={colors.textSecondary} />
          <BulletPoint text="Request a copy of your data" color={colors.textSecondary} />
        </Section>

        <Section title="Children's Privacy">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            Our service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.
          </ThemedText>
        </Section>

        <Section title="Changes to This Policy">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the last updated date.
          </ThemedText>
        </Section>

        <Section title="Contact Us">
          <ThemedText style={[styles.paragraph, { color: colors.textSecondary }]}>
            If you have any questions about this Privacy Policy, please contact us at:
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
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
