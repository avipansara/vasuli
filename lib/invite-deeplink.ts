import * as Linking from 'expo-linking';

/** AsyncStorage key: resume invite screen after OTP sign-in */
export const PENDING_INVITE_PATH_KEY = 'vasuli_pending_invite_path';

export function parseInviteFromUrl(url: string): { inviterId: string; invitationId?: string } | null {
  try {
    const parsed = Linking.parse(url);
    const path = parsed.path ?? '';
    const inviterMatch = path.match(/(?:^|\/)invite\/([^/?]+)/);
    const inviterId = inviterMatch?.[1];
    if (!inviterId) {
      return null;
    }
    const invitation = parsed.queryParams?.invitation;
    const invitationId =
      typeof invitation === 'string'
        ? invitation
        : Array.isArray(invitation)
          ? invitation[0]
          : undefined;
    return { inviterId, invitationId };
  } catch {
    return null;
  }
}

export function buildInvitePath(inviterId: string, invitationId?: string): string {
  if (invitationId) {
    return `/invite/${inviterId}?invitation=${encodeURIComponent(invitationId)}`;
  }
  return `/invite/${inviterId}`;
}
