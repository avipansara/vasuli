import type { StoreRelease } from '@/lib/app-update';

type ReleaseRow = {
  id: string;
  version: string;
  minimum_supported_version: string;
  store_url: string;
  title: string;
  notes: string[];
};

type AppUpdateSupabase = {
  from(table: string): unknown;
};

type AppUpdateSupabaseQuery = {
  eq(column: string, value: string | boolean): AppUpdateSupabaseQuery;
  order(column: string, options: { ascending: boolean }): AppUpdateSupabaseQuery;
  limit(count: number): AppUpdateSupabaseQuery;
  maybeSingle(): Promise<{ data: ReleaseRow | null; error: Error | null }>;
};

export function createAppUpdateService({ supabase }: { supabase: AppUpdateSupabase }) {
  return {
    async getActiveRelease(platform: 'ios' | 'android', channel = 'production'): Promise<StoreRelease | null> {
      const query = supabase.from('app_releases') as {
        select(columns: string): AppUpdateSupabaseQuery;
      };
      const { data, error } = await query
        .select('id, version, minimum_supported_version, store_url, title, notes')
        .eq('platform', platform)
        .eq('channel', channel)
        .eq('is_active', true)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        version: data.version,
        minimumSupportedVersion: data.minimum_supported_version,
        storeUrl: data.store_url,
        title: data.title,
        notes: data.notes,
      };
    },
  };
}
