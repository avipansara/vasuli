import type { AnalyticsService } from '@/services/analytics-service';
import {
  bucketGroupSize,
  normalizeCurrencyCode,
  type ExpenseInputMethod,
  type InviteType,
} from '@/lib/analytics/events';

/**
 * Small tracking helpers shared by screens. Every helper is best-effort:
 * failures are invisible to product operations and no caller awaits them in
 * a critical path.
 */

export const MANUAL_EXPENSE_INPUT: ExpenseInputMethod = 'manual';

export function trackAppSessionStarted(service: AnalyticsService): void {
  fire(service.trackAppSessionStarted());
}

async function groupProps(
  service: AnalyticsService,
  groupId?: string | null,
  memberCount?: number | null,
): Promise<{ group_key?: string; group_size_bucket?: '2' | '3-5' | '6-10' | '11+' }> {
  const props: { group_key?: string; group_size_bucket?: '2' | '3-5' | '6-10' | '11+' } = {};
  if (groupId) {
    const key = await service.groupKey(groupId);
    if (key) props.group_key = key;
  }
  const bucket = bucketGroupSize(memberCount ?? undefined);
  if (bucket) props.group_size_bucket = bucket;
  return props;
}

function fire(promise: Promise<unknown>): void {
  promise.catch(() => undefined);
}

export function trackGroupCreated(
  service: AnalyticsService,
  params: { groupId: string; memberCount?: number | null },
): void {
  fire(
    (async () => {
      await service.track('group created', await groupProps(service, params.groupId, params.memberCount));
    })(),
  );
}

export function trackGroupJoined(
  service: AnalyticsService,
  params: { groupId?: string | null; memberCount?: number | null },
): void {
  fire(
    (async () => {
      await service.track('group joined', await groupProps(service, params.groupId, params.memberCount));
    })(),
  );
}

export function trackInviteSent(service: AnalyticsService, inviteType: InviteType): void {
  fire(service.track('invite sent', { invite_type: inviteType }));
}

export function trackInviteAccepted(service: AnalyticsService, inviteType: InviteType): void {
  fire(service.track('invite accepted', { invite_type: inviteType }));
}

export function trackExpenseStarted(
  service: AnalyticsService,
  params: {
    groupId?: string | null;
    memberCount?: number | null;
    inputMethod?: ExpenseInputMethod;
  } = {},
): void {
  fire(
    (async () => {
      await service.track('expense started', {
        ...(await groupProps(service, params.groupId, params.memberCount)),
        expense_input_method: params.inputMethod ?? MANUAL_EXPENSE_INPUT,
      });
    })(),
  );
}

export function trackExpenseCreated(
  service: AnalyticsService,
  params: {
    groupId?: string | null;
    memberCount?: number | null;
    inputMethod?: ExpenseInputMethod;
    currency?: string | null;
  } = {},
): void {
  fire(
    (async () => {
      const currency_code = normalizeCurrencyCode(params.currency ?? undefined);
      await service.track('expense created', {
        ...(await groupProps(service, params.groupId, params.memberCount)),
        expense_input_method: params.inputMethod ?? MANUAL_EXPENSE_INPUT,
        ...(currency_code ? { currency_code } : {}),
      });
    })(),
  );
}

export function trackExpenseCreationFailed(
  service: AnalyticsService,
  params: {
    groupId?: string | null;
    memberCount?: number | null;
    inputMethod?: ExpenseInputMethod;
    error?: unknown;
  } = {},
): void {
  fire(
    (async () => {
      const { categorizeExpenseFailure } = await import('@/services/analytics-service');
      await service.track('expense creation failed', {
        ...(await groupProps(service, params.groupId, params.memberCount)),
        expense_input_method: params.inputMethod ?? MANUAL_EXPENSE_INPUT,
        failure_category: categorizeExpenseFailure(params.error),
      });
    })(),
  );
}

export function trackExpenseUpdated(
  service: AnalyticsService,
  params: {
    groupId?: string | null;
    memberCount?: number | null;
    inputMethod?: ExpenseInputMethod;
    currency?: string | null;
  } = {},
): void {
  fire(
    (async () => {
      const currency_code = normalizeCurrencyCode(params.currency ?? undefined);
      await service.track('expense updated', {
        ...(await groupProps(service, params.groupId, params.memberCount)),
        expense_input_method: params.inputMethod ?? MANUAL_EXPENSE_INPUT,
        ...(currency_code ? { currency_code } : {}),
      });
    })(),
  );
}

export function trackExpenseDeleted(
  service: AnalyticsService,
  params: {
    groupId?: string | null;
    memberCount?: number | null;
    currency?: string | null;
  } = {},
): void {
  fire(
    (async () => {
      const currency_code = normalizeCurrencyCode(params.currency ?? undefined);
      await service.track('expense deleted', {
        ...(await groupProps(service, params.groupId, params.memberCount)),
        ...(currency_code ? { currency_code } : {}),
      });
    })(),
  );
}

export function trackSettlementStarted(
  service: AnalyticsService,
  params: { groupId?: string | null; memberCount?: number | null; currency?: string | null } = {},
): void {
  fire(
    (async () => {
      const currency_code = normalizeCurrencyCode(params.currency ?? undefined);
      await service.track('settlement started', {
        ...(await groupProps(service, params.groupId, params.memberCount)),
        ...(currency_code ? { currency_code } : {}),
      });
    })(),
  );
}

export function trackSettlementCreated(
  service: AnalyticsService,
  params: { groupId?: string | null; memberCount?: number | null; currency?: string | null } = {},
): void {
  fire(
    (async () => {
      const currency_code = normalizeCurrencyCode(params.currency ?? undefined);
      await service.track('settlement created', {
        ...(await groupProps(service, params.groupId, params.memberCount)),
        ...(currency_code ? { currency_code } : {}),
      });
    })(),
  );
}

export function trackSettlementCreationFailed(
  service: AnalyticsService,
  params: { groupId?: string | null; memberCount?: number | null; currency?: string | null; error?: unknown } = {},
): void {
  fire(
    (async () => {
      const { categorizeExpenseFailure } = await import('@/services/analytics-service');
      const currency_code = normalizeCurrencyCode(params.currency ?? undefined);
      await service.track('settlement creation failed', {
        ...(await groupProps(service, params.groupId, params.memberCount)),
        ...(currency_code ? { currency_code } : {}),
        failure_category: categorizeExpenseFailure(params.error),
      });
    })(),
  );
}

export function trackSettlementReversed(
  service: AnalyticsService,
  params: { groupId?: string | null; memberCount?: number | null; currency?: string | null } = {},
): void {
  fire(
    (async () => {
      const currency_code = normalizeCurrencyCode(params.currency ?? undefined);
      await service.track('settlement reversed', {
        ...(await groupProps(service, params.groupId, params.memberCount)),
        ...(currency_code ? { currency_code } : {}),
      });
    })(),
  );
}

export function trackSettlementCancelled(
  service: AnalyticsService,
  params: { groupId?: string | null; memberCount?: number | null; currency?: string | null } = {},
): void {
  fire(
    (async () => {
      const currency_code = normalizeCurrencyCode(params.currency ?? undefined);
      await service.track('settlement cancelled', {
        ...(await groupProps(service, params.groupId, params.memberCount)),
        ...(currency_code ? { currency_code } : {}),
      });
    })(),
  );
}

export function trackGroupViewed(
  service: AnalyticsService,
  params: { groupId: string; memberCount?: number | null },
): void {
  fire(
    (async () => {
      await service.track('group viewed', await groupProps(service, params.groupId, params.memberCount));
    })(),
  );
}
