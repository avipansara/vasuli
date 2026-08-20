import { supabase } from '@/lib/supabase';
import type { User } from '@/types/database';
import { normalizeEmail } from '@/utils/validation';
import { mapUserRow } from './database-row-mappers';

const OUTSTANDING_BALANCES_CODE = 'ACCOUNT_HAS_OUTSTANDING_BALANCES';
const OUTSTANDING_BALANCES_MESSAGE = 'Please settle all outstanding balances before deleting your account.';
const DELETE_ACCOUNT_FALLBACK_MESSAGE = 'We couldn\'t delete your account. Please try again or contact support.';

type JsonResponseLike = {
  clone?: () => JsonResponseLike;
  json?: () => Promise<unknown>;
};

async function readErrorPayload(response: unknown): Promise<Record<string, unknown> | null> {
  if (!response || typeof response !== 'object') return null;

  const responseLike = response as JsonResponseLike;
  const readable = typeof responseLike.clone === 'function' ? responseLike.clone() : responseLike;
  if (typeof readable.json !== 'function') return null;

  try {
    const payload = await readable.json();
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function getDeleteAccountErrorMessage(error: unknown, response?: unknown): Promise<string> {
  const context = error && typeof error === 'object' && 'context' in error
    ? (error as { context?: unknown }).context
    : undefined;
  const payload = await readErrorPayload(response) ?? await readErrorPayload(context);

  if (payload?.error === OUTSTANDING_BALANCES_CODE) {
    return typeof payload.message === 'string' && payload.message.trim()
      ? payload.message.trim()
      : OUTSTANDING_BALANCES_MESSAGE;
  }

  return DELETE_ACCOUNT_FALLBACK_MESSAGE;
}

export const userService = {
  async create(user: Omit<User, 'id' | 'createdAt'> & { id?: string }): Promise<User> {
    const createdAt = new Date().toISOString();

    const insertData: any = {
      name: user.name,
      email: user.email ? normalizeEmail(user.email) ?? null : null,
      phone: user.phone || null,
      avatar: user.avatar || null,
      created_at: createdAt,
      is_active: true,
    };

    if (user.id) {
      insertData.id = user.id;
    }

    const { data, error } = await supabase
      .from('users')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return mapUserRow(data);
  },

  async getById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return mapUserRow(data);
  },

  async getByIds(ids: string[]): Promise<User[]> {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (uniqueIds.length === 0) return [];

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .in('id', uniqueIds);

    if (error) throw error;

    return (data || []).map(mapUserRow);
  },

  async getByEmail(email: string): Promise<User | null> {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      // Email input is normalized client-side, but older/imported profiles may
      // retain casing. Postgres text equality is case-sensitive, so use an
      // exact case-insensitive match for identity lookup.
      .ilike('email', normalized)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return mapUserRow(data);
  },

  async getAll(): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('name');

    if (error) throw error;

    return (data || []).map(mapUserRow);
  },

  async getUserFriends(userId: string): Promise<User[]> {
    // Get friend IDs from friendships table
    const { data: friendships, error: friendshipsError } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .eq('status', 'accepted')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (friendshipsError) throw friendshipsError;

    // Extract friend IDs (the other person in each friendship)
    const friendIds = (friendships || []).map(f =>
      f.user_id === userId ? f.friend_id : f.user_id
    );

    if (friendIds.length === 0) {
      return [];
    }

    // Get user details for all friends
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .in('id', friendIds)
      .order('name');

    if (error) throw error;

    return (data || []).map(mapUserRow);
  },

  async update(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({
        name: updates.name,
        email:
          updates.email !== undefined
            ? updates.email
              ? normalizeEmail(updates.email) ?? null
              : null
            : undefined,
        phone: updates.phone,
        avatar: updates.avatar,
      })
      .eq('id', id);

    if (error) throw error;
  },

  async deleteAccount(): Promise<void> {
    const { data, error, response } = await supabase.functions.invoke('delete-account', {
      body: {},
    });

    if (error) {
      throw new Error(await getDeleteAccountErrorMessage(error, response));
    }
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      if (data.error === OUTSTANDING_BALANCES_CODE) {
        throw new Error('message' in data && typeof data.message === 'string' && data.message.trim()
          ? data.message.trim()
          : OUTSTANDING_BALANCES_MESSAGE);
      }
      throw new Error(DELETE_ACCOUNT_FALLBACK_MESSAGE);
    }
  },

  async updatePushToken(userId: string, pushToken: string | null): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ push_token: pushToken })
      .eq('id', userId);
    if (error) throw error;
  }
};
