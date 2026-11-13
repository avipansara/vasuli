const MAX_WAKEUP_BYTES = 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// These public endpoints accept a small nonce only; never buffer an unbounded body.
export async function readWakeupId(request: Request): Promise<string | null> {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && Number(contentLength) > MAX_WAKEUP_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_WAKEUP_BYTES) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body) || !('wakeupId' in body)) return null;
    return typeof body.wakeupId === 'string' && UUID.test(body.wakeupId) ? body.wakeupId : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
