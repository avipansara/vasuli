import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleRecurringExpenseRequest } from './worker.ts';

serve((request: Request) => handleRecurringExpenseRequest(request, {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  batchSize: Number(Deno.env.get('RECURRING_EXPENSE_BATCH_SIZE')) || undefined,
  expoAccessToken: Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined,
}));
