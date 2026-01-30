import { supabase } from '@/lib/supabase';

export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  status: 'pending' | 'accepted' | 'blocked';
  createdAt: number;
}

export const friendshipService = {
  /**
   * Create a friendship request
   */
  async create(userId: string, friendId: string): Promise<Friendship> {
    const createdAt = new Date().toISOString();

    const { data, error } = await supabase
      .from('friendships')
      .insert({
        user_id: userId,
        friend_id: friendId,
        status: 'pending',
        created_at: createdAt,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      userId: data.user_id,
      friendId: data.friend_id,
      status: data.status as 'pending' | 'accepted' | 'blocked',
      createdAt: new Date(data.created_at).getTime(),
    };
  },

  /**
   * Accept a friendship request
   */
  async accept(friendshipId: string): Promise<void> {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);

    if (error) throw error;
  },

  /**
   * Get all friends for a user (accepted friendships only)
   */
  async getFriends(userId: string): Promise<string[]> {
    // Get friendships where user is either the requester or recipient
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .eq('status', 'accepted')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (error) throw error;

    // Extract friend IDs (the other person in each friendship)
    const friendIds = (data || []).map(f =>
      f.user_id === userId ? f.friend_id : f.user_id
    );

    return friendIds;
  },

  /**
   * Get all friendships for a user (any status)
   */
  async getAllFriendships(userId: string): Promise<Friendship[]> {
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      friendId: r.friend_id,
      status: r.status as 'pending' | 'accepted' | 'blocked',
      createdAt: new Date(r.created_at).getTime(),
    }));
  },

  /**
   * Get all pending friendship requests for a user
   */
  async getPendingRequests(userId: string): Promise<Friendship[]> {
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .eq('friend_id', userId)
      .eq('status', 'pending');

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      friendId: r.friend_id,
      status: r.status as 'pending' | 'accepted' | 'blocked',
      createdAt: new Date(r.created_at).getTime(),
    }));
  },

  /**
   * Check if two users are friends
   */
  async areFriends(userId: string, friendId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('friendships')
      .select('id')
      .eq('status', 'accepted')
      .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return !!data;
  },

  /**
   * Remove a friendship
   */
  async remove(userId: string, friendId: string): Promise<void> {
    const { calculateFriendBalance } = await import('@/services/api');

    const balance = await calculateFriendBalance(userId, friendId);

    if (balance !== 0) {
      const absBalance = Math.abs(balance);
      const message = balance > 0
        ? `Cannot remove friend. They owe you $${absBalance.toFixed(2)}. Please settle up first.`
        : `Cannot remove friend. You owe them $${absBalance.toFixed(2)}. Please settle up first.`;
      throw new Error(message);
    }

    const { error } = await supabase
      .from('friendships')
      .delete()
      .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`);

    if (error) throw error;
  },

  /**
   * Create bidirectional friendship (both users become friends immediately)
   * Used when accepting invitations
   */
  async createAccepted(userId: string, friendId: string): Promise<void> {
    const createdAt = new Date().toISOString();

    // Check if friendship already exists
    const existing = await this.areFriends(userId, friendId);
    if (existing) return;

    // Create friendship
    const { error } = await supabase
      .from('friendships')
      .insert({
        user_id: userId,
        friend_id: friendId,
        status: 'accepted',
        created_at: createdAt,
      });

    if (error) throw error;
  },
};
