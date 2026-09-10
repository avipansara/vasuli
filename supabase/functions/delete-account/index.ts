import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildDistinctIdInput, parseProjectIdList, posthogDeleteUrl } from './deletion.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const posthogPersonalApiKey = Deno.env.get('POSTHOG_PERSONAL_API_KEY') ?? '';
const posthogHost = Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com';
const posthogProjectIds = parseProjectIdList(Deno.env.get('POSTHOG_PROJECT_ID') ?? '');

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

async function deriveDistinctId(userUuid: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(buildDistinctIdInput(userUuid)),
  );
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function requestPostHogDeletion(distinctId: string): Promise<boolean> {
  if (!posthogPersonalApiKey || posthogProjectIds.length === 0) return false;
  for (const projectId of posthogProjectIds) {
    const response = await fetch(posthogDeleteUrl(posthogHost, projectId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${posthogPersonalApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ distinct_ids: [distinctId], delete_events: true, delete_recordings: false }),
    });
    if (!response.ok) return false;
  }
  return true;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Authorization required' }, 401);
  }

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    console.error('delete-account is missing Supabase server configuration');
    return jsonResponse({ error: 'Account deletion is not configured' }, 500);
  }

  try {
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData.user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: cleanupError } = await adminClient.rpc('delete_account_data', {
      target_auth_user_id: userData.user.id,
      target_email: userData.user.email ?? null,
    });

    if (cleanupError) {
      if (cleanupError.message.includes('ACCOUNT_HAS_OUTSTANDING_BALANCES')) {
        return jsonResponse({
          error: 'ACCOUNT_HAS_OUTSTANDING_BALANCES',
          message: 'Please settle all outstanding balances before deleting your account.',
        }, 409);
      }
      console.error('delete-account database cleanup failed:', cleanupError);
      return jsonResponse({ error: 'Account cleanup failed' }, 500);
    }

    // The balance/cleanup RPC has succeeded, so this account deletion is no
    // longer rejectable for outstanding balances. Delete analytics while the
    // request is still authenticated; outages are retained for server retry.
    const distinctId = await deriveDistinctId(userData.user.id);
    let analyticsDeleted = false;
    try {
      analyticsDeleted = await requestPostHogDeletion(distinctId);
    } catch (analyticsError) {
      console.error('delete-account PostHog deletion failed:', analyticsError);
    }
    if (!analyticsDeleted) {
      const { error: retryError } = await adminClient
        .from('analytics_deletion_retries')
        .upsert({ distinct_id: distinctId, last_attempt_at: new Date().toISOString() });
      if (retryError) console.error('delete-account analytics retry record failed:', retryError);
    }

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userData.user.id);
    if (deleteAuthError) {
      console.error('delete-account auth deletion failed:', deleteAuthError);
      return jsonResponse({ error: 'Account authentication deletion failed' }, 500);
    }

    return jsonResponse({ success: true }, 200);
  } catch (error: unknown) {
    console.error('delete-account:', error);
    return jsonResponse({ error: 'Account deletion failed' }, 500);
  }
});
