import { supabase } from '@/lib/supabase';
import { Activity, ActivityType } from '@/types/database';

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

    return {
      id: data.id,
      type: data.type as ActivityType,
      userId: data.user_id,
      userName: data.user_name || undefined,
      targetId: data.target_id,
      groupId: data.group_id || undefined,
      groupName: data.group_name || undefined,
      description: data.description,
      amount: data.amount || undefined,
      metadata: data.metadata || undefined,
      createdAt: new Date(data.created_at).getTime(),
    };
  },

  async getAll(limit?: number): Promise<Activity[]> {
    let query = supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      type: r.type as ActivityType,
      userId: r.user_id,
      userName: r.user_name || undefined,
      targetId: r.target_id,
      groupId: r.group_id || undefined,
      groupName: r.group_name || undefined,
      description: r.description,
      amount: r.amount || undefined,
      metadata: r.metadata || undefined,
      createdAt: new Date(r.created_at).getTime(),
    }));
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

    return (data || []).map(r => ({
      id: r.id,
      type: r.type as ActivityType,
      userId: r.user_id,
      userName: r.user_name || undefined,
      targetId: r.target_id,
      groupId: r.group_id || undefined,
      groupName: r.group_name || undefined,
      description: r.description,
      amount: r.amount || undefined,
      metadata: r.metadata || undefined,
      createdAt: new Date(r.created_at).getTime(),
    }));
  },

  async getUserActivities(userId: string, limit?: number): Promise<Activity[]> {
    // Get activities from groups the user is a member of
    const { data: memberData, error: memberError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);
    
    if (memberError) throw memberError;
    
    const groupIds = (memberData || []).map(m => m.group_id);
    
    // Build query for activities: user's own activities OR activities in their groups
    let query = supabase
      .from('activities')
      .select('*')
      .or(`user_id.eq.${userId},group_id.in.(${groupIds.length > 0 ? groupIds.join(',') : 'null'})`)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      type: r.type as ActivityType,
      userId: r.user_id,
      userName: r.user_name || undefined,
      targetId: r.target_id,
      groupId: r.group_id || undefined,
      groupName: r.group_name || undefined,
      description: r.description,
      amount: r.amount || undefined,
      metadata: r.metadata || undefined,
      createdAt: new Date(r.created_at).getTime(),
    }));
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

    return (data || []).map(r => ({
      id: r.id,
      type: r.type as ActivityType,
      userId: r.user_id,
      userName: r.user_name || undefined,
      targetId: r.target_id,
      groupId: r.group_id || undefined,
      groupName: r.group_name || undefined,
      description: r.description,
      amount: r.amount || undefined,
      metadata: r.metadata || undefined,
      createdAt: new Date(r.created_at).getTime(),
    }));
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
    });
  },

  async logExpenseDeleted(params: {
    expenseId: string;
    userId: string;
    userName: string;
    description: string;
    groupId?: string;
    groupName?: string;
  }): Promise<Activity> {
    return this.create({
      type: ActivityType.EXPENSE_DELETED,
      userId: params.userId,
      userName: params.userName,
      targetId: params.expenseId,
      groupId: params.groupId,
      groupName: params.groupName,
      description: `Deleted: ${params.description}`,
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
