import { supabase } from '@/lib/supabase';
import { createInvitationNotification, notificationService } from '@/services/notification-service';
import { userService } from '@/services/user-service';
import type { Invitation } from '@/types/database';

// Set to true for development/testing without real Supabase
const USE_MOCK_DATA = false;

/** Phone invites use a synthetic inbox; Resend cannot deliver to it. */
function isDeliverableEmail(email: string): boolean {
  return !email.toLowerCase().endsWith('@phone.placeholder');
}

async function assertSendInvitationEmail(params: {
  inviteeEmail: string;
  inviteeName: string;
  inviterName: string;
  inviterId: string;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-invitation', {
    body: params,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send invitation email');
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String((data as { error: string }).error));
  }
}

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
    const inviteeEmail = invitation.inviteeEmail.trim().toLowerCase();

    // Mock mode - return a mock invitation
    if (USE_MOCK_DATA) {
      console.log(`[MOCK] Invitation created for ${inviteeEmail}`);
      return {
        id: `mock-invitation-${Date.now()}`,
        inviterId: invitation.inviterId,
        inviteeEmail,
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
        invitee_email: inviteeEmail,
        invitee_phone: invitation.inviteePhone || null,
        invitee_name: invitation.inviteeName || null,
        status: 'pending',
        created_at: createdAt,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) throw error;

    const inviterName = invitation.inviterName || 'A friend';
    const inviteeName = invitation.inviteeName || inviteeEmail.split('@')[0];

    const existingUser = await userService.getByEmail(inviteeEmail);

    if (isDeliverableEmail(inviteeEmail)) {
      try {
        console.log(`[Invitation] Sending email to ${inviteeEmail}`);
        await assertSendInvitationEmail({
          inviteeEmail,
          inviteeName,
          inviterName,
          inviterId: invitation.inviterId,
        });
      } catch (emailErr) {
        console.error('Error sending invitation email:', emailErr);
        await supabase.from('invitations').delete().eq('id', data.id);
        throw emailErr;
      }
    } else {
      console.warn(
        `[Invitation] Skipping email for synthetic address ${inviteeEmail} (phone invite — add SMS or another channel to notify).`
      );
    }

    if (existingUser?.pushToken) {
      try {
        console.log(`[Invitation] Also sending push notification to ${inviteeEmail}`);
        const notification = createInvitationNotification(inviterName);
        await notificationService.sendPushNotification(existingUser.pushToken, notification);
      } catch (pushErr) {
        console.error('Error sending invitation push notification:', pushErr);
      }
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
    const normalized = email.trim().toLowerCase();
    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('invitee_email', normalized)
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

    const inviteeEmail = String(inv.invitee_email).trim().toLowerCase();
    if (!isDeliverableEmail(inviteeEmail)) {
      throw new Error(
        'Cannot resend email for phone-only invites. Use SMS or another channel until email delivery is supported.'
      );
    }

    await assertSendInvitationEmail({
      inviteeEmail,
      inviteeName: inv.invitee_name || inviteeEmail.split('@')[0],
      inviterName: inviterName || 'A friend',
      inviterId: inv.inviter_id,
    });
  },

  async getReceivedInvitations(email: string): Promise<(Invitation & { inviterName?: string })[]> {
    if (USE_MOCK_DATA) {
      return [];
    }

    const normalized = email.trim().toLowerCase();
    const { data, error } = await supabase
      .from('invitations')
      .select(`
        *,
        inviter:users!inviter_id(name)
      `)
      .eq('invitee_email', normalized)
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
