import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { buildExpoMessages, parsePushNotificationBody, tokenBatches } from './push.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[send-push-notification] request.start', {
      requestId,
      method: req.method,
      path: new URL(req.url).pathname,
    });

    const rawText = await req.text();
    if (!rawText.trim()) {
      console.warn('[send-push-notification] request.invalid_empty_body', { requestId });
      return new Response(JSON.stringify({ error: 'Request body is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(rawText) as unknown;
    } catch {
      console.warn('[send-push-notification] request.invalid_json', { requestId });
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = parsePushNotificationBody(rawBody);
    if (!parsed.ok) {
      if ('missing' in parsed) {
        console.warn('[send-push-notification] request.invalid_payload', {
          requestId,
          missing: parsed.missing,
        });
        return new Response(
          JSON.stringify({ error: 'Missing or invalid fields', missing: parsed.missing }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { tokens, notification } = parsed;
    const batches = tokenBatches(tokens);
    const receipts: unknown[] = [];
    console.log('[send-push-notification] request.validated', {
      requestId,
      type: notification.type,
      tokenCount: tokens.length,
      batchCount: batches.length,
      previewTokens: tokens.slice(0, 2),
    });

    for (const [index, batch] of batches.entries()) {
      const messages = buildExpoMessages(batch, notification);
      console.log('[send-push-notification] expo.batch_send', {
        requestId,
        batchIndex: index,
        batchSize: batch.length,
      });
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = { raw: text };
      }

      receipts.push({ status: res.status, body });
      console.log('[send-push-notification] expo.batch_result', {
        requestId,
        batchIndex: index,
        status: res.status,
      });

      if (!res.ok) {
        console.error('[send-push-notification] expo.batch_error', {
          requestId,
          batchIndex: index,
          status: res.status,
          detail: body,
        });
        return new Response(
          JSON.stringify({
            error: 'Expo push API request failed',
            status: res.status,
            detail: body,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    console.log('[send-push-notification] request.success', {
      requestId,
      receiptCount: receipts.length,
    });
    return new Response(JSON.stringify({ success: true, receipts }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[send-push-notification] request.unhandled_error', {
      requestId,
      error,
    });
    const message = error instanceof Error ? error.message : 'Request failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
