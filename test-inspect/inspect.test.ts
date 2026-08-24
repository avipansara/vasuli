import { describe, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

describe('inspect database', () => {
  it('inspects activities and settlements', async () => {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Let's sign in as the Apple Reviewer user to see what they see!
    const email = process.env.EXPO_PUBLIC_TEST_ACCOUNT_EMAIL || 'apple.reviewer@vasuli.app';
    const otp = process.env.EXPO_PUBLIC_TEST_ACCOUNT_OTP || '123456';

    const { data: authData, error: authError } = await supabase.auth.signInWithOtp({
      email,
    });
    console.log('SignIn OTP request:', { authData, authError });

    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    });
    console.log('SignIn OTP verify:', { success: !verifyError, error: verifyError?.message });

    if (verifyError) {
      console.log('Fallback: Querying without auth...');
    }

    const { data: users, error: usersError } = await supabase.from('users').select('id, name, email');
    console.log('Users in DB:', usersError || users);

    const currentUser = verifyData.user;
    if (currentUser) {
      console.log('Logged in user ID:', currentUser.id);

      // Fetch group memberships
      const { data: members } = await supabase.from('group_members').select('group_id').eq('user_id', currentUser.id);
      console.log('Group memberships:', members);

      // Fetch settlements
      const { data: settlements } = await supabase.from('settlements').select('*');
      console.log('All Settlements:', settlements);

      // Fetch expense splits
      const { data: splits } = await supabase.from('expense_splits').select('*');
      console.log('All splits:', splits);

      // Fetch activities
      const { data: activities, error: actError } = await supabase.from('activities').select('*');
      console.log('Activities returned:', actError || activities);
    }
  });
});
