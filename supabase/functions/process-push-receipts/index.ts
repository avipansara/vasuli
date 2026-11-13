import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleReceiptRequest } from './worker.ts';

serve((request: Request) => handleReceiptRequest(request, {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  serviceRoleKey: Deno.env.get('RECURRING_EXPENSE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  schedulerKey: Deno.env.get('RECURRING_EXPENSE_SERVICE_ROLE_KEY') ?? undefined,
  expoAccessToken: Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined,
}));
