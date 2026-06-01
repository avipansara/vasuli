-- The app now uses Supabase Auth email OTP instead of the legacy custom OTP table.
-- Keep the table if it exists for audit/history, but remove client-access policies.
DO $$
BEGIN
  IF to_regclass('public.verification_codes') IS NOT NULL THEN
    ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.verification_codes FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Allow all operations on verification_codes" ON public.verification_codes;
    DROP POLICY IF EXISTS "Allow verification code creation" ON public.verification_codes;
    DROP POLICY IF EXISTS "Users can read own codes" ON public.verification_codes;
    DROP POLICY IF EXISTS "Allow code verification" ON public.verification_codes;

    REVOKE ALL ON TABLE public.verification_codes FROM anon;
    REVOKE ALL ON TABLE public.verification_codes FROM authenticated;
  END IF;
END $$;
