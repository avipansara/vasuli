import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';

type TableName = 'expenses' | 'expense_splits' | 'settlements' | 'groups' | 'group_members' | 'users';
type EventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions {
  table: TableName;
  event?: EventType;
  filter?: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  onChange?: (payload: any) => void;
  enabled?: boolean;
}

export function useRealtime({
  table,
  event = '*',
  filter,
  onInsert,
  onUpdate,
  onDelete,
  onChange,
  enabled = true,
}: UseRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Use refs for callbacks to prevent re-subscriptions when callback references change
  const onChangeRef = useRef(onChange);
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);

  // Keep refs updated with latest callbacks
  onChangeRef.current = onChange;
  onInsertRef.current = onInsert;
  onUpdateRef.current = onUpdate;
  onDeleteRef.current = onDelete;

  useEffect(() => {
    if (!enabled) return;

    // Use stable channel name based on table, event, and filter
    const channelName = `${table}-${event}-${filter || 'all'}`;

    let channel = supabase.channel(channelName);

    const config: any = {
      event,
      schema: 'public',
      table,
    };

    if (filter) {
      config.filter = filter;
    }

    channel = channel.on('postgres_changes', config, (payload) => {
      onChangeRef.current?.(payload);

      switch (payload.eventType) {
        case 'INSERT':
          onInsertRef.current?.(payload);
          break;
        case 'UPDATE':
          onUpdateRef.current?.(payload);
          break;
        case 'DELETE':
          onDeleteRef.current?.(payload);
          break;
      }
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] Subscribed to ${table}`);
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, event, filter, enabled]);  // Removed callback dependencies - using refs instead

  return channelRef.current;
}

export function useGroupExpensesRealtime(
  groupId: string | undefined,
  onExpenseChange: () => void,
  enabled: boolean = true
) {
  useRealtime({
    table: 'expenses',
    filter: groupId ? `group_id=eq.${groupId}` : undefined,
    onChange: onExpenseChange,
    enabled: enabled && !!groupId,
  });

  useRealtime({
    table: 'settlements',
    filter: groupId ? `group_id=eq.${groupId}` : undefined,
    onChange: onExpenseChange,
    enabled: enabled && !!groupId,
  });
}

export function useFriendExpensesRealtime(
  userId: string | undefined,
  onExpenseChange: () => void,
  enabled: boolean = true
) {
  useRealtime({
    table: 'expense_splits',
    filter: userId ? `user_id=eq.${userId}` : undefined,
    onChange: onExpenseChange,
    enabled: enabled && !!userId,
  });

  useRealtime({
    table: 'settlements',
    onChange: onExpenseChange,
    enabled: enabled && !!userId,
  });
}
