/**
 * Ambient types for Supabase Edge Functions (Deno) when the workspace TypeScript
 * project is not the Deno language server. Keeps Expo `tsc` excluded from this
 * folder via root tsconfig exclude; this file satisfies the TS server here.
 */
declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
  }
}

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (request: Request) => Response | Promise<Response>
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  interface SupabaseAuth {
    getUser(): Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: Error | null;
    }>;
    signInWithPassword(credentials: {
      email?: string;
      password?: string;
    }): Promise<{
      data: {
        user: { id: string; email?: string | null; user_metadata?: Record<string, any> } | null;
        session: { access_token: string; refresh_token: string; user: any } | null;
      };
      error: Error | null;
    }>;
    admin: {
      deleteUser(id: string): Promise<{ error: Error | null }>;
    };
  }

  interface SupabaseClient {
    auth: SupabaseAuth;
    rpc(name: string, args: Record<string, unknown>): Promise<{ error: Error | null }>;
  }

  export function createClient(
    url: string,
    key: string,
    options?: Record<string, unknown>,
  ): SupabaseClient;
}
