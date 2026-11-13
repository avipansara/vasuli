import { feedbackEmail } from '../_shared/feedback-email.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const resend = Deno.env.get('RESEND_API_KEY') ?? '';
const adminHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

export async function handleFeedbackWorker(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!service) return new Response('Not configured', { status: 500 });
  if (request.headers.get('Authorization') !== `Bearer ${service}`) {
    let wakeupId: unknown;
    try { wakeupId = (await request.json()).wakeupId; } catch { return new Response('Unauthorized', { status: 401 }); }
    if (typeof wakeupId !== 'string' || !/^[0-9a-f-]{36}$/i.test(wakeupId)) return new Response('Unauthorized', { status: 401 });
    const consumed = await fetch(`${url}/rest/v1/rpc/consume_feedback_worker_wakeup`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ p_wakeup_id: wakeupId }) });
    if (!consumed.ok || !(await consumed.json())) return new Response('Unauthorized', { status: 401 });
  }
  if (!resend) return new Response('Email is not configured', { status: 500 });
  try {
    const pending = await fetch(`${url}/rest/v1/feedback_submissions?notified_at=is.null&select=id,category,message&order=created_at.asc&limit=50`, { headers: adminHeaders });
    if (!pending.ok) throw new Error('Failed to load pending notifications');
    let failures = 0;
    for (const row of await pending.json()) {
      const email = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resend}`, 'Idempotency-Key': `feedback/${row.id}` }, body: JSON.stringify(feedbackEmail(row)) });
      if (!email.ok) { failures++; continue; }
      const updated = await fetch(`${url}/rest/v1/feedback_submissions?id=eq.${row.id}&notified_at=is.null`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ notified_at: new Date().toISOString() }) });
      if (!updated.ok) failures++;
    }
    return new Response(JSON.stringify({ failures }), { status: failures ? 500 : 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Feedback notification retry failed', error instanceof Error ? error.message : 'unknown error');
    return new Response('Retry failed', { status: 500 });
  }
}
