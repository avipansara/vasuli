import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

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

  try {
    const { email: rawEmail, code, action } = await req.json();
    
    if (!rawEmail) {
      return jsonResponse({ error: 'Email is required' }, 400);
    }
    
    const email = rawEmail.trim().toLowerCase();
    
    // Retrieve environment variables
    const appReviewerEmail = (Deno.env.get('APP_REVIEWER_EMAIL') ?? '').trim().toLowerCase();
    const testAccountEmail1 = (Deno.env.get('TEST_ACCOUNT_EMAIL') ?? '').trim().toLowerCase();
    const testAccountEmail2 = (Deno.env.get('TEST_ACCOUNT_2_EMAIL') ?? '').trim().toLowerCase();
    
    const appReviewerOtp = Deno.env.get('APP_REVIEWER_OTP') ?? '';
    const testAccountOtp = Deno.env.get('TEST_ACCOUNT_OTP') ?? '';
    
    const appReviewerPassword = Deno.env.get('APP_REVIEWER_PASSWORD') ?? appReviewerOtp;
    const testAccountPassword = Deno.env.get('TEST_ACCOUNT_PASSWORD') ?? testAccountOtp;
    
    const isReviewer = appReviewerEmail && email === appReviewerEmail;
    const isTest1 = testAccountEmail1 && email === testAccountEmail1;
    const isTest2 = testAccountEmail2 && email === testAccountEmail2;
    const isTestAccount = isReviewer || isTest1 || isTest2;
    
    if (!isTestAccount) {
      // Not a test account, let the client proceed with standard OTP
      return jsonResponse({ success: true, isTestAccount: false }, 200);
    }
    
    if (action === 'send') {
      // For test accounts, skip sending real OTP code since they use a static code
      return jsonResponse({ success: true, isTestAccount: true }, 200);
    }
    
    if (action === 'verify') {
      if (!code) {
        return jsonResponse({ error: 'Code is required for verification' }, 400);
      }
      
      // Verify OTP code
      const expectedOtp = isReviewer ? appReviewerOtp : testAccountOtp;
      if (!expectedOtp || code !== expectedOtp) {
        return jsonResponse({
          success: false,
          isTestAccount: true,
          error: 'Invalid verification code. Use test account credentials.',
        }, 400);
      }
      
      // Sign in to Supabase Auth using password
      const password = isReviewer ? appReviewerPassword : testAccountPassword;
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error || !data.session) {
        console.error(`Supabase sign-in failed for test user ${email}:`, error);
        return jsonResponse({
          success: false,
          isTestAccount: true,
          error: error?.message || 'Test account is not configured in Supabase Auth',
        }, 400);
      }
      
      return jsonResponse({
        success: true,
        isTestAccount: true,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user: data.session.user,
        },
      }, 200);
    }
    
    return jsonResponse({ error: 'Invalid action parameter' }, 400);
    
  } catch (error: any) {
    console.error('Error in verify-test-otp edge function:', error);
    return jsonResponse({ error: error.message || 'Verification failed' }, 500);
  }
});
