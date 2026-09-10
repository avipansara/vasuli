import * as Linking from 'expo-linking';

/** AsyncStorage key: resume invite screen after OTP sign-in */
export const PENDING_INVITE_PATH_KEY = 'vasuli_pending_invite_path';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function parseInviteFromUrl(url: string): { inviterId: string; invitationId?: string } | null {
  const trimmed = url.trim();
  if (UUID_REGEX.test(trimmed)) {
    return { inviterId: trimmed };
  }

  try {
    const parsed = Linking.parse(trimmed);
    const path = parsed.path ?? '';
    const inviterMatch = path.match(/(?:^|\/)invite\/([^/?#]+)/);
    let inviterId = inviterMatch?.[1];

    if (!inviterId) {
      const rawMatch = trimmed.match(/(?:^|\/)invite\/([^/?#]+)/);
      inviterId = rawMatch?.[1];
    }

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
    const rawMatch = trimmed.match(/(?:^|\/)invite\/([^/?#]+)/);
    if (rawMatch?.[1]) {
      return { inviterId: rawMatch[1] };
    }
    return null;
  }
}

export function buildInvitePath(inviterId: string, invitationId?: string): string {
  if (invitationId) {
    return `/invite/${inviterId}?invitation=${encodeURIComponent(invitationId)}`;
  }
  return `/invite/${inviterId}`;
}
