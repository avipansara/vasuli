import { ThemedText } from '@/components/themed-text';
import { ThemedButton } from '@/components/ui/themed-button';
import { ThemedInput } from '@/components/ui/themed-input';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { submitFeedback, type FeedbackCategory } from '@/services/feedback-service';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';

const categories: { value: FeedbackCategory; label: string }[] = [
  { value: 'problem', label: 'Problem' }, { value: 'idea', label: 'Idea' }, { value: 'question', label: 'Question' },
];

export function FeedbackForm() {
  const { colors } = useThemeColors();
  const [category, setCategory] = useState<FeedbackCategory>('problem');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [screenshot, setScreenshot] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submissionId, setSubmissionId] = useState(() => Crypto.randomUUID());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const changed = () => { setSubmissionId(Crypto.randomUUID()); setError(''); };

  const pickScreenshot = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64 || asset.base64.length > 2800000 || !['image/jpeg', 'image/png'].includes(asset.mimeType ?? '')) {
        setError('Choose a JPEG or PNG screenshot under 2 MB.');
        return;
      }
      changed(); setScreenshot(asset);
    } catch {
      setError('Could not open your photos. Please try again.');
    }
  };

  const send = async () => {
    if (!message.trim()) { setError('Please enter a message.'); return; }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid reply email address.'); return; }
    setBusy(true); setError('');
    try {
      await submitFeedback({ id: submissionId, category, message: message.trim(), replyEmail: email.trim(), platform: Platform.OS, appVersion: Application.nativeApplicationVersion ?? 'unknown', screenshot: screenshot?.base64 ?? undefined, screenshotType: screenshot?.mimeType ?? undefined });
      setSent(true);
    } catch {
      setError('Could not send your feedback. Please check your connection and try again. Your message is still here.');
    } finally { setBusy(false); }
  };

  if (sent) return <View style={{ gap: 12 }}><ThemedText type="defaultSemiBold">Thanks for sharing your feedback.</ThemedText><ThemedText>We received your message.</ThemedText><ThemedButton label="Send more feedback" variant="secondary" onPress={() => { setMessage(''); setEmail(''); setScreenshot(null); setCategory('problem'); changed(); setSent(false); }} /></View>;

  return <View style={{ gap: 12 }}>
    <ThemedText>What would you like to share?</ThemedText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {categories.map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: category === item.value, disabled: busy }} disabled={busy} onPress={() => { changed(); setCategory(item.value); }} style={{ borderWidth: 1, borderColor: category === item.value ? colors.tint : colors.border, backgroundColor: category === item.value ? colors.tint : colors.card, borderRadius: 12, paddingHorizontal: 16, minHeight: 48, justifyContent: 'center' }}><ThemedText style={{ color: category === item.value ? colors.card : colors.text }}>{item.label}</ThemedText></Pressable>)}
    </View>
    <ThemedText type="defaultSemiBold">Message</ThemedText>
    <ThemedInput accessibilityLabel="Feedback message" placeholder="Tell us what happened or share your idea" multiline maxLength={5000} value={message} editable={!busy} onChangeText={value => { changed(); setMessage(value); }} style={{ minHeight: 120, textAlignVertical: 'top', paddingVertical: 12 }} />
    <ThemedText type="defaultSemiBold">Reply email (optional)</ThemedText>
    <ThemedInput accessibilityLabel="Reply email, optional" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} editable={!busy} onChangeText={value => { changed(); setEmail(value); }} />
    <ThemedText type="defaultSemiBold">Screenshot (optional)</ThemedText>
    <ThemedText style={{ color: colors.textSecondary }}>Screenshots may include personal or expense information. Check yours before sharing it.</ThemedText>
    {screenshot && <Image source={{ uri: screenshot.uri }} accessibilityLabel="Selected screenshot" style={{ width: 120, height: 120, borderRadius: 12 }} resizeMode="contain" />}
    <ThemedButton label={screenshot ? 'Change screenshot' : 'Choose screenshot'} variant="secondary" disabled={busy} onPress={() => void pickScreenshot()} />
    {screenshot && <ThemedButton label="Remove screenshot" variant="secondary" disabled={busy} onPress={() => { changed(); setScreenshot(null); }} />}
    <ThemedText style={{ color: colors.textSecondary }}>We send your feedback, platform, and app version. Your message is emailed to the team. Database records are deleted after one year; emails may be kept longer.</ThemedText>
    {!!error && <ThemedText accessibilityLiveRegion="polite" style={{ color: colors.text }}>{error}</ThemedText>}
    <ThemedButton label="Send feedback" loading={busy} onPress={() => void send()} />
  </View>;
}
