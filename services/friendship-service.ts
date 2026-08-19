import { supabase } from '@/lib/supabase';
import { userService } from '@/services/user-service';
import { mapFriendshipRow } from './database-row-mappers';

export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  status: 'pending' | 'accepted' | 'blocked';
  createdAt: number;
}

export interface PendingFriendshipRequest extends Friendship {
  requesterName: string;
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

    return mapFriendshipRow(data);
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

  /** Decline a pending friendship request. */
  async decline(friendshipId: string): Promise<void> {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId)
      .eq('status', 'pending');

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

    return (data || []).map(mapFriendshipRow);
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

    return (data || []).map(mapFriendshipRow);
  },

  /**
   * Get pending requests with the requester's profile name.
   *
   * Friendships only store user IDs, so resolve the requester profiles in one
   * batch and fail loudly if a referenced profile cannot be loaded. This keeps
   * the UI from silently presenting an anonymous request.
   */
  async getPendingRequestsWithRequesters(userId: string): Promise<PendingFriendshipRequest[]> {
    const [requests, friendIds] = await Promise.all([
      this.getPendingRequests(userId),
      this.getFriends(userId),
    ]);
    const acceptedFriendIds = new Set(friendIds);
    const visibleRequests = requests.filter((request) => !acceptedFriendIds.has(request.userId));
    if (visibleRequests.length === 0) return [];

    const requesters = await userService.getByIds(visibleRequests.map((request) => request.userId));
    const requesterNames = new Map(
      requesters.map((requester) => [
        requester.id,
        requester.name?.trim() || requester.email?.split('@')[0] || requester.phone || 'Someone',
      ])
    );
    const missingRequesterIds = visibleRequests
      .map((request) => request.userId)
      .filter((requesterId) => !requesterNames.has(requesterId));

    if (missingRequesterIds.length > 0) {
      throw new Error('Unable to load the profile for a pending friend request.');
    }

    return visibleRequests.map((request) => ({
      ...request,
      requesterName: requesterNames.get(request.userId)!,
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
    const { calculateFriendBalance } = await import('@/services/balance-utils');

    const balance = await calculateFriendBalance(userId, friendId);

    if (balance !== 0) {
      const absBalance = Math.abs(balance);
      const message = balance > 0
        ? `Cannot remove friend. They owe you $${absBalance.toFixed(2)}. Please settle up first.`
        : `Cannot remove friend. You owe them $${absBalance.toFixed(2)}. Please settle up first.`;
      throw new Error(message);
    }

    // Dynamic import keeps unit tests from loading invitation-service → notification → react-native.
    const { invitationService } = await import('@/services/invitation-service');
    await invitationService.deleteInvitationsForRemovedFriendship(userId, friendId);

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
