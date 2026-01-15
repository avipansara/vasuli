import { supabase } from '@/lib/supabase';
import type { Invitation } from '@/types/database';

export const invitationService = {
  async create(invitation: {
    inviterId: string;
    inviteeEmail: string;
    inviteePhone?: string;
    inviteeName?: string;
    inviterName?: string;
  }): Promise<Invitation> {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    const { data, error } = await supabase
      .from('invitations')
      .insert({
        inviter_id: invitation.inviterId,
        invitee_email: invitation.inviteeEmail,
        invitee_phone: invitation.inviteePhone || null,
        invitee_name: invitation.inviteeName || null,
        status: 'pending',
        created_at: createdAt,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) throw error;

    // Send invitation email via Edge Function
    try {
      const { error: emailError } = await supabase.functions.invoke('send-invitation', {
        body: {
          inviteeEmail: invitation.inviteeEmail,
          inviteeName: invitation.inviteeName || invitation.inviteeEmail.split('@')[0],
          inviterName: invitation.inviterName || 'A friend',
          inviterId: invitation.inviterId,
        },
      });

      if (emailError) {
        console.error('Failed to send invitation email:', emailError);
        // Don't throw - invitation was created successfully, email is optional
      }
    } catch (emailError) {
      console.error('Error sending invitation email:', emailError);
      // Don't throw - invitation was created successfully
    }

    return {
      id: data.id,
      inviterId: data.inviter_id,
      inviteeEmail: data.invitee_email,
      inviteePhone: data.invitee_phone || undefined,
      inviteeName: data.invitee_name || undefined,
      status: data.status,
      createdAt: new Date(data.created_at).getTime(),
      expiresAt: new Date(data.expires_at).getTime(),
    };
  },

  async getByInviter(inviterId: string): Promise<Invitation[]> {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('inviter_id', inviterId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map(inv => ({
      id: inv.id,
      inviterId: inv.inviter_id,
      inviteeEmail: inv.invitee_email,
      inviteePhone: inv.invitee_phone || undefined,
      inviteeName: inv.invitee_name || undefined,
      status: inv.status,
      createdAt: new Date(inv.created_at).getTime(),
      expiresAt: new Date(inv.expires_at).getTime(),
    }));
  },

  async getByEmail(email: string): Promise<Invitation[]> {
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('invitee_email', email)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map(inv => ({
      id: inv.id,
      inviterId: inv.inviter_id,
      inviteeEmail: inv.invitee_email,
      inviteePhone: inv.invitee_phone || undefined,
      inviteeName: inv.invitee_name || undefined,
      status: inv.status,
      createdAt: new Date(inv.created_at).getTime(),
      expiresAt: new Date(inv.expires_at).getTime(),
    }));
  },

  async updateStatus(id: string, status: 'accepted' | 'declined'): Promise<void> {
    const { error } = await supabase
      .from('invitations')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('invitations')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};
