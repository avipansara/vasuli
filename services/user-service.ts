import { supabase } from '@/lib/supabase';
import type { User } from '@/types/database';
import { normalizeEmail } from '@/utils/validation';

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

    return {
      id: data.id,
      name: data.name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      avatar: data.avatar || undefined,
      pushToken: data.push_token || undefined,
      isActive: data.is_active ?? true,
      createdAt: new Date(data.created_at).getTime(),
    };
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

    return {
      id: data.id,
      name: data.name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      avatar: data.avatar || undefined,
      pushToken: data.push_token || undefined,
      isActive: data.is_active ?? true,
      createdAt: new Date(data.created_at).getTime(),
    };
  },

  async getByIds(ids: string[]): Promise<User[]> {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (uniqueIds.length === 0) return [];

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .in('id', uniqueIds);

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      name: r.name,
      email: r.email || undefined,
      phone: r.phone || undefined,
      avatar: r.avatar || undefined,
      pushToken: r.push_token || undefined,
      isActive: r.is_active ?? true,
      createdAt: new Date(r.created_at).getTime(),
    }));
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

    return {
      id: data.id,
      name: data.name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      avatar: data.avatar || undefined,
      pushToken: data.push_token || undefined,
      isActive: data.is_active ?? true,
      createdAt: new Date(data.created_at).getTime(),
    };
  },

  async getAll(): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('name');

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      name: r.name,
      email: r.email || undefined,
      phone: r.phone || undefined,
      avatar: r.avatar || undefined,
      pushToken: r.push_token || undefined,
      isActive: r.is_active ?? true,
      createdAt: new Date(r.created_at).getTime(),
    }));
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

    return (data || []).map(r => ({
      id: r.id,
      name: r.name,
      email: r.email || undefined,
      phone: r.phone || undefined,
      avatar: r.avatar || undefined,
      pushToken: r.push_token || undefined,
      isActive: r.is_active ?? true,
      createdAt: new Date(r.created_at).getTime(),
    }));
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
    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: {},
    });

    if (error) {
      let parsedData: { message?: string; error?: string } | null = null;

      if (error.context instanceof Response) {
        try {
          parsedData = await error.context.clone().json() as { message?: string; error?: string };
        } catch {
          parsedData = null;
        }
      }

      throw new Error(parsedData?.message || error.message || 'Failed to delete account');
    }
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw new Error('message' in data && data.message ? String(data.message) : String(data.error));
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
