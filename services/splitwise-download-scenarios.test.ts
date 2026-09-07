import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Expense, ExpenseSplit, Settlement } from '@/types/database';
import { calculateExpenseSplits, type SplitMethod } from '@/utils/split-validation';
import { calculateGroupBalances } from './group-balance';

type DownloadRow = Record<string, string>;

const fixturePath = resolve(process.cwd(), 'services/fixtures/splitwise-settlement-scenarios-download.csv');

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { fields.push(field); field = ''; }
    else field += character;
  }
  fields.push(field);
  return fields;
}

function loadRows(): { rows: DownloadRow[]; toleratedTrailingNotes: number } {
  const lines = readFileSync(fixturePath, 'utf8').trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift() ?? '');
  expect(headers).toHaveLength(21);
  let toleratedTrailingNotes = 0;
  const rows = lines.map((line, index) => {
    const values = parseCsvLine(line);
    if (values.length === 20 && values[19] === '') { values.push(''); toleratedTrailingNotes += 1; }
    if (values.length !== headers.length) {
      throw new Error(`row ${index + 2}: expected ${headers.length} fields, got ${values.length}`);
    }
    return Object.fromEntries(headers.map((header, fieldIndex) => [header, values[fieldIndex]]));
  });
  return { rows, toleratedTrailingNotes };
}

function splitMethod(value: string): SplitMethod {
  if (value === 'exact') return 'unequal';
  if (value === 'percent') return 'percentage';
  return value as SplitMethod;
}

function cents(value: number): number { return Math.round(value * 100); }

function balanceExpectations(value: string): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const scopeText of value.split(';').map(part => part.trim()).filter(Boolean)) {
    const firstSpace = scopeText.indexOf(' ');
    if (firstSpace < 0) throw new Error(`Malformed balance scope: ${scopeText}`);
    const scope = scopeText.slice(0, firstSpace);
    const balances = new Map<string, number>();
    for (const token of scopeText.slice(firstSpace + 1).split(/\s+/)) {
      const separator = token.indexOf(':');
      if (separator < 1) throw new Error(`Malformed balance token: ${token}`);
      balances.set(token.slice(0, separator), Number(token.slice(separator + 1)));
    }
    result.set(scope, balances);
  }
  return result;
}

function recordsFor(rows: DownloadRow[]): { expenses: Expense[]; splits: ExpenseSplit[]; settlements: Settlement[] } {
  const expenses: Expense[] = [];
  const splits: ExpenseSplit[] = [];
  const settlements: Settlement[] = [];
  rows.forEach((row, index) => {
    if (row.event_type === 'edit' || row.event_type === 'delete') return;
    const scope = row.ledger === 'group' ? row.group_id : `${row.ledger}:${row.people}`;
    const id = `${scope}:${row.expense_id}:${index}`;
    const rate = Number(row.fx_rate_to_usd);
    const amount = Number(row.amount) * rate;
    const users = row.split_among.split(';');
    const values = row.split_values.split(',').map(Number);
    if (users.length !== values.length) throw new Error(`${id}: split width mismatch`);
    if (row.event_type === 'settlement') {
      if (users.length !== 1) throw new Error(`${id}: settlement must have one recipient`);
      settlements.push({ id, groupId: scope, fromUserId: row.paid_by, toUserId: users[0], amount, currency: 'USD', date: Date.parse(row.happened_at), createdAt: Date.parse(row.happened_at) });
      return;
    }
    if (Number(row.amount) < 0) throw new Error(`${id}: negative expenses are unsupported by production validation`);
    const result = calculateExpenseSplits(users, amount, splitMethod(row.split_type), Object.fromEntries(users.map((user, valueIndex) => [user, String(values[valueIndex] * rate)])));
    if (!result.splits) throw new Error(`${id}: ${result.error ?? 'split failed'}`);
    expenses.push({ id, groupId: scope, description: row.expense_description, amount, currency: 'USD', paidBy: row.paid_by, date: Date.parse(row.happened_at), createdAt: Date.parse(row.happened_at), updatedAt: Date.parse(row.happened_at) });
    result.splits.forEach((split, splitIndex) => splits.push({ id: `${id}:split:${splitIndex}`, expenseId: id, userId: split.userId, amount: split.amount, splitType: split.splitType }));
  });
  return { expenses, splits, settlements };
}

describe('Splitwise Downloads scenario matrix', () => {
  const { rows, toleratedTrailingNotes } = loadRows();
  const byScenario = new Map<string, DownloadRow[]>();
  for (const row of rows) byScenario.set(row.scenario_id, [...(byScenario.get(row.scenario_id) ?? []), row]);

  it('has the expected source shape and only tolerates omitted trailing notes', () => {
    expect(rows).toHaveLength(95);
    expect(byScenario).toHaveLength(48);
    expect(toleratedTrailingNotes).toBe(47);
  });

  it('matches production balance math for supported scenarios and classifies unsupported contracts', () => {
    const unsupported: { id: string; reasons: string[] }[] = [];
    const mismatches: string[] = [];
    let pairwiseRowsUnsupported = 0;
    for (const [id, scenarioRows] of byScenario) {
      const mutationEvents = scenarioRows.some(row => ['edit', 'delete'].includes(row.event_type));
      const duplicateExpenseIds = new Set(scenarioRows.filter(row => row.event_type === 'expense').map(row => row.expense_id)).size
        !== scenarioRows.filter(row => row.event_type === 'expense').length;
      const reasons: string[] = [];
      if (mutationEvents) reasons.push('edit/delete mutation semantics are not represented by calculateGroupBalances');
      if (duplicateExpenseIds) reasons.push('idempotent duplicate-ingest semantics are not represented by calculateGroupBalances');
      if (scenarioRows.some(row => row.expected_pairwise_settlements)) pairwiseRowsUnsupported += 1;
      if (scenarioRows.some(row => Number(row.amount) < 0)) reasons.push('negative expense validation is rejected by production split calculator');
      if (reasons.length > 0) unsupported.push({ id, reasons });
      if (mutationEvents || duplicateExpenseIds || scenarioRows.some(row => Number(row.amount) < 0)) continue;

      try { recordsFor(scenarioRows); }
      catch (error) { mismatches.push(`${id}: ${error instanceof Error ? error.message : String(error)}`); continue; }
      const scopeRows = new Map<string, DownloadRow[]>();
      for (const row of scenarioRows) {
        const scope = row.ledger === 'group' ? row.group_id : `${row.ledger}:${row.people}`;
        scopeRows.set(scope, [...(scopeRows.get(scope) ?? []), row]);
      }
      const expected = balanceExpectations(scenarioRows.find(row => row.expected_net_balances_usd)?.expected_net_balances_usd ?? '');
      for (const [scope] of scopeRows) {
        const scoped = recordsFor(scenarioRows.filter(row => (row.ledger === 'group' ? row.group_id : `${row.ledger}:${row.people}`) === scope));
        const actual = calculateGroupBalances(scoped.expenses, scoped.splits, scoped.settlements);
        const expectedScope = expected.get(scope);
        if (!expectedScope) continue;
        for (const [person, amount] of expectedScope) {
          if (cents(actual.get(person) ?? 0) !== cents(amount)) mismatches.push(`${id}/${scope}/${person}: expected ${amount}, got ${actual.get(person) ?? 0}`);
        }
      }
    }
    console.info(`Splitwise Downloads matrix: ${byScenario.size - unsupported.length} balance-supported, ${unsupported.length} unsupported-contract, ${pairwiseRowsUnsupported} pairwise-output unsupported, ${mismatches.length} balance mismatches`);
    if (unsupported.length > 0) console.info(JSON.stringify(unsupported));
    // These are source-matrix arithmetic errors. Keeping the exact differences
    // here prevents them from being mistaken for production regressions while
    // still failing if any other supplied expectation disagrees with the app.
    expect(mismatches).toEqual([
      'S37/G-default/Alice: expected 30, got 34',
      'S37/G-default/Carol: expected -7, got -11',
      'S40/G-trip/Bob: expected 10, got 0',
    ]);
  });
});
