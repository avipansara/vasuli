CREATE TABLE public.app_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  channel TEXT NOT NULL DEFAULT 'production',
  version TEXT NOT NULL,
  minimum_supported_version TEXT NOT NULL,
  store_url TEXT NOT NULL,
  title TEXT NOT NULL,
  notes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(notes) = 'array'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX app_releases_active_lookup_idx
  ON public.app_releases (platform, channel, is_active, published_at DESC);

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active app releases"
  ON public.app_releases
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
  );

REVOKE INSERT, UPDATE, DELETE ON public.app_releases FROM anon, authenticated;
GRANT SELECT ON public.app_releases TO anon, authenticated;
