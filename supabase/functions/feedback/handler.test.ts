import { beforeEach, describe, expect, it, vi } from 'vitest';

const handler = await (async () => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => ({ SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', RESEND_API_KEY: 'resend' })[key] } });
  return (await import('./handler')).handleFeedback;
})();
const payload = { id: '8a7a11d4-5057-44fa-a15d-8850ec9f7241', category: 'problem', message: 'Something broke', replyEmail: '', platform: 'ios', appVersion: '1.0' };
function request(body: object) { return new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer session' }, body: JSON.stringify(body) }); }

describe('feedback submission', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('stores feedback and emails the message to both maintainers without the screenshot', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user' });
      if (url.includes('?id=eq.') && (!init?.method || init.method === 'GET')) return Response.json([]);
      if (url.endsWith('/rpc/reserve_feedback_submission')) return Response.json(true);
      return new Response(null, { status: 200 });
    }));
    expect((await handler(request(payload))).status).toBe(200);
    const email = calls.find(call => call.url === 'https://api.resend.com/emails');
    const body = JSON.parse(email?.init?.body as string);
    expect(body.to).toEqual(['support@split-space.com', 'varun.y.n@gmail.com']);
    expect(body.text).toContain(payload.message);
    expect(body.subject).toContain(payload.category);
    expect(body).not.toHaveProperty('attachments');
    expect(calls.some(call => call.url.includes('notified_at') || call.init?.method === 'PATCH')).toBe(true);
  });
  it('rejects invalid feedback before saving it', async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 'user' }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await handler(request({ ...payload, message: ' ' }))).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('keeps successful storage even if the notification provider rejects delivery', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user' });
      if (url.includes('?id=eq.') && !init?.method) return Response.json([]);
      if (url.endsWith('/rpc/reserve_feedback_submission')) return Response.json(true);
      if (url.includes('api.resend.com')) return new Response(null, { status: 503 });
      return new Response(null, { status: 200 });
    }));
    expect((await handler(request(payload))).status).toBe(200);
  });
});
