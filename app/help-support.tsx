import { ThemedText } from '@/components/themed-text';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { NavigationHeader } from '@/components/ui/screen-header';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

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
    answer: 'Tap the "+" button on the Expenses tab or use the "Add Expense" button on a friend or group detail screen. Enter the amount, description, and select who to split with.',
  },
  {
    question: 'How do I settle up with a friend?',
    answer: 'Go to the friend\'s detail page and tap "Settle Up". Enter the amount being paid and confirm the settlement. This will update both your balances.',
  },
  {
    question: 'Can I edit or delete an expense?',
    answer: 'Yes! On the Expenses screen, swipe left on any expense to edit it, or swipe right to delete it. All changes are recorded in your activity history.',
  },
  {
    question: 'How do groups work?',
    answer: 'Groups let you track shared expenses with multiple people. Create a group, add members, and any expense added to the group will be split among all members.',
  },
  {
    question: 'How are expenses split?',
    answer: 'By default, expenses are split equally. You can also choose unequal splits, percentage-based splits, or share-based splits when adding an expense.',
  },
  {
    question: 'What happens when I delete my account?',
    answer: 'Deleting your account will remove all your personal data. However, shared expenses and settlements will remain visible to other users involved in those transactions.',
  },
  {
    question: 'How do I invite friends?',
    answer: 'Go to Profile > Invite a Friend. You can send an invitation via email or share a link. Once they join, you can start splitting expenses together.',
  },
  {
    question: 'Is my data secure?',
    answer: 'Yes! We use industry-standard encryption to protect your data. Your financial information is never shared with third parties.',
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
    description: 'Record payments between friends to clear balances. The app calculates the simplest way to settle.',
  },
  {
    icon: 'clock.fill',
    title: 'Activity History',
    description: 'View all your expense history, settlements, and changes in one place.',
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

  const toggleFAQ = (index: number) => {
    setExpandedFAQ(expandedFAQ === index ? null : index);
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@split-space.com?subject=Help%20Request');
  };

  return (
    <LinearGradient colors={gradients.screenBackground} style={styles.container}>
      <NavigationHeader title="Help & Support" onBack={() => router.back()} />
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

        {/* Contact Support Section */}
        <View style={styles.section}>
          <View style={[
            styles.contactCard,
            { 
              backgroundColor: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(34, 197, 94, 0.1)',
              borderColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            }
          ]}>
            <View style={[
              styles.contactIcon,
              { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.15)' }
            ]}>
              <IconSymbol name="envelope.fill" size={28} color={isDark ? '#2DD4BF' : colors.tint} />
            </View>
            <ThemedText type="subtitle" style={[styles.contactTitle, !isDark && { color: colors.text }]}>
              Still need help?
            </ThemedText>
            <ThemedText style={[styles.contactDescription, !isDark && { color: colors.textSecondary }]}>
              Our support team is here to help you with any questions or issues.
            </ThemedText>
            <Pressable 
              style={[styles.contactButton, { borderColor: isDark ? '#2DD4BF' : colors.tint }]}
              onPress={handleContactSupport}
            >
              <ThemedText style={[styles.contactButtonText, { color: isDark ? '#2DD4BF' : colors.tint }]}>
                Contact Support
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </ScrollView>
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
    alignItems: 'center',
  },
  contactIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  contactTitle: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 8,
  },
  contactDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  contactButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1.5,
  },
  contactButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
