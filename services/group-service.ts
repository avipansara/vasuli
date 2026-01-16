import { supabase } from '@/lib/supabase';
import type { Group, GroupMember } from '@/types/database';

export const groupService = {
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
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    
    if (error) throw error;
  },
};
