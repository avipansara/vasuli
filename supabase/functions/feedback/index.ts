import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleFeedback } from './handler.ts';

serve(handleFeedback);
