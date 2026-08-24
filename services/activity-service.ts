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
    // Parallel fetch to identify groups, settlements, and expenses where the user is involved, and fetch activities
    const [memberData, settlementsData, splitsData, activitiesData] = await Promise.all([
      supabase.from('group_members').select('group_id').eq('user_id', userId),
      supabase.from('settlements').select('*'),
      supabase.from('expense_splits').select('expense_id').eq('user_id', userId),
      supabase.from('activities').select('*'),
    ]);

    if (memberData.error) throw memberData.error;
    if (settlementsData.error) throw settlementsData.error;
    if (splitsData.error) throw splitsData.error;
    if (activitiesData.error) throw activitiesData.error;

    const groupIds = (memberData.data || []).map(m => m.group_id);
    const expenseIds = [...new Set((splitsData.data || []).map(s => s.expense_id))];

    // Filter DB activities to exclude database settlement activities (as we generate/merge them from settlements table)
    let dbActivities = (activitiesData.data || [])
      .map(mapActivityRow)
      .filter(a => a.type !== ActivityType.SETTLEMENT_CREATED && a.type !== ActivityType.SETTLEMENT_DELETED);

    // Apply visibility filter client-side to mimic the activities RLS policy
    const groupIdsSet = new Set(groupIds);
    const expenseIdsSet = new Set(expenseIds);
    dbActivities = dbActivities.filter(a =>
      a.userId === userId ||
      (a.groupId && groupIdsSet.has(a.groupId)) ||
      (a.targetId && expenseIdsSet.has(a.targetId))
    );

    // Fetch related users & groups to resolve their display names
    const relatedUserIds = [...new Set((settlementsData.data || []).flatMap(s => [s.from_user_id, s.to_user_id]))];
    const relatedGroupIds = [...new Set((settlementsData.data || []).flatMap(s => s.group_id ? [s.group_id] : []))];

    const [usersRes, groupsRes] = await Promise.all([
      relatedUserIds.length > 0
        ? supabase.from('users').select('id, name').in('id', relatedUserIds)
        : Promise.resolve({ data: [], error: null }),
      relatedGroupIds.length > 0
        ? supabase.from('groups').select('id, name').in('id', relatedGroupIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const userNames = new Map((usersRes.data || []).map(u => [u.id, u.name]));
    const groupNames = new Map((groupsRes.data || []).map(g => [g.id, g.name]));

    // Map settlements to Activities client-side
    const settlementActivities: Activity[] = (settlementsData.data || []).map(s => {
      const fromName = s.from_user_id === userId ? 'You' : (userNames.get(s.from_user_id) || 'Someone');
      const toName = s.to_user_id === userId ? 'You' : (userNames.get(s.to_user_id) || 'Someone');
      const isReversal = s.notes?.toLowerCase().startsWith('reversal of') || s.notes?.toLowerCase().startsWith('reversed');
      const prefix = isReversal ? 'Deleted: ' : '';
      const description = `${prefix}${fromName} paid ${toName}`;

      return {
        id: s.id,
        type: isReversal ? ActivityType.SETTLEMENT_DELETED : ActivityType.SETTLEMENT_CREATED,
        userId: s.from_user_id,
        userName: userNames.get(s.from_user_id) || 'Someone',
        targetId: s.id,
        groupId: s.group_id || undefined,
        groupName: s.group_id ? groupNames.get(s.group_id) : undefined,
        description,
        amount: s.amount,
        createdAt: new Date(s.created_at).getTime(),
      };
    });

    // Merge all activities
    let combined = [...dbActivities, ...settlementActivities];

    // Sort by date descending
    combined.sort((a, b) => b.createdAt - a.createdAt);

    // Apply search filter client-side
    const normalizedSearch = search
      ?.trim()
      .replace(/[^a-zA-Z0-9\s$-]/g, ' ')
      .replace(/\s+/g, ' ');
    if (normalizedSearch) {
      const searchPattern = new RegExp(normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      combined = combined.filter(a =>
        searchPattern.test(a.description || '') ||
        searchPattern.test(a.groupName || '') ||
        searchPattern.test(a.userName || '')
      );
    }

    // Apply pagination
    if (limit !== undefined) {
      const from = offset || 0;
      const to = from + limit;
      combined = combined.slice(from, to);
    }

    return combined;
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
