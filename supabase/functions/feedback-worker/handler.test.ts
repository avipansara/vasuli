import { expect, it, vi } from 'vitest';

it('emails the stored message when retrying a failed notification', async () => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => ({ SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'service', RESEND_API_KEY: 'resend' })[key] } });
  const { handleFeedbackWorker } = await import('./handler');
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes('notified_at=is.null&select=')) return Response.json([{ id: 'id-1', category: 'idea', message: 'Add a dark theme' }]);
    return new Response(null, { status: 200 });
  }));
  const response = await handleFeedbackWorker(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer service' } }));
  expect(response.status).toBe(200);
  const query = calls.find(call => call.url.includes('select='));
  expect(query?.url).toContain('message');
  expect(query?.url).not.toContain('screenshot');
  const email = JSON.parse(calls.find(call => call.url === 'https://api.resend.com/emails')?.init?.body as string);
  expect(email.to).toEqual(['support@split-space.com', 'varun.y.n@gmail.com']);
  expect(email.text).toContain('Add a dark theme');
  expect(email).not.toHaveProperty('attachments');
  vi.unstubAllGlobals();
});
