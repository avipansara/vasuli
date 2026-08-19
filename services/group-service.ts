import { supabase } from '@/lib/supabase';
import type { Group, GroupMember, GroupWithMembers } from '@/types/database';
import { calculateGroupBalances, isGroupSettled, SETTLED_BALANCE_THRESHOLD } from './group-balance';
import { expenseService } from './expense-service';
import { settlementService } from './settlement-service';
import { scopeTransferService } from './scope-transfer-service';
import { logGroupDetailDiagnostic } from '@/lib/group-detail-diagnostics';

type GroupHomeRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  your_balance: number;
};

function mapGroupHomeRow(row: GroupHomeRow): GroupWithMembers {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    imageUrl: row.image_url || undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    deletedAt: undefined,
    yourBalance: row.your_balance,
  };
}

export const groupService = {
  async getHomeSummaries(_currentUserId: string): Promise<GroupWithMembers[]> {
    const { data, error } = await supabase.rpc('get_groups_home_summaries');

    if (error) throw error;
    if (__DEV__) {
      console.log('[GroupsHome] loaded summaries', {
        project: (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/^https:\/\//, '').replace(/\.supabase\.co\/?$/, ''),
        count: data?.length ?? 0,
        balances: ((data ?? []) as GroupHomeRow[]).map(row => ({ groupId: row.id, balance: row.your_balance })),
      });
    }
    return ((data || []) as GroupHomeRow[]).map(mapGroupHomeRow);
  },

  async create(group: Omit<Group, 'id' | 'createdAt' | 'updatedAt'>): Promise<Group> {
    const now = new Date().toISOString();

    const insertData: any = {
      name: group.name,
      description: group.description || null,
      created_at: now,
      updated_at: now,
    };

    // Only include image_url if provided (column may not exist yet)
    if (group.imageUrl) {
      insertData.image_url = group.imageUrl;
    }

    const { data, error } = await supabase
      .from('groups')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      description: data.description || undefined,
      imageUrl: data.image_url || undefined,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      deletedAt: data.deleted_at ? new Date(data.deleted_at).getTime() : undefined,
      deletedBy: data.deleted_by || undefined,
    };
  },

  async getById(id: string, traceId?: string): Promise<Group | null> {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logGroupDetailDiagnostic('supabase-no-row', {
          traceId,
          groupId: id,
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: error.details,
          errorHint: error.hint,
        }, 'warn');
        return null;
      }
      logGroupDetailDiagnostic('supabase-error', {
        traceId,
        groupId: id,
        errorCode: error.code,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
      }, 'error');
      throw error;
    }

    return {
      id: data.id,
      name: data.name,
      description: data.description || undefined,
      imageUrl: data.image_url || undefined,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
      deletedAt: data.deleted_at ? new Date(data.deleted_at).getTime() : undefined,
      deletedBy: data.deleted_by || undefined,
    };
  },

  async getUserGroups(userId: string): Promise<Group[]> {
    // Get groups where user is a member
    const { data: memberData, error: memberError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);

    if (memberError) throw memberError;
    if (!memberData || memberData.length === 0) return [];

    const groupIds = memberData.map(m => m.group_id);

    // Fetch full group details
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || undefined,
      imageUrl: r.image_url || undefined,
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime(),
      deletedAt: r.deleted_at ? new Date(r.deleted_at).getTime() : undefined,
      deletedBy: r.deleted_by || undefined,
    }));
  },

  async getDeletedGroups(userId: string): Promise<Group[]> {
    const { data: memberData, error: memberError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);
    if (memberError) throw memberError;
    const groupIds = (memberData ?? []).map(member => member.group_id);
    if (groupIds.length === 0) return [];

    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(row => ({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      imageUrl: row.image_url || undefined,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      deletedAt: row.deleted_at ? new Date(row.deleted_at).getTime() : undefined,
      deletedBy: row.deleted_by || undefined,
    }));
  },

  async update(id: string, updates: Partial<Omit<Group, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.imageUrl !== undefined) updateData.image_url = updates.imageUrl;

    const { error } = await supabase
      .from('groups')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
  },

  async delete(id: string, currentUserId: string): Promise<void> {
    const expenses = await expenseService.getByGroup(id);
    const [splits, settlements] = await Promise.all([
      expenseService.getSplitsForExpenses(expenses.map(expense => expense.id)),
      settlementService.getByGroup(id),
    ]);
    const scopeTransfers = await scopeTransferService.getByGroup(id);

    if (!isGroupSettled(expenses, splits, settlements, scopeTransfers)) {
      throw new Error('Group cannot be deleted until all balances are settled.');
    }

    const { error } = await supabase
      .from('groups')
      .update({ deleted_at: new Date().toISOString(), deleted_by: currentUserId })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) throw error;
  },

  async restore(id: string): Promise<void> {
    const { error } = await supabase
      .from('groups')
      .update({ deleted_at: null, deleted_by: null, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  async addMember(groupId: string, userId: string, role: 'admin' | 'member' = 'member'): Promise<GroupMember> {
    const joinedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: userId,
        role,
        joined_at: joinedAt,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      groupId: data.group_id,
      userId: data.user_id,
      role: data.role as 'admin' | 'member',
      joinedAt: new Date(data.joined_at).getTime(),
    };
  },

  async getMembers(groupId: string): Promise<GroupMember[]> {
    const { data, error } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId);

    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      groupId: r.group_id,
      userId: r.user_id,
      role: r.role as 'admin' | 'member',
      joinedAt: new Date(r.joined_at).getTime(),
    }));
  },

  async removeMember(groupId: string, userId: string): Promise<void> {
    const expenses = await expenseService.getByGroup(groupId);
    const [splits, settlements] = await Promise.all([
      expenseService.getSplitsForExpenses(expenses.map(expense => expense.id)),
      settlementService.getByGroup(groupId),
    ]);
    const balance = calculateGroupBalances(expenses, splits, settlements).get(userId) ?? 0;

    if (Math.abs(balance) >= SETTLED_BALANCE_THRESHOLD) {
      throw new Error('This member cannot be removed until their group balance is settled.');
    }

    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) throw error;
  },
};
