import { useDebouncedQueryInvalidation } from '@/hooks/use-debounced-query-invalidation';
import { useRealtime } from '@/hooks/use-realtime';
import { friendDetailModule } from '@/services/friend-detail-module';
import { queryKeys } from '@/services/query-keys';
import type { FriendDetailData, FriendRelationshipProjection } from '@/services/friend-detail-service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

type FriendDetailControllerParams = {
  currentUserId: string;
  friendId: string;
};

export function useFriendDetailController({
  currentUserId,
  friendId,
}: FriendDetailControllerParams) {
  const queryClient = useQueryClient();
  const friendsHomeQueryKey = useMemo(() => queryKeys.friends.home(currentUserId), [currentUserId]);
  const friendDetailQueryKey = useMemo(
    () => queryKeys.friends.detail(currentUserId, friendId),
    [currentUserId, friendId]
  );
  const invalidateFriendDetail = useDebouncedQueryInvalidation(friendDetailQueryKey, 500);

  const query = useQuery({
    queryKey: friendDetailQueryKey,
    enabled: !!currentUserId && !!friendId,
    queryFn: () => friendDetailModule.getDetail(currentUserId, friendId),
  });

  useRealtime({
    table: 'expenses',
    filter: currentUserId ? `paid_by=eq.${currentUserId}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!friendId,
  });
  useRealtime({
    table: 'expenses',
    filter: friendId ? `paid_by=eq.${friendId}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!friendId,
  });
  useRealtime({
    table: 'expense_splits',
    filter: currentUserId ? `user_id=eq.${currentUserId}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!friendId,
  });
  useRealtime({
    table: 'expense_splits',
    filter: friendId ? `user_id=eq.${friendId}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!friendId,
  });
  useRealtime({
    table: 'settlements',
    filter: currentUserId ? `from_user_id=eq.${currentUserId}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!friendId,
  });
  useRealtime({
    table: 'settlements',
    filter: currentUserId ? `to_user_id=eq.${currentUserId}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!friendId,
  });
  useRealtime({
    table: 'settlements',
    filter: friendId ? `from_user_id=eq.${friendId}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!friendId,
  });
  useRealtime({
    table: 'settlements',
    filter: friendId ? `to_user_id=eq.${friendId}` : undefined,
    onChange: invalidateFriendDetail,
    enabled: !!currentUserId && !!friendId,
  });

  return {
    ...query,
    friend: query.data?.friend ?? null,
    expenses: query.data?.expenses ?? [],
    activity: query.data?.activity ?? [],
    groupBalances: query.data?.groupBalances ?? [],
    relationship: query.data?.relationship ?? null,
    friendDetailQueryKey,
    friendsHomeQueryKey,
    queryClient,
    invalidateFriendDetail,
  } satisfies {
    data: FriendDetailData | null | undefined;
    friend: FriendDetailData['friend'] | null;
    expenses: FriendDetailData['expenses'];
    activity: FriendDetailData['activity'];
    groupBalances: NonNullable<FriendDetailData['groupBalances']>;
    relationship: FriendRelationshipProjection | null;
    friendDetailQueryKey: typeof friendDetailQueryKey;
    friendsHomeQueryKey: typeof friendsHomeQueryKey;
    queryClient: typeof queryClient;
    invalidateFriendDetail: typeof invalidateFriendDetail;
  };
}
