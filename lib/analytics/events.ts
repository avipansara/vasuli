/**
 * Typed product-analytics taxonomy (phase one).
 *
 * Event names use lowercase `[object] [verb]`. Property contracts are
 * event-specific subsets of the approved dimensions so one event cannot
 * inherit unrelated properties.
 *
 * Prohibited everywhere: names, emails, phones, descriptions, notes, exact
 * amounts, raw group/user IDs, invitation/payment/settlement-operation IDs,
 * parameterized URLs, tokens, auth data, request/response bodies, raw errors.
 */

export const ANALYTICS_EVENT_NAMES = [
  'account created',
  'group created',
  'group joined',
  'invite sent',
  'invite accepted',
  'expense started',
  'expense created',
  'expense creation failed',
  'settlement started',
  'settlement created',
  'settlement creation failed',
  'group viewed',
  'app session started',
  'expense updated',
  'expense deleted',
  'settlement reversed',
  'settlement cancelled',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export type GroupSizeBucket = '2' | '3-5' | '6-10' | '11+';

export type ExpenseInputMethod = 'manual' | 'scan' | 'import';

export type ExpenseFailureCategory =
  | 'validation'
  | 'network'
  | 'permission'
  | 'conflict'
  | 'unknown';

export type SettlementFailureCategory = ExpenseFailureCategory;
export type InviteType = 'email' | 'friend_request';

export type AnalyticsPlatform = 'ios' | 'android' | 'web';

export interface AnalyticsBaseProperties {
  platform?: AnalyticsPlatform;
  app_version?: string;
  group_key?: string;
  group_size_bucket?: GroupSizeBucket;
}

export type AnalyticsEventPropertiesMap = {
  'account created': Pick<AnalyticsBaseProperties, 'platform' | 'app_version'>;
  'group created': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  >;
  'group joined': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  >;
  'invite sent': Pick<AnalyticsBaseProperties, 'platform' | 'app_version' | 'group_key'> & { invite_type: InviteType };
  'invite accepted': Pick<AnalyticsBaseProperties, 'platform' | 'app_version' | 'group_key'> & { invite_type: InviteType };
  'expense started': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  > & {
    expense_input_method?: ExpenseInputMethod;
  };
  'expense created': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  > & {
    expense_input_method?: ExpenseInputMethod;
    currency_code?: string;
  };
  'expense creation failed': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  > & {
    expense_input_method?: ExpenseInputMethod;
    failure_category?: ExpenseFailureCategory;
  };
  'settlement started': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  > & {
    currency_code?: string;
  };
  'settlement created': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  > & {
    currency_code?: string;
  };
  'settlement creation failed': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  > & { currency_code?: string; failure_category?: SettlementFailureCategory };
  'group viewed': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  >;
  'app session started': Pick<AnalyticsBaseProperties, 'platform' | 'app_version'>;
  'expense updated': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  > & { expense_input_method?: ExpenseInputMethod; currency_code?: string };
  'expense deleted': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  > & { currency_code?: string };
  'settlement reversed': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  > & { currency_code?: string };
  'settlement cancelled': Pick<
    AnalyticsBaseProperties,
    'platform' | 'app_version' | 'group_key' | 'group_size_bucket'
  > & { currency_code?: string };
};

export type AnalyticsEvent<N extends AnalyticsEventName = AnalyticsEventName> = {
  [K in N]: {
    event: K;
    properties: AnalyticsEventPropertiesMap[K];
  };
}[N];

const EVENT_PROPERTY_ALLOWLIST: Record<AnalyticsEventName, readonly string[]> = {
  'account created': ['platform', 'app_version'],
  'group created': ['platform', 'app_version', 'group_key', 'group_size_bucket'],
  'group joined': ['platform', 'app_version', 'group_key', 'group_size_bucket'],
  'invite sent': ['platform', 'app_version', 'group_key', 'invite_type'],
  'invite accepted': ['platform', 'app_version', 'group_key', 'invite_type'],
  'expense started': [
    'platform',
    'app_version',
    'group_key',
    'group_size_bucket',
    'expense_input_method',
  ],
  'expense created': [
    'platform',
    'app_version',
    'group_key',
    'group_size_bucket',
    'expense_input_method',
    'currency_code',
  ],
  'expense creation failed': [
    'platform',
    'app_version',
    'group_key',
    'group_size_bucket',
    'expense_input_method',
    'failure_category',
  ],
  'settlement started': [
    'platform',
    'app_version',
    'group_key',
    'group_size_bucket',
    'currency_code',
  ],
  'settlement created': [
    'platform',
    'app_version',
    'group_key',
    'group_size_bucket',
    'currency_code',
  ],
  'settlement creation failed': [
    'platform', 'app_version', 'group_key', 'group_size_bucket', 'currency_code', 'failure_category',
  ],
  'group viewed': ['platform', 'app_version', 'group_key', 'group_size_bucket'],
  'app session started': ['platform', 'app_version'],
  'expense updated': [
    'platform', 'app_version', 'group_key', 'group_size_bucket', 'expense_input_method', 'currency_code',
  ],
  'expense deleted': [
    'platform', 'app_version', 'group_key', 'group_size_bucket', 'currency_code',
  ],
  'settlement reversed': [
    'platform', 'app_version', 'group_key', 'group_size_bucket', 'currency_code',
  ],
  'settlement cancelled': [
    'platform', 'app_version', 'group_key', 'group_size_bucket', 'currency_code',
  ],
};

export function isKnownAnalyticsEvent(name: string): name is AnalyticsEventName {
  return (ANALYTICS_EVENT_NAMES as readonly string[]).includes(name);
}

export function allowedPropertiesForEvent(event: AnalyticsEventName): readonly string[] {
  return EVENT_PROPERTY_ALLOWLIST[event];
}

/** Release-context keys allowed on every outbound event (never null/stale). */
export const RELEASE_CONTEXT_KEYS = [
  'app_version',
  'platform',
  'eas_update_id',
  'eas_channel',
  'eas_runtime_version',
  'eas_project_id',
  'eas_account',
] as const;

/** Core product actions that define weekly active people. */
export const WEEKLY_ACTIVE_EVENTS: readonly AnalyticsEventName[] = [
  'account created',
  'group created',
  'group joined',
  'invite sent',
  'invite accepted',
  'expense created',
  'settlement created',
];

export function bucketGroupSize(memberCount: number | null | undefined): GroupSizeBucket | undefined {
  if (memberCount == null || !Number.isFinite(memberCount) || memberCount < 2) return undefined;
  if (memberCount === 2) return '2';
  if (memberCount <= 5) return '3-5';
  if (memberCount <= 10) return '6-10';
  return '11+';
}

export function normalizeCurrencyCode(currency: string | null | undefined): string | undefined {
  if (!currency) return undefined;
  const code = currency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : undefined;
}
