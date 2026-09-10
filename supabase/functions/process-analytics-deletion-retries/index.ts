import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { parseBatchSize, posthogDeleteUrl } from './retry.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const posthogPersonalApiKey = Deno.env.get('POSTHOG_PERSONAL_API_KEY') ?? '';
const posthogHost = Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com';
const posthogProjectIds = (Deno.env.get('POSTHOG_PROJECT_ID') ?? '')
  .split(',').map(value => value.trim()).filter(Boolean);
const batchSize = parseBatchSize(Deno.env.get('ANALYTICS_DELETION_RETRY_BATCH_SIZE'));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  // This worker is intended for a trusted scheduler only. Do not accept a
  // user JWT: the service-role secret is never exposed to the mobile client.
  if (!supabaseServiceRoleKey || req.headers.get('Authorization') !== `Bearer ${supabaseServiceRoleKey}`) {
    return jsonResponse({ error: 'Authorization required' }, 401);
  }
  if (!supabaseUrl || !posthogPersonalApiKey || posthogProjectIds.length === 0) {
    console.error('process-analytics-deletion-retries is missing server configuration');
    return jsonResponse({ error: 'Retry processor is not configured' }, 500);
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: rows, error: readError } = await adminClient
    .from('analytics_deletion_retries')
    .select('distinct_id, attempt_count')
    .order('last_attempt_at', { ascending: true })
    .limit(batchSize);
  if (readError) {
    console.error('analytics deletion retry read failed:', readError);
    return jsonResponse({ error: 'Retry processor failed' }, 500);
  }

  let deleted = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const distinctId = typeof row.distinct_id === 'string' ? row.distinct_id : '';
    if (!distinctId) continue;
    let succeeded = true;
    let failureMessage = 'PostHog deletion failed';
    try {
      for (const projectId of posthogProjectIds) {
        const response = await fetch(posthogDeleteUrl(posthogHost, projectId), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${posthogPersonalApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ distinct_ids: [distinctId], delete_events: true, delete_recordings: false }),
        });
        if (!response.ok) {
          succeeded = false;
          failureMessage = `PostHog returned ${response.status}`;
          break;
        }
      }
    } catch {
      succeeded = false;
    }

    if (succeeded) {
      const { error } = await adminClient.from('analytics_deletion_retries').delete().eq('distinct_id', distinctId);
      if (error) console.error('analytics deletion retry row cleanup failed:', error);
      else deleted += 1;
    } else {
      failed += 1;
      const { error } = await adminClient.from('analytics_deletion_retries').update({
        attempt_count: (typeof row.attempt_count === 'number' ? row.attempt_count : 0) + 1,
        last_attempt_at: new Date().toISOString(),
        last_error: failureMessage,
      }).eq('distinct_id', distinctId);
      if (error) console.error('analytics deletion retry metadata update failed:', error);
    }
  }

  return jsonResponse({ processed: (rows ?? []).length, deleted, failed }, 200);
});
