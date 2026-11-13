import { feedbackEmail } from '../_shared/feedback-email.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const resend = Deno.env.get('RESEND_API_KEY') ?? '';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
const adminHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

export async function handleFeedback(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  try {
    const auth = request.headers.get('Authorization') ?? '';
    const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
    if (!userResponse.ok) return reply(401, { error: 'Sign in required' });
    const user = await userResponse.json();
    const text = await request.text();
    if (text.length > 2900000) return reply(413, { error: 'Screenshot is too large' });
    const input = JSON.parse(text);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id ?? '') ||
        !['problem', 'idea', 'question'].includes(input.category) || typeof input.message !== 'string' || input.message.trim().length < 1 || input.message.length > 5000 ||
        !['ios', 'android', 'web'].includes(input.platform) || typeof input.appVersion !== 'string' || input.appVersion.length < 1 || input.appVersion.length > 80 ||
        (input.replyEmail && (typeof input.replyEmail !== 'string' || input.replyEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.replyEmail))) ||
        (input.screenshot && (typeof input.screenshot !== 'string' || input.screenshot.length > 2800000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.screenshot) || !['image/jpeg', 'image/png'].includes(input.screenshotType) || (input.screenshotType === 'image/png' && !input.screenshot.startsWith('iVBORw0KGgo')) || (input.screenshotType === 'image/jpeg' && !input.screenshot.startsWith('/9j/'))))) {
      return reply(400, { error: 'Invalid feedback' });
    }
    const existing = await fetch(`${url}/rest/v1/feedback_submissions?id=eq.${input.id}&select=id`, { headers: adminHeaders });
    if (!existing.ok) throw new Error('Feedback lookup failed');
    if ((await existing.json()).length) return reply(200, { success: true });
    const limit = await fetch(`${url}/rest/v1/rpc/reserve_feedback_submission`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ p_user_id: user.id }) });
    if (!limit.ok) throw new Error('Rate limit check failed');
    if (!(await limit.json())) return reply(429, { error: 'Too many submissions. Try again later.' });
    const saved = await fetch(`${url}/rest/v1/feedback_submissions`, { method: 'POST', headers: { ...adminHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ id: input.id, category: input.category, message: input.message.trim(), reply_email: input.replyEmail?.trim() || null, platform: input.platform, app_version: input.appVersion, screenshot_base64: input.screenshot || null, screenshot_type: input.screenshot ? input.screenshotType : null }) });
    if (!saved.ok) throw new Error('Feedback insert failed');
    if (resend) {
      const email = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resend}`, 'Idempotency-Key': `feedback/${input.id}` }, body: JSON.stringify(feedbackEmail({ id: input.id, category: input.category, message: input.message.trim() })) });
      if (email.ok) await fetch(`${url}/rest/v1/feedback_submissions?id=eq.${input.id}`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ notified_at: new Date().toISOString() }) });
      else console.error('Feedback notification failed', email.status);
    } else console.error('Feedback notification is not configured');
    return reply(200, { success: true });
  } catch (error) {
    console.error('Feedback submission failed', error instanceof Error ? error.message : 'unknown error');
    return reply(500, { error: 'Could not submit feedback' });
  }
}
