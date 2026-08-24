import { supabase } from '@/lib/supabase';
import { Activity, ActivityType } from '@/types/database';
import { mapActivityRow } from './database-row-mappers';

export const activityService = {
  async create(activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> {
    const { data, error } = await supabase
      .from('activities')
      .insert({
        type: activity.type,
        user_id: activity.userId,
        user_name: activity.userName || null,
        target_id: activity.targetId,
        group_id: activity.groupId || null,
        group_name: activity.groupName || null,
        description: activity.description,
        amount: activity.amount || null,
        metadata: activity.metadata || null,
      })
      .select()
      .single();

    if (error) throw error;

    console.log('[Activity] Created:', activity.type, activity.description);

    return mapActivityRow(data);
  },

  async getByUser(userId: string, limit?: number): Promise<Activity[]> {
    let query = supabase
      .from('activities')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(mapActivityRow);
  },

  async getUserActivities(userId: string, limit?: number, offset?: number, search?: string): Promise<Activity[]> {
    // All filtering, ordering, and LIMIT/OFFSET pagination are handled by the
    // get_user_activities SECURITY DEFINER function in the database.
    // This replaces the previous 6-query client-side merge where every page
    // re-fetched unbounded datasets and discarded rows via Array.slice.
    console.log('[getUserActivities] calling RPC with', { p_limit: limit ?? 20, p_offset: offset ?? 0, p_search: search ?? '' });
    const { data, error } = await supabase.rpc('get_user_activities', {
      p_limit:  limit  ?? 20,
      p_offset: offset ?? 0,
      p_search: search ?? '',
    });

    if (error) {
      console.error('[getUserActivities] RPC error:', JSON.stringify(error));
      throw error;
    }

    console.log('[getUserActivities] got', (data || []).length, 'rows');
    return (data || []).map(mapActivityRow);
  },



  async getByGroup(groupId: string, limit?: number): Promise<Activity[]> {
    let query = supabase
      .from('activities')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(mapActivityRow);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async deleteByTarget(targetId: string): Promise<void> {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('target_id', targetId);

    if (error) throw error;
  },

  async getByTarget(targetId: string): Promise<Activity[]> {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('target_id', targetId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(mapActivityRow);
  },

  async getByTargets(targetIds: string[]): Promise<Activity[]> {
    if (targetIds.length === 0) return [];

    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .in('target_id', targetIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(mapActivityRow);
  },

  // Helper to log expense activities
  async logExpenseCreated(params: {
    expenseId: string;
    userId: string;
    userName: string;
    description: string;
    amount: number;
    groupId?: string;
    groupName?: string;
  }): Promise<Activity> {
    return this.create({
      type: ActivityType.EXPENSE_CREATED,
      userId: params.userId,
      userName: params.userName,
      targetId: params.expenseId,
      groupId: params.groupId,
      groupName: params.groupName,
      description: params.description,
      amount: params.amount,
    });
  },

  async logExpenseUpdated(params: {
    expenseId: string;
    userId: string;
    userName: string;
    description: string;
    amount: number;
    groupId?: string;
    groupName?: string;
    participantIds?: string[];
  }): Promise<Activity> {
    return this.create({
      type: ActivityType.EXPENSE_UPDATED,
      userId: params.userId,
      userName: params.userName,
      targetId: params.expenseId,
      groupId: params.groupId,
      groupName: params.groupName,
      description: `Updated: ${params.description}`,
      amount: params.amount,
      metadata: params.participantIds ? JSON.stringify({ participantIds: params.participantIds }) : undefined,
    });
  },

  async logExpenseDeleted(params: {
    expenseId: string;
    userId: string;
    userName: string;
    description: string;
    amount: number;
    groupId?: string;
    groupName?: string;
    participantIds?: string[];
  }): Promise<Activity> {
    return this.create({
      type: ActivityType.EXPENSE_DELETED,
      userId: params.userId,
      userName: params.userName,
      targetId: params.expenseId,
      groupId: params.groupId,
      groupName: params.groupName,
      description: `Deleted: ${params.description}`,
      amount: params.amount,
      metadata: params.participantIds ? JSON.stringify({ participantIds: params.participantIds }) : undefined,
    });
  },

  async logSettlementCreated(params: {
    settlementId: string;
    fromUserId: string;
    fromUserName: string;
    toUserName: string;
    amount: number;
    groupId?: string;
    groupName?: string;
  }): Promise<Activity> {
    return this.create({
      type: ActivityType.SETTLEMENT_CREATED,
      userId: params.fromUserId,
      userName: params.fromUserName,
      targetId: params.settlementId,
      groupId: params.groupId,
      groupName: params.groupName,
      description: `${params.fromUserName} paid ${params.toUserName}`,
      amount: params.amount,
    });
  },

  async logSettlementUpdated(params: {
    settlementId: string;
    userId: string;
    userName: string;
    amount: number;
    groupId?: string;
    groupName?: string;
  }): Promise<Activity> {
    return this.create({
      type: ActivityType.SETTLEMENT_UPDATED,
      userId: params.userId,
      userName: params.userName,
      targetId: params.settlementId,
      groupId: params.groupId,
      groupName: params.groupName,
      description: `Updated settlement`,
      amount: params.amount,
    });
  },

  async logGroupCreated(params: {
    groupId: string;
    userId: string;
    userName: string;
    groupName: string;
  }): Promise<Activity> {
    return this.create({
      type: ActivityType.GROUP_CREATED,
      userId: params.userId,
      userName: params.userName,
      targetId: params.groupId,
      groupId: params.groupId,
      groupName: params.groupName,
      description: `Created group "${params.groupName}"`,
    });
  },

  async logMemberAdded(params: {
    groupId: string;
    userId: string;
    userName: string;
    memberName: string;
    groupName: string;
  }): Promise<Activity> {
    return this.create({
      type: ActivityType.MEMBER_ADDED,
      userId: params.userId,
      userName: params.userName,
      targetId: params.groupId,
      groupId: params.groupId,
      groupName: params.groupName,
      description: `Added ${params.memberName} to ${params.groupName}`,
    });
  },

  async logMemberRemoved(params: {
    groupId: string;
    userId: string;
    userName: string;
    memberName: string;
    groupName: string;
  }): Promise<Activity> {
    return this.create({
      type: ActivityType.MEMBER_REMOVED,
      userId: params.userId,
      userName: params.userName,
      targetId: params.groupId,
      groupId: params.groupId,
      groupName: params.groupName,
      description: `Removed ${params.memberName} from ${params.groupName}`,
    });
  },
};
