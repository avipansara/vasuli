import { supabase } from '@/lib/supabase';
import type { User } from '@/types/database';

export const userService = {
  async create(user: Omit<User, 'id' | 'createdAt'> & { id?: string }): Promise<User> {
    const createdAt = new Date().toISOString();
    
    const insertData: any = {
      name: user.name,
      email: user.email || null,
      phone: user.phone || null,
      avatar: user.avatar || null,
      created_at: createdAt,
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
