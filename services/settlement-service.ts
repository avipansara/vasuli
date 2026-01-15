import { supabase } from '@/lib/supabase';
import type { Settlement } from '@/types/database';

export const settlementService = {
  async create(settlement: Omit<Settlement, 'id' | 'createdAt'>): Promise<Settlement> {
    const createdAt = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('settlements')
      .insert({
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
