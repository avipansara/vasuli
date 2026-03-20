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
