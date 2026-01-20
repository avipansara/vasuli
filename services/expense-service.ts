import { supabase } from '@/lib/supabase';
import type { Expense, ExpenseSplit } from '@/types/database';

export const expenseService = {
  async create(
    expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>,
    splits: Omit<ExpenseSplit, 'id' | 'expenseId'>[]
  ): Promise<Expense> {
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('expenses')
      .insert({
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
        expense_id: data.id,
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

  async update(
    id: string,
    expense: Partial<Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>>,
    splits?: Omit<ExpenseSplit, 'id' | 'expenseId'>[]
  ): Promise<void> {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (expense.description !== undefined) updateData.description = expense.description;
    if (expense.amount !== undefined) updateData.amount = expense.amount;
    if (expense.currency !== undefined) updateData.currency = expense.currency;
    if (expense.paidBy !== undefined) updateData.paid_by = expense.paidBy;
    if (expense.category !== undefined) updateData.category = expense.category;
    if (expense.date !== undefined) updateData.date = new Date(expense.date).toISOString();
    if (expense.imageUrl !== undefined) updateData.image_url = expense.imageUrl;
    if (expense.notes !== undefined) updateData.notes = expense.notes;

    const { error } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', id);
    
    if (error) throw error;

    // Update splits if provided
    if (splits) {
      // Delete existing splits
      const { error: deleteError } = await supabase
        .from('expense_splits')
        .delete()
        .eq('expense_id', id);
      
      if (deleteError) throw deleteError;

      // Insert new splits
      if (splits.length > 0) {
        const splitsToInsert = splits.map(split => ({
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
    }
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

  async getUserExpenses(userId: string): Promise<Expense[]> {
    // Get expense IDs where user is involved (either paid or split with them)
    const { data: splitData, error: splitError } = await supabase
      .from('expense_splits')
      .select('expense_id')
      .eq('user_id', userId);
    
    if (splitError) throw splitError;
    
    // Also get expenses paid by the user
    const { data: paidData, error: paidError } = await supabase
      .from('expenses')
      .select('id')
      .eq('paid_by', userId);
    
    if (paidError) throw paidError;
    
    // Combine both sets of expense IDs
    const splitExpenseIds = (splitData || []).map(s => s.expense_id);
    const paidExpenseIds = (paidData || []).map(e => e.id);
    const allExpenseIds = [...new Set([...splitExpenseIds, ...paidExpenseIds])];
    
    if (allExpenseIds.length === 0) return [];
    
    // Fetch full expense details
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .in('id', allExpenseIds)
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

  async delete(id: string, userId: string, userName: string): Promise<void> {
    // First, get the expense details before deleting
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('*, groups(name)')
      .eq('id', id)
      .single();
    
    if (fetchError) throw fetchError;
    
    // Delete the expense
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    // Log the activity
    const { activityService } = await import('./activity-service');
    await activityService.logExpenseDeleted({
      expenseId: id,
      userId,
      userName,
      description: expense.description,
      groupId: expense.group_id || undefined,
      groupName: expense.groups?.name || undefined,
    });
  },
};
