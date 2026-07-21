import { supabase } from '@/lib/supabase';
import { createInvitationNotification, notificationService } from '@/services/notification-service';
import { userService } from '@/services/user-service';
import type { Invitation, User } from '@/types/database';
import { normalizeEmail } from '@/utils/validation';
import type { Friendship } from '@/services/friendship-service';

export type FriendRequestOrInvitation =
  | { type: 'friend_request'; friendship: Friendship; friend: User }
  | { type: 'invitation'; invitation: Invitation };

/** Phone invites use a synthetic inbox; Resend cannot deliver to it. */
function isDeliverableEmail(email: string): boolean {
  const n = normalizeEmail(email);
  if (!n) return true;
  return !n.endsWith('@phone.placeholder');
}

async function assertSendInvitationEmail(params: {
  inviteeEmail: string;
  inviteeName: string;
  inviterName: string;
  inviterId: string;
  invitationId: string;
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
  /** Connect directly with an existing Vasuli user; invite everyone else by email. */
  async sendRequestOrInvitation(invitation: {
    inviterId: string;
    inviteeEmail: string;
    inviteePhone?: string;
    inviteeName?: string;
    inviterName?: string;
  }): Promise<FriendRequestOrInvitation> {
    const inviteeEmail = normalizeEmail(invitation.inviteeEmail);
    if (!inviteeEmail) throw new Error('A valid email address is required');

    const existingUser = await userService.getByEmail(inviteeEmail);
    if (existingUser) {
      if (existingUser.id === invitation.inviterId) {
        throw new Error('You cannot add yourself as a friend');
      }

      const { friendshipService } = await import('@/services/friendship-service');
      const friendship = await friendshipService.create(invitation.inviterId, existingUser.id);
      if (existingUser.pushToken) {
        try {
          await notificationService.sendPushNotification(
            existingUser.pushToken,
            createInvitationNotification(invitation.inviterName || 'A friend'),
          );
        } catch (pushErr) {
          console.error('Error sending friend request notification:', pushErr);
        }
      }
      return { type: 'friend_request', friendship, friend: existingUser };
    }

    const createdInvitation = await this.create({ ...invitation, inviteeEmail });
    return { type: 'invitation', invitation: createdInvitation };
  },

  async create(invitation: {
    inviterId: string;
    inviteeEmail: string;
    inviteePhone?: string;
    inviteeName?: string;
    inviterName?: string;
  }): Promise<Invitation> {
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    const inviteeEmail = normalizeEmail(invitation.inviteeEmail) ?? '';

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

    if (isDeliverableEmail(inviteeEmail)) {
      try {
        const invitationId = data?.id != null ? String(data.id) : '';
        if (!invitationId) {
          throw new Error('Invitation insert did not return an id; cannot send email.');
        }
        console.log(`[Invitation] Sending email to ${inviteeEmail}`);
        await assertSendInvitationEmail({
          inviteeEmail: String(inviteeEmail),
          inviteeName: String(inviteeName),
          inviterName: String(inviterName),
          inviterId: String(invitation.inviterId),
          invitationId,
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
    const normalized = normalizeEmail(email);
    if (!normalized) return [];

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

    const inviteeEmail = normalizeEmail(String(inv.invitee_email)) ?? '';
    if (!isDeliverableEmail(inviteeEmail)) {
      throw new Error('This invitation has no deliverable email address.');
    }

    await assertSendInvitationEmail({
      inviteeEmail,
      inviteeName: inv.invitee_name || inviteeEmail.split('@')[0],
      inviterName: inviterName || 'A friend',
      inviterId: inv.inviter_id,
      invitationId: id,
    });
  },

  /**
   * Mark the invitation accepted when the invitee opens the email deep link and taps Accept.
   * Uses `invitationId` from the URL when present; otherwise finds the newest pending row for
   * (inviterId, inviteeEmail). No-ops if invitee has no email or nothing matches.
   */
  async acceptInvitationFromLink(params: {
    invitationId?: string | null;
    inviterId: string;
    inviteeEmail?: string | null;
  }): Promise<void> {
    const email = normalizeEmail(params.inviteeEmail ?? undefined);
    if (!email) return;

    if (params.invitationId) {
      const { data, error } = await supabase
        .from('invitations')
        .select('id, inviter_id, invitee_email, status')
        .eq('id', params.invitationId)
        .maybeSingle();

      if (error || !data) return;

      if (data.inviter_id !== params.inviterId) return;
      if (normalizeEmail(String(data.invitee_email)) !== email) return;
      if (data.status === 'accepted' || data.status === 'declined') return;
      if (data.status !== 'pending') return;

      await this.updateStatus(data.id, 'accepted');
      return;
    }

    const { data: rows, error } = await supabase
      .from('invitations')
      .select('id, status')
      .eq('inviter_id', params.inviterId)
      .eq('invitee_email', email)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !rows?.length) return;

    await this.updateStatus(rows[0].id, 'accepted');
  },

  /** Pending invites for the signed-in user's email (email invites only). */
  async getReceivedInvitations(email: string): Promise<(Invitation & { inviterName?: string })[]> {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return [];
    }

    const { data, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('invitee_email', normalized)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data?.length) {
      return [];
    }

    const inviterIds = [...new Set(data.map((row) => row.inviter_id as string))];
    const inviterNames = new Map<string, string>();
    await Promise.all(
      inviterIds.map(async (inviterId) => {
        const u = await userService.getById(inviterId);
        if (u?.name) {
          inviterNames.set(inviterId, u.name);
        }
      })
    );

    return data.map((inv) => ({
      id: inv.id,
      inviterId: inv.inviter_id,
      inviteeEmail: inv.invitee_email,
      inviteePhone: inv.invitee_phone || undefined,
      inviteeName: inv.invitee_name || undefined,
      status: inv.status,
      createdAt: new Date(inv.created_at).getTime(),
      expiresAt: new Date(inv.expires_at).getTime(),
      inviterName: inviterNames.get(inv.inviter_id),
    }));
  },

  /**
   * Remove invitation rows for this user pair so the inviter can send a new invite after unfriend.
   * Deletes (inviter_id=userId, invitee_email=friend's email) and the reverse.
   */
  async deleteInvitationsForRemovedFriendship(userId: string, friendId: string): Promise<void> {
    const [user, friend] = await Promise.all([
      userService.getById(userId),
      userService.getById(friendId),
    ]);
    const userEmail = normalizeEmail(user?.email);
    const friendEmail = normalizeEmail(friend?.email);

    if (friendEmail) {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('inviter_id', userId)
        .eq('invitee_email', friendEmail);
      if (error) throw error;
    }

    if (userEmail) {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('inviter_id', friendId)
        .eq('invitee_email', userEmail);
      if (error) throw error;
    }
  },
};
