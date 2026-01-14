import { supabase } from '@/lib/supabase';
import type { Expense, ExpenseSplit, Group, GroupMember, Settlement, User } from '@/types/database';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function initDatabase() {
  // No initialization needed for Supabase - tables are created in the dashboard
  return true;
}

export const userService = {
  async create(user: Omit<User, 'id' | 'createdAt'> & { id?: string }): Promise<User> {
    const id = user.id || generateId();
    const createdAt = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('users')
      .insert({
        id,
        name: user.name,
        email: user.email || null,
        phone: user.phone || null,
        avatar: user.avatar || null,
        created_at: createdAt,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      id: data.id,
      name: data.name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      avatar: data.avatar || undefined,
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
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    
    return {
      id: data.id,
      name: data.name,
      email: data.email || undefined,
      phone: data.phone || undefined,
      avatar: data.avatar || undefined,
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
      createdAt: new Date(r.created_at).getTime(),
    }));
  },

  async update(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({
        name: updates.name,
        email: updates.email,
        phone: updates.phone,
        avatar: updates.avatar,
      })
      .eq('id', id);
    
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },
};

export const groupService = {
  async create(group: Omit<Group, 'id' | 'createdAt' | 'updatedAt'>): Promise<Group> {
    const id = generateId();
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('groups')
      .insert({
        id,
        name: group.name,
        description: group.description || null,
        image_url: group.imageUrl || null,
        created_at: now,
        updated_at: now,
      })
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
    };
  },

  async getById(id: string): Promise<Group | null> {
    const { data, error } = await supabase
      .from('groups')
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
      description: data.description || undefined,
      imageUrl: data.image_url || undefined,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  },

  async getAll(): Promise<Group[]> {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || undefined,
      imageUrl: r.image_url || undefined,
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime(),
    }));
  },

  async update(id: string, updates: Partial<Omit<Group, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    const { error } = await supabase
      .from('groups')
      .update({
        name: updates.name,
        description: updates.description,
        image_url: updates.imageUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  async addMember(groupId: string, userId: string, role: 'admin' | 'member' = 'member'): Promise<GroupMember> {
    const id = generateId();
    const joinedAt = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('group_members')
      .insert({
        id,
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
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    
    if (error) throw error;
  },
};

export const expenseService = {
  async create(
    expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>,
    splits: Omit<ExpenseSplit, 'id' | 'expenseId'>[]
  ): Promise<Expense> {
    const id = generateId();
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        id,
        group_id: expense.groupId || null,
        description: expense.description,
        amount: expense.amount,
        currency: expense.currency,
        paid_by: expense.paidBy,
        category: expense.category || null,
        date: new Date(expense.date).toISOString(),
        image_url: expense.imageUrl || null,
        notes: expense.notes || null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    // Insert splits
    if (splits.length > 0) {
      const splitsToInsert = splits.map(split => ({
        id: generateId(),
        expense_id: id,
        user_id: split.userId,
        amount: split.amount,
        split_type: split.splitType,
        percentage: split.percentage || null,
      }));
      
      const { error: splitsError } = await supabase
        .from('expense_splits')
        .insert(splitsToInsert);
      
      if (splitsError) throw splitsError;
    }
    
    return {
      id: data.id,
      groupId: data.group_id || undefined,
      description: data.description,
      amount: data.amount,
      currency: data.currency,
      paidBy: data.paid_by,
      category: data.category || undefined,
      date: new Date(data.date).getTime(),
      imageUrl: data.image_url || undefined,
      notes: data.notes || undefined,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  },

  async getById(id: string): Promise<Expense | null> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    
    return {
      id: data.id,
      groupId: data.group_id || undefined,
      description: data.description,
      amount: data.amount,
      currency: data.currency,
      paidBy: data.paid_by,
      category: data.category || undefined,
      date: new Date(data.date).getTime(),
      imageUrl: data.image_url || undefined,
      notes: data.notes || undefined,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    };
  },

  async getByGroup(groupId: string): Promise<Expense[]> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('group_id', groupId)
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(r => ({
      id: r.id,
      groupId: r.group_id || undefined,
      description: r.description,
      amount: r.amount,
      currency: r.currency,
      paidBy: r.paid_by,
      category: r.category || undefined,
      date: new Date(r.date).getTime(),
      imageUrl: r.image_url || undefined,
      notes: r.notes || undefined,
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime(),
    }));
  },

  async getSplits(expenseId: string): Promise<ExpenseSplit[]> {
    const { data, error } = await supabase
      .from('expense_splits')
      .select('*')
      .eq('expense_id', expenseId);
    
    if (error) throw error;
    
    return (data || []).map(r => ({
      id: r.id,
      expenseId: r.expense_id,
      userId: r.user_id,
      amount: r.amount,
      splitType: r.split_type as 'equal' | 'exact' | 'percentage',
      percentage: r.percentage || undefined,
    }));
  },

  async getAll(): Promise<Expense[]> {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(r => ({
      id: r.id,
      groupId: r.group_id || undefined,
      description: r.description,
      amount: r.amount,
      currency: r.currency,
      paidBy: r.paid_by,
      category: r.category || undefined,
      date: new Date(r.date).getTime(),
      imageUrl: r.image_url || undefined,
      notes: r.notes || undefined,
      createdAt: new Date(r.created_at).getTime(),
      updatedAt: new Date(r.updated_at).getTime(),
    }));
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },
};

export const settlementService = {
  async create(settlement: Omit<Settlement, 'id' | 'createdAt'>): Promise<Settlement> {
    const id = generateId();
    const createdAt = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('settlements')
      .insert({
        id,
        group_id: settlement.groupId,
        from_user_id: settlement.fromUserId,
        to_user_id: settlement.toUserId,
        amount: settlement.amount,
        currency: settlement.currency,
        date: new Date(settlement.date).toISOString(),
        notes: settlement.notes || null,
        created_at: createdAt,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      id: data.id,
      groupId: data.group_id,
      fromUserId: data.from_user_id,
      toUserId: data.to_user_id,
      amount: data.amount,
      currency: data.currency,
      date: new Date(data.date).getTime(),
      notes: data.notes || undefined,
      createdAt: new Date(data.created_at).getTime(),
    };
  },

  async getByGroup(groupId: string): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('group_id', groupId)
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(r => ({
      id: r.id,
      groupId: r.group_id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      amount: r.amount,
      currency: r.currency,
      date: new Date(r.date).getTime(),
      notes: r.notes || undefined,
      createdAt: new Date(r.created_at).getTime(),
    }));
  },

  async getAll(): Promise<Settlement[]> {
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .order('date', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(r => ({
      id: r.id,
      groupId: r.group_id || undefined,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      amount: r.amount,
      currency: r.currency,
      date: new Date(r.date).getTime(),
      notes: r.notes || undefined,
      createdAt: new Date(r.created_at).getTime(),
    }));
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('settlements')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },
};

export async function calculateBalances(groupId: string): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  
  const expenses = await expenseService.getByGroup(groupId);
  
  for (const expense of expenses) {
    const splits = await expenseService.getSplits(expense.id);
    
    const currentBalance = balances.get(expense.paidBy) || 0;
    balances.set(expense.paidBy, currentBalance + expense.amount);
    
    for (const split of splits) {
      const userBalance = balances.get(split.userId) || 0;
      balances.set(split.userId, userBalance - split.amount);
    }
  }
  
  const settlements = await settlementService.getByGroup(groupId);
  for (const settlement of settlements) {
    const fromBalance = balances.get(settlement.fromUserId) || 0;
    balances.set(settlement.fromUserId, fromBalance + settlement.amount);
    
    const toBalance = balances.get(settlement.toUserId) || 0;
    balances.set(settlement.toUserId, toBalance - settlement.amount);
  }
  
  return balances;
}

export async function calculateFriendBalance(currentUserId: string, friendId: string): Promise<number> {
  let balance = 0;
  
  // Get all expenses
  const allExpenses = await expenseService.getAll();
  
  for (const expense of allExpenses) {
    const splits = await expenseService.getSplits(expense.id);
    
    const currentUserSplit = splits.find(s => s.userId === currentUserId);
    const friendSplit = splits.find(s => s.userId === friendId);
    
    // Only process if both users are part of this expense
    if (currentUserSplit && friendSplit) {
      if (expense.paidBy === currentUserId) {
        // Current user paid, friend owes their share
        balance += friendSplit.amount;
      } else if (expense.paidBy === friendId) {
        // Friend paid, current user owes their share
        balance -= currentUserSplit.amount;
      }
    }
  }
  
  // Apply all settlements between these two users
  const allSettlements = await settlementService.getAll();
  const friendSettlements = allSettlements.filter(s => 
    (s.fromUserId === currentUserId && s.toUserId === friendId) ||
    (s.fromUserId === friendId && s.toUserId === currentUserId));
  
  for (const settlement of friendSettlements) {
    if (settlement.fromUserId === currentUserId) {
      // Current user paid friend (reduces what you owe, so balance goes up)
      balance += settlement.amount;
    } else {
      // Friend paid current user (reduces what they owe, so balance goes down)
      balance -= settlement.amount;
    }
  }
  
  return balance;
}
