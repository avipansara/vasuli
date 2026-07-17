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

  /**
   * Delete user account with data anonymization.
   * - Anonymizes user record (keeps ID so expense/settlement references still work)
   * - Deletes friendships, group memberships, invitations, and activities
   * - The user ID remains in the database with name "Deleted User" for reference integrity
   */
  async delete(id: string): Promise<void> {
    // 1. Delete activities created by the user (these are just logs)
    const { error: activityDeleteError } = await supabase
      .from('activities')
      .delete()
      .eq('user_id', id);

    if (activityDeleteError) console.error('Error deleting activities:', activityDeleteError);

    // 2. Delete all friendships involving this user
    const { error: friendshipError } = await supabase
      .from('friendships')
      .delete()
      .or(`user_id.eq.${id},friend_id.eq.${id}`);

    if (friendshipError) console.error('Error deleting friendships:', friendshipError);

    // 3. Delete all group memberships (remove from all groups)
    const { error: membershipError } = await supabase
      .from('group_members')
      .delete()
      .eq('user_id', id);

    if (membershipError) console.error('Error deleting group memberships:', membershipError);

    // 4. Delete invitations sent by or to this user
    const { error: invitationError } = await supabase
      .from('invitations')
      .delete()
      .or(`inviter_id.eq.${id},invitee_email.eq.${id}`);

    if (invitationError) console.error('Error deleting invitations:', invitationError);

    // 5. Anonymize the user record instead of deleting it
    // This keeps the user ID in the database so expense/settlement references still work
    // When displaying expenses, the app will show "Deleted User" as the name
    const { error: anonymizeError } = await supabase
      .from('users')
      .update({
        name: 'Deleted User',
        email: null,
        phone: null,
        avatar: null,
        push_token: null,
        is_active: false,
      })
      .eq('id', id);

    if (anonymizeError) {
      console.error('Error anonymizing user:', anonymizeError);
      throw anonymizeError;
    }

    // NOTE: We do NOT delete the user record - we keep it anonymized
    // so that expense.paid_by and expense_splits.user_id references still work
    // and display "Deleted User" instead of breaking the app
  },

  async updatePushToken(userId: string, pushToken: string | null): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ push_token: pushToken })
      .eq('id', userId);
    if (error) throw error;
  }
};
