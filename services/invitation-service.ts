import { supabase } from '@/lib/supabase';
import type { Invitation } from '@/types/database';

// Set to true for development/testing without real Supabase
const USE_MOCK_DATA = true;

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

    // Mock mode - return a mock invitation
    if (USE_MOCK_DATA) {
      console.log(`[MOCK] Invitation created for ${invitation.inviteeEmail}`);
      return {
        id: `mock-invitation-${Date.now()}`,
        inviterId: invitation.inviterId,
        inviteeEmail: invitation.inviteeEmail,
        inviteePhone: invitation.inviteePhone,
        inviteeName: invitation.inviteeName,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };
    }

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
    if (USE_MOCK_DATA) {
      return [];
    }

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

  async resend(id: string, inviterName?: string): Promise<void> {
    // Get the invitation details
    const { data: inv, error: fetchError } = await supabase
      .from('invitations')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !inv) throw fetchError || new Error('Invitation not found');

    // Update expires_at to extend the invitation
    const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: updateError } = await supabase
      .from('invitations')
      .update({ expires_at: newExpiresAt })
      .eq('id', id);

    if (updateError) throw updateError;

    // Resend the invitation email
    try {
      await supabase.functions.invoke('send-invitation', {
        body: {
          inviteeEmail: inv.invitee_email,
          inviteeName: inv.invitee_name || inv.invitee_email.split('@')[0],
          inviterName: inviterName || 'A friend',
          inviterId: inv.inviter_id,
        },
      });
    } catch (emailError) {
      console.error('Error resending invitation email:', emailError);
    }
  },

  async getReceivedInvitations(email: string): Promise<(Invitation & { inviterName?: string })[]> {
    if (USE_MOCK_DATA) {
      return [];
    }

    const { data, error } = await supabase
      .from('invitations')
      .select(`
        *,
        inviter:users!inviter_id(name)
      `)
      .eq('invitee_email', email)
      .eq('status', 'pending')
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
      inviterName: inv.inviter?.name,
    }));
  },
};
