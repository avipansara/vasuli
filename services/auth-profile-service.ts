import { supabase } from '@/lib/supabase';
import type { User } from '@/types/database';
import { getDisplayName, normalizeEmail } from '@/utils/validation';

type LinkAuthUserParams = {
  authUserId: string;
  email?: string;
  name?: string;
};

function mapUserRow(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email || undefined,
    phone: row.phone || undefined,
    avatar: row.avatar || undefined,
    pushToken: row.push_token || undefined,
    isActive: row.is_active ?? true,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function isMissingRow(error: any): boolean {
  return error?.code === 'PGRST116';
}

async function findProfileByEmail(email: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error && !isMissingRow(error)) throw error;
  return data;
}

async function attachAuthUserId(profileId: string, authUserId: string): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .update({ auth_user_id: authUserId })
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw error;
  return mapUserRow(data);
}

async function createProfile(params: Required<Pick<LinkAuthUserParams, 'authUserId'>> & {
  email?: string;
  name: string;
}): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      auth_user_id: params.authUserId,
      name: params.name,
      email: params.email || null,
      email_verified: !!params.email,
      phone_verified: false,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return mapUserRow(data);
}

export async function linkAuthUserToProfile(params: LinkAuthUserParams): Promise<User> {
  const email = normalizeEmail(params.email);

  if (!email) {
    throw new Error('Email is required to link an auth user');
  }

  const existingProfile = await findProfileByEmail(email);

  if (existingProfile) {
    if (existingProfile.auth_user_id === params.authUserId) {
      return mapUserRow(existingProfile);
    }

    return attachAuthUserId(existingProfile.id, params.authUserId);
  }

  return createProfile({
    authUserId: params.authUserId,
    email,
    name: getDisplayName(params.name, email),
  });
}
