import { FeedbackForm } from '@/components/feedback-form';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

interface FAQItem {
  question: string;
  answer: string;
}

interface UsageItem {
  icon: IconSymbolName;
  title: string;
  description: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'How do I add an expense?',
    answer: 'Tap Add Expense, or open a friend or group and add an expense there. Enter a description and amount, then choose how to split it.',
  },
  {
    question: 'How do I settle up with a friend?',
    answer: 'Go to the friend\'s detail page and tap "Settle Up". Enter the amount being paid and confirm the settlement. This will update both your balances.',
  },
  {
    question: 'Can I edit or delete an expense?',
    answer: 'On a friend’s detail screen, swipe right on an eligible expense to edit it, or swipe left to delete it. You can edit or delete expenses you created or paid for.',
  },
  {
    question: 'How do groups work?',
    answer: 'Groups help you track shared expenses with multiple people. Create a group, add members, and choose how to split group expenses.',
  },
  {
    question: 'How are expenses split?',
    answer: 'By default, expenses are split equally. You can also choose unequal splits, percentage-based splits, or share-based splits when adding an expense.',
  },
  {
    question: 'What happens when I delete my account?',
    answer: 'Settle all outstanding balances before deleting your account. Your friendships and group memberships are removed, while shared financial records may remain with your identity shown as Deleted User. Feedback has a separate retention period.',
  },
  {
    question: 'How do I invite friends?',
    answer: 'Go to Profile > Invite a Friend. Find an existing user by email, share an invite link, or use a QR code to connect.',
  },
  {
    question: 'Is my data secure?',
    answer: 'Vasuli uses Supabase to store app data and protect it in transit. Service providers help operate the app. See the Privacy Policy for details.',
  },
];

const APP_USAGE_ITEMS: UsageItem[] = [
  {
    icon: 'dollarsign.circle.fill',
    title: 'Track Expenses',
    description: 'Add expenses and split them with friends or groups. Keep track of who owes what.',
  },
  {
    icon: 'person.2.fill',
    title: 'Manage Friends',
    description: 'Add friends, view shared expenses, and settle up when you\'re ready.',
  },
  {
    icon: 'person.3.fill',
    title: 'Create Groups',
    description: 'Perfect for trips, roommates, or any shared expenses. Everyone in the group can add expenses.',
  },
  {
    icon: 'arrow.left.arrow.right',
    title: 'Settle Up',
    description: 'Record payments between friends after the payment has been made to update your balances.',
  },
  {
    icon: 'clock.fill',
    title: 'Activity History',
    description: 'See recent expenses, settlements, and other activity in one place.',
  },
  {
    icon: 'bell.fill',
    title: 'Stay Updated',
    description: 'Get notified when friends add expenses or when someone settles up with you.',
  },
];

export default function HelpSupportScreen() {
  const { gradients, colors, isDark } = useThemeColors();
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
  const [emailError, setEmailError] = useState(false);

  const toggleFAQ = (index: number) => {
    setExpandedFAQ(expandedFAQ === index ? null : index);
  };

  const handleContactSupport = async (subject: string, body: string) => {
    setEmailError(false);
    try {
      await Linking.openURL(`mailto:support@split-space.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    } catch {
      setEmailError(true);
    }
  };

  return (
    <LinearGradient colors={gradients.screenBackground} style={styles.container}>
      <NavigationHeader title="Help & Support" onBack={() => router.back()} />
      
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.section, styles.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText type="subtitle" style={{ color: colors.text }}>Send feedback</ThemedText>
          <FeedbackForm />
          <ThemedText style={[styles.contactDescription, { color: colors.textSecondary }]}>
            You can also contact us by email.
          </ThemedText>
          <Pressable accessibilityRole="button" onPress={() => void handleContactSupport('Help request', 'How can we help?\n\n')} style={[styles.contactButton, { borderColor: colors.border }]}>
            <ThemedText style={[styles.contactButtonText, { color: colors.tint }]}>Email support</ThemedText>
          </Pressable>
          {emailError && (
            <ThemedText accessibilityLiveRegion="polite" style={[styles.contactDescription, { color: colors.text }]}>
              Couldn’t open an email app. Send your message to the address below instead.
            </ThemedText>
          )}
          <ThemedText selectable style={[styles.contactDescription, { color: colors.textSecondary }]}>
            support@split-space.com
          </ThemedText>
        </View>

        {/* App Usage Section */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, !isDark && { color: colors.text }]}>
            How to Use the App
          </ThemedText>
          <ThemedText style={[styles.sectionDescription, !isDark && { color: colors.textSecondary }]}>
            Get started with these key features
          </ThemedText>
          
          <View style={styles.usageGrid}>
            {APP_USAGE_ITEMS.map((item, index) => (
              <View 
                key={index}
                style={[
                  styles.usageCard,
                  { 
                    backgroundColor: isDark ? 'rgba(20, 35, 38, 0.6)' : colors.card,
                    borderColor: isDark ? 'rgba(45, 212, 191, 0.1)' : colors.border,
                  }
                ]}
              >
                <View style={[
                  styles.usageIcon,
                  { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }
                ]}>
                  <IconSymbol name={item.icon} size={24} color={isDark ? '#2DD4BF' : colors.tint} />
                </View>
                <ThemedText type="defaultSemiBold" style={[styles.usageTitle, !isDark && { color: colors.text }]}>
                  {item.title}
                </ThemedText>
                <ThemedText style={[styles.usageDescription, !isDark && { color: colors.textSecondary }]}>
                  {item.description}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>

        {/* FAQs Section */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={[styles.sectionTitle, !isDark && { color: colors.text }]}>
            Frequently Asked Questions
          </ThemedText>
          <ThemedText style={[styles.sectionDescription, !isDark && { color: colors.textSecondary }]}>
            Find answers to common questions
          </ThemedText>
          
          <View style={styles.faqList}>
            {FAQ_ITEMS.map((item, index) => (
              <Pressable
                key={index}
                onPress={() => toggleFAQ(index)}
                style={[
                  styles.faqItem,
                  { 
                    backgroundColor: isDark ? 'rgba(20, 35, 38, 0.6)' : colors.card,
                    borderColor: isDark ? 'rgba(45, 212, 191, 0.1)' : colors.border,
                  }
                ]}
              >
                <View style={styles.faqHeader}>
                  <ThemedText type="defaultSemiBold" style={[styles.faqQuestion, !isDark && { color: colors.text }]}>
                    {item.question}
                  </ThemedText>
                  <IconSymbol 
                    name={expandedFAQ === index ? 'chevron.up' : 'chevron.down'} 
                    size={16} 
                    color={isDark ? 'rgba(255,255,255,0.4)' : colors.textSecondary} 
                  />
                </View>
                {expandedFAQ === index && (
                  <ThemedText style={[styles.faqAnswer, !isDark && { color: colors.textSecondary }]}>
                    {item.answer}
                  </ThemedText>
                )}
              </Pressable>
            ))}
          </View>
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
  scrollContent: {
    padding: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    color: '#fff',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 16,
  },
  usageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  usageCard: {
    width: '48%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  usageIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  usageTitle: {
    fontSize: 15,
    color: '#fff',
    marginBottom: 4,
  },
  usageDescription: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
  },
  faqList: {
    gap: 8,
  },
  faqItem: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
    marginRight: 12,
  },
  faqAnswer: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
    lineHeight: 20,
  },
  contactCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'stretch',
    gap: 10,
  },
  contactDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'left',
    marginBottom: 0,
    lineHeight: 20,
  },
  contactButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  contactButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
