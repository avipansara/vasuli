import { useAuth } from '@/contexts/auth-context-otp';
import { useRealtime } from '@/hooks/use-realtime';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { friendshipService } from '@/services/friendship-service';
import { invitationService } from '@/services/invitation-service';
import { queryKeys } from '@/services/query-keys';
import { getPendingInvitationCount } from '@/utils/invitation-count';
import { normalizeEmail } from '@/utils/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

export function usePendingInvitationsCount() {
  const { user } = useAuth();
  const currentUserId = user?.id || '';
  const normalizedEmail = normalizeEmail(user?.email);
  const queryClient = useQueryClient();

  const pendingInvitationQueryKey = useMemo(
    () => queryKeys.invitations.pendingCount(currentUserId, normalizedEmail || ''),
    [currentUserId, normalizedEmail]
  );

  const {
    data: pendingInvitationCountData,
    isFetching,
    isStale,
    refetch,
  } = useQuery({
    queryKey: pendingInvitationQueryKey,
    enabled: !!currentUserId,
    queryFn: async () => {
      const [friendRequests, emailInvitations] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: queryKeys.invitations.friendRequests(currentUserId),
          queryFn: () => friendshipService.getPendingRequests(currentUserId),
        }),
        normalizedEmail
          ? queryClient.fetchQuery({
              queryKey: queryKeys.invitations.received(currentUserId, normalizedEmail),
              queryFn: () => invitationService.getReceivedInvitations(normalizedEmail),
            })
          : Promise.resolve([]),
      ]);
      return getPendingInvitationCount(friendRequests.length, emailInvitations.length);
    },
  });

  const pendingInvitationCount = pendingInvitationCountData ?? 0;

  useRefetchOnFocus({
    enabled: !!currentUserId,
    isFetching,
    isStale,
    refetch,
  });

  const invalidateInvitationCount = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['invitations'] });
  }, [queryClient]);

  useRealtime({
    table: 'invitations',
    filter: normalizedEmail ? `invitee_email=eq.${normalizedEmail}` : undefined,
    onChange: invalidateInvitationCount,
    enabled: !!normalizedEmail,
  });

  useRealtime({
    table: 'friendships',
    filter: currentUserId ? `user_id_2=eq.${currentUserId}` : undefined,
    onChange: invalidateInvitationCount,
    enabled: !!currentUserId,
  });

  return {
    pendingInvitationCount,
    refetch,
  };
}
