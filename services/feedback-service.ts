import { supabase } from '@/lib/supabase';

export type FeedbackCategory = 'problem' | 'idea' | 'question';
export interface FeedbackSubmission {
  id: string;
  category: FeedbackCategory;
  message: string;
  replyEmail: string;
  platform: string;
  appVersion: string;
  screenshot?: string;
  screenshotType?: string;
}

export async function submitFeedback(feedback: FeedbackSubmission): Promise<void> {
  const { data, error } = await supabase.functions.invoke('feedback', { body: feedback });
  if (error || !data?.success) throw new Error('Could not send feedback');
}
