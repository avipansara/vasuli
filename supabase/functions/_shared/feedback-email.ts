export function feedbackEmail(feedback: { id: string; category: string; message: string }) {
  return {
    from: 'Vasuli <support@split-space.com>',
    to: ['support@split-space.com', 'varun.y.n@gmail.com'],
    subject: `New Vasuli feedback: ${feedback.category}`,
    text: `Category: ${feedback.category}\n\nMessage:\n${feedback.message}\n\nFeedback ID: ${feedback.id}\nAny screenshot is available in Supabase.`,
  };
}
