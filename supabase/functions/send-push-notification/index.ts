import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { buildExpoMessages, parsePushNotificationBody, tokenBatches } from './push.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const parsed = parsePushNotificationBody(rawBody);
    if (!parsed.ok) {
      if ('missing' in parsed) {
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

    for (const batch of batches) {
      const messages = buildExpoMessages(batch, notification);
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

      if (!res.ok) {
        console.error('Expo push API error:', res.status, text);
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

    return new Response(JSON.stringify({ success: true, receipts }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('send-push-notification:', error);
    const message = error instanceof Error ? error.message : 'Request failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
