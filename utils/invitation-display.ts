/**
 * Display helpers for sent invitations.
 * Keeps presentation logic out of route components so the Sent tab
 * always shows a name and/or email instead of a blank row.
 */

type SentInvitationInput = {
  inviteeName?: string | null;
  inviteeEmail?: string | null;
};

export function getSentInvitationDisplay(invitation: SentInvitationInput): {
  title: string;
  subtitle?: string;
} {
  const name = invitation.inviteeName?.trim();
  const email = invitation.inviteeEmail?.trim();

  if (name && email) return { title: name, subtitle: email };
  if (name) return { title: name, subtitle: undefined };
  if (email) return { title: 'Email invitation', subtitle: email };
  return { title: 'Invitation', subtitle: undefined };
}
