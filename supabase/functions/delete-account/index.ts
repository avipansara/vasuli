import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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
      console.error('delete-account database cleanup failed:', cleanupError);
      return jsonResponse({ error: 'Account cleanup failed' }, 500);
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
