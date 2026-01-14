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

  useEffect(() => {
    if (!enabled) return;

    const channelName = `${table}-${filter || 'all'}-${Date.now()}`;
    
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
      onChange?.(payload);
      
      switch (payload.eventType) {
        case 'INSERT':
          onInsert?.(payload);
          break;
        case 'UPDATE':
          onUpdate?.(payload);
          break;
        case 'DELETE':
          onDelete?.(payload);
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
  }, [table, event, filter, enabled, onChange, onInsert, onUpdate, onDelete]);

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
