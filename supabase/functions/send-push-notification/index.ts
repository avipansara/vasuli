import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { buildExpoMessages, parsePushNotificationBody, readPushTickets, tokenBatches } from './push.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('RECURRING_EXPENSE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

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
    let accepted = 0;
    let rejected = 0;
    let trackingFailures = 0;

    for (const batch of batches) {
      const messages = buildExpoMessages(batch, notification);
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      };
      if (expoAccessToken) headers.Authorization = `Bearer ${expoAccessToken}`;
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
      });

      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = { raw: text };
      }

      if (!res.ok) {
        console.error('Expo push API request failed:', res.status);
        return new Response(
          JSON.stringify({
            error: 'Expo push API request failed',
            status: res.status,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const tickets = readPushTickets(body, batch.length);
      if (!tickets) {
        console.error('Expo returned an invalid push ticket response');
        return new Response(JSON.stringify({ error: 'Invalid Expo push ticket response' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const acceptedTickets: { receipt_id: string; token: string }[] = [];
      const unregisteredTokens: string[] = [];
      for (const [index, ticket] of tickets.entries()) {
        if (ticket.status === 'ok') {
          accepted += 1;
          acceptedTickets.push({ receipt_id: ticket.id, token: batch[index] });
        } else {
          rejected += 1;
          if (ticket.code === 'DeviceNotRegistered') unregisteredTokens.push(batch[index]);
          console.warn('Expo push ticket rejected', { type: notification.type, code: ticket.code });
        }
      }
      if (unregisteredTokens.length) {
        try {
          if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing server configuration');
          const cleared = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/clear_unregistered_push_tokens`, {
            method: 'POST',
            headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_tokens: unregisteredTokens }),
          });
          if (!cleared.ok) throw new Error('Token cleanup failed');
        } catch {
          console.error('Could not clear unregistered push tokens');
        }
      }
      if (acceptedTickets.length) {
        try {
          if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing server configuration');
          const saved = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/record_push_receipts`, {
            method: 'POST',
            headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_tickets: acceptedTickets, p_type: notification.type }),
          });
          if (!saved.ok) throw new Error('Receipt storage failed');
        } catch {
          trackingFailures += acceptedTickets.length;
          console.error('Could not record push receipts', { type: notification.type, count: acceptedTickets.length });
        }
      }
    }

    return new Response(JSON.stringify({ success: rejected === 0 && trackingFailures === 0, accepted, rejected, trackingFailures }), {
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
