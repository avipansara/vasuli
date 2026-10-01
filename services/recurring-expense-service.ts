import { supabase } from '@/lib/supabase';
import { linkAuthUserToProfile } from '@/services/auth-profile-service';
import type {
  Expense,
  RecurringExpenseRule,
  RecurringExpenseRuleCommandResult,
  RecurringExpenseRuleInput,
} from '@/types/database';

type RpcError = { code?: string; message?: string; details?: string; hint?: string };

export type RecurringExpenseErrorKind =
  | 'offline'
  | 'stale_rule'
  | 'invalid_participant'
  | 'already_posted_date'
  | 'permission'
  | 'validation'
  | 'unknown';

export class RecurringExpenseError extends Error {
  constructor(
    readonly kind: RecurringExpenseErrorKind,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'RecurringExpenseError';
  }

  get userMessage(): string {
    switch (this.kind) {
      case 'offline': return 'You appear to be offline. Reconnect and try again.';
      case 'stale_rule': return 'This recurring expense changed. Refresh it and review the latest schedule.';
      case 'invalid_participant': return 'A participant is no longer eligible. Review the people in this recurring expense.';
      case 'already_posted_date': return 'That date has already posted. Edit the posted expense from its details.';
      case 'permission': return 'Only the owner can change this recurring expense.';
      case 'validation': return 'Some recurring expense details are no longer valid. Review them and try again.';
      default: return 'Could not update the recurring expense. Try again.';
    }
  }
}

type RecurringRpcClient = {
  auth: typeof supabase.auth;
  from: typeof supabase.from;
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapRule(value: unknown): RecurringExpenseRule {
  const row = object(value);
  if (!row) throw new RecurringExpenseError('unknown', 'The recurring expense response was invalid.');
  const requiredStrings = ['id', 'scope_type', 'description', 'currency', 'paid_by', 'split_method',
    'split_type', 'cadence', 'time_zone', 'first_due_on', 'status', 'created_at', 'updated_at'];
  if (requiredStrings.some(key => !string(row[key])) || number(row.amount) === undefined || number(row.anchor_day) === undefined) {
    throw new RecurringExpenseError('unknown', 'The recurring expense response was incomplete.');
  }
  const rawParticipants = Array.isArray(row.participants) ? row.participants : [];
  const participants = rawParticipants.map(raw => {
    const participant = object(raw);
    const userId = string(participant?.user_id);
    const shareAmount = number(participant?.share_amount);
    if (!participant || !userId || shareAmount === undefined) {
      throw new RecurringExpenseError('unknown', 'The recurring expense participant response was invalid.');
    }
    const percentage = number(participant.percentage);
    return { userId, shareAmount, ...(percentage !== undefined ? { percentage } : {}) };
  });
  const ownerId = string(row.owner_id);
  const groupId = string(row.group_id);
  const nextDueOn = string(row.next_due_on);
  const lastDueOn = string(row.last_due_on);
  const pausedReason = string(row.paused_reason);
  return {
    id: row.id as string,
    ...(ownerId ? { ownerId } : {}),
    scopeType: row.scope_type as RecurringExpenseRule['scopeType'],
    ...(groupId ? { groupId } : {}),
    description: row.description as string,
    amount: row.amount as number,
    currency: row.currency as string,
    paidBy: row.paid_by as string,
    splitMethod: row.split_method as RecurringExpenseRule['splitMethod'],
    splitType: row.split_type as RecurringExpenseRule['splitType'],
    cadence: row.cadence as RecurringExpenseRule['cadence'],
    anchorDay: row.anchor_day as number,
    timeZone: row.time_zone as string,
    firstDueOn: row.first_due_on as string,
    ...(nextDueOn ? { nextDueOn } : {}),
    ...(lastDueOn ? { lastDueOn } : {}),
    status: row.status as RecurringExpenseRule['status'],
    ...(pausedReason ? { pausedReason } : {}),
    createdAt: Date.parse(row.created_at as string),
    updatedAt: Date.parse(row.updated_at as string),
    participants,
  };
}

function mapCommandResult(value: unknown): RecurringExpenseRuleCommandResult {
  const row = object(value);
  const resolvedRuleId = string(row?.rule_id) ?? string(row?.existing_rule_id);
  if (!row || !resolvedRuleId) {
    throw new RecurringExpenseError('unknown', 'The recurring expense command response was invalid.');
  }
  return {
    ruleId: resolvedRuleId,
    ...(string(row.status) ? { status: row.status as RecurringExpenseRuleCommandResult['status'] } : {}),
    ...(string(row.next_due_on) ? { nextDueOn: row.next_due_on as string } : {}),
    ...(string(row.applies_from) ? { appliesFrom: row.applies_from as string } : {}),
    ...(string(row.expense_id) ? { expenseId: row.expense_id as string } : {}),
    ...(row.action === 'post' || row.action === 'skip' ? { action: row.action } : {}),
    ...(typeof row.material_change === 'boolean' ? { materialChange: row.material_change } : {}),
    ...(typeof row.duplicate_warning === 'boolean' ? { duplicateWarning: row.duplicate_warning } : {}),
    ...(string(row.existing_rule_id) ? { existingRuleId: row.existing_rule_id as string } : {}),
    ...(typeof row.already_reviewed === 'boolean' ? { alreadyReviewed: row.already_reviewed } : {}),
    ...(typeof row.stale_expected_date === 'boolean' ? { staleExpectedDate: row.stale_expected_date } : {}),
    ...(string(row.last_posted_due_on) ? { lastPostedDueOn: row.last_posted_due_on as string } : {}),
    ...(string(row.stopped_after_due_on) ? { stoppedAfterDueOn: row.stopped_after_due_on as string } : {}),
    ...(string(row.reason) ? { reason: row.reason as string } : {}),
    ...(Object.hasOwn(row, 'reviewed') ? { reviewed: string(row.reviewed) ?? null } : {}),
    ...(string(row.reason) ? { reviewOutcome: 'needs_repair' } : {}),
    ...(row.already_reviewed === true ? { reviewOutcome: 'already_reviewed' } : {}),
    ...(row.stale_expected_date === true ? { reviewOutcome: 'stale' } : {}),
    ...(string(row.reviewed) ? { reviewOutcome: 'reviewed' } : {}),
  };
}

function mapRpcError(error: RpcError | null, thrown?: unknown): RecurringExpenseError {
  const message = error?.message || (thrown instanceof Error ? thrown.message : 'Request failed');
  const lower = message.toLowerCase();
  const code = error?.code;
  if (thrown instanceof TypeError || /failed to fetch|network|offline|connection/i.test(message)) {
    return new RecurringExpenseError('offline', message, code);
  }
  if (/stale|changed since|expected date/i.test(lower) || code === 'P0002') {
    return new RecurringExpenseError('stale_rule', message, code);
  }
  if (/already posted|already exists|already reviewed/i.test(lower) || code === '23505') {
    return new RecurringExpenseError('already_posted_date', message, code);
  }
  if (/participant|friendship|group member|member of the selected group/i.test(lower) || code === '23514') {
    return new RecurringExpenseError('invalid_participant', message, code);
  }
  if (code === '42501' || /owner access required|owner must be the payer|permission denied/i.test(lower)) {
    return new RecurringExpenseError('permission', message, code);
  }
  if (code === '22023') return new RecurringExpenseError('validation', message, code);
  return new RecurringExpenseError('unknown', message, code);
}

async function ensureOwnerSession(client: RecurringRpcClient, expectedAppUserId: string): Promise<void> {
  try {
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    const authUser = session?.user;
    if (!authUser?.id || !authUser.email) {
      throw new RecurringExpenseError('permission', 'A signed-in session is required.');
    }
    const { user: profile } = await linkAuthUserToProfile({
      authUserId: authUser.id,
      email: authUser.email,
      name: typeof authUser.user_metadata?.name === 'string' ? authUser.user_metadata.name : undefined,
    });
    if (profile.id !== expectedAppUserId) {
      throw new RecurringExpenseError('permission', 'The signed-in account does not match the current app user.');
    }
  } catch (error) {
    if (error instanceof RecurringExpenseError) throw error;
    throw mapRpcError(null, error);
  }
}

function rulePayload(input: RecurringExpenseRuleInput) {
  return {
    scope_type: input.scopeType,
    group_id: input.groupId ?? null,
    description: input.description,
    amount: input.amount,
    currency: input.currency,
    paid_by: input.paidBy,
    split_method: input.splitMethod,
    split_type: input.splitType,
    cadence: input.cadence,
    anchor_day: input.anchorDay,
    time_zone: input.timeZone,
    first_due_on: input.firstDueOn,
    last_due_on: input.lastDueOn ?? null,
  };
}

function participantPayload(input: RecurringExpenseRuleInput) {
  return input.participants.map(participant => ({
    user_id: participant.userId,
    share_amount: participant.shareAmount,
    percentage: participant.percentage ?? null,
  }));
}

export function createRecurringExpenseService(client: RecurringRpcClient = supabase) {
  async function rpc(name: string, args?: Record<string, unknown>) {
    try {
      const { data, error } = await client.rpc(name, args);
      if (error) throw mapRpcError(error);
      return data;
    } catch (error) {
      if (error instanceof RecurringExpenseError) throw error;
      throw mapRpcError(null, error);
    }
  }

  async function attachOwnerDiagnostics(rules: RecurringExpenseRule[]): Promise<RecurringExpenseRule[]> {
    const ownerIds = rules.filter(rule => rule.ownerId).map(rule => rule.id);
    if (ownerIds.length === 0) return rules;
    try {
      // Direct table reads are filtered by the table's owner-only RLS policy.
      // Never request diagnostic columns for shared participant rules.
      const { data, error } = await client.from('recurring_expense_rules')
        .select('id,last_error,last_error_at')
        .in('id', ownerIds);
      if (error) throw error;
      const diagnostics = new Map((data ?? []).map(row => [row.id, row]));
      if (ownerIds.some(id => !diagnostics.has(id))) {
        throw new RecurringExpenseError('stale_rule', 'Could not confirm the latest owner posting diagnostics. Refresh the rule.');
      }
      return rules.map(rule => {
        if (!rule.ownerId) return rule;
        const diagnostic = diagnostics.get(rule.id);
        return {
          ...rule,
          ...(diagnostic?.last_error ? { lastError: diagnostic.last_error } : {}),
          ...(diagnostic?.last_error_at ? { lastErrorAt: Date.parse(diagnostic.last_error_at) } : {}),
        };
      });
    } catch (error) {
      throw error instanceof RecurringExpenseError ? error : mapRpcError(null, error);
    }
  }

  return {
    async create(ownerId: string, rule: RecurringExpenseRuleInput, confirmDuplicate = false) {
      await ensureOwnerSession(client, ownerId);
      const result = mapCommandResult(await rpc('create_recurring_expense_rule', {
        p_rule: rulePayload(rule), p_participants: participantPayload(rule), p_confirm_duplicate: confirmDuplicate,
      }));
      return result;
    },
    async list(): Promise<RecurringExpenseRule[]> {
      const data = await rpc('list_recurring_expense_rules');
      if (!Array.isArray(data)) throw new RecurringExpenseError('unknown', 'The recurring expense list response was invalid.');
      return attachOwnerDiagnostics(data.map(mapRule));
    },
    async listOwned(ownerId: string): Promise<RecurringExpenseRule[]> {
      return (await this.list()).filter(rule => rule.ownerId === ownerId);
    },
    async listShared(ownerId: string): Promise<RecurringExpenseRule[]> {
      return (await this.list()).filter(rule => rule.ownerId !== ownerId);
    },
    async get(id: string): Promise<RecurringExpenseRule | null> {
      const data = await rpc('get_recurring_expense_rule', { p_rule_id: id });
      if (data === null) return null;
      return (await attachOwnerDiagnostics([mapRule(data)]))[0];
    },
    async getRecentOccurrences(ruleId: string, limit = 5): Promise<Expense[]> {
      const { data, error } = await client.from('expenses')
        .select('*')
        .eq('recurring_rule_id', ruleId)
        .is('deleted_at', null)
        .order('scheduled_for', { ascending: false })
        .limit(limit);
      if (error) throw mapRpcError(error);
      const { mapExpenseRow } = await import('@/services/database-row-mappers');
      return (data ?? []).map(mapExpenseRow);
    },
    async edit(ownerId: string, id: string, rule: RecurringExpenseRuleInput) {
      await ensureOwnerSession(client, ownerId);
      return mapCommandResult(await rpc('edit_recurring_expense_rule', {
        p_rule_id: id, p_rule: rulePayload(rule), p_participants: participantPayload(rule),
      }));
    },
    async pause(ownerId: string, id: string) {
      await ensureOwnerSession(client, ownerId);
      return mapCommandResult(await rpc('pause_recurring_expense_rule', { p_rule_id: id }));
    },
    async resume(ownerId: string, id: string) {
      await ensureOwnerSession(client, ownerId);
      return mapCommandResult(await rpc('resume_recurring_expense_rule', { p_rule_id: id }));
    },
    async stop(ownerId: string, id: string) {
      await ensureOwnerSession(client, ownerId);
      return mapCommandResult(await rpc('stop_recurring_expense_rule', { p_rule_id: id }));
    },
    async reviewMissedDate(ownerId: string, id: string, expectedDueOn: string, action: 'post' | 'skip') {
      await ensureOwnerSession(client, ownerId);
      const result = mapCommandResult(await rpc('review_recurring_expense_date', {
        p_rule_id: id, p_expected_due_on: expectedDueOn, p_action: action,
      }));
      return result;
    },
  };
}

export const recurringExpenseService = createRecurringExpenseService();
