import type { RecurringExpenseRuleCommandResult, RecurringExpenseRuleInput } from '@/types/database';

export type DuplicateChoice = 'inspect' | 'create_another' | 'cancel';
export type RecurringSubmissionResult =
  | { status: 'offline' }
  | { status: 'in_progress' }
  | { status: 'cancelled' }
  | { status: 'inspect'; existingRuleId: string }
  | { status: 'created'; result: RecurringExpenseRuleCommandResult };

interface RecurringExpenseSubmissionDependencies {
  isOnline: () => Promise<boolean>;
  create: (rule: RecurringExpenseRuleInput, confirmDuplicate: boolean) => Promise<RecurringExpenseRuleCommandResult>;
}

/** Coordinates connectivity, duplicate confirmation, and single-flight submission for the Add Expense form. */
export function createRecurringExpenseSubmission({ isOnline, create }: RecurringExpenseSubmissionDependencies) {
  let saving = false;

  return {
    async save(rule: RecurringExpenseRuleInput, chooseDuplicate: (existingRuleId: string) => Promise<DuplicateChoice>): Promise<RecurringSubmissionResult> {
      if (saving) return { status: 'in_progress' };
      saving = true;
      try {
        if (!await isOnline()) return { status: 'offline' };

        let result = await create(rule, false);
        if (result.duplicateWarning && result.existingRuleId) {
          const choice = await chooseDuplicate(result.existingRuleId);
          if (choice === 'inspect') return { status: 'inspect', existingRuleId: result.existingRuleId };
          if (choice !== 'create_another') return { status: 'cancelled' };
          result = await create(rule, true);
          if (result.duplicateWarning && result.existingRuleId) {
            return { status: 'inspect', existingRuleId: result.existingRuleId };
          }
        }
        return { status: 'created', result };
      } finally {
        saving = false;
      }
    },
  };
}

export interface OccurrencePollingOptions {
  attempts?: number;
  intervalMs?: number;
  wait?: (durationMs: number) => Promise<void>;
}

/** Waits for the server-created row that confirms a due-today rule has posted. */
export async function waitForRecurringOccurrence(
  hasOccurrence: () => Promise<boolean>,
  { attempts = 20, intervalMs = 3_000, wait = durationMs => new Promise(resolve => setTimeout(resolve, durationMs)) }: OccurrencePollingOptions = {},
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await hasOccurrence()) return true;
    if (attempt < attempts - 1) await wait(intervalMs);
  }
  return false;
}
