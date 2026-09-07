import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Expense, ExpenseSplit, Settlement } from '@/types/database';
import { calculateExpenseSplits, type SplitMethod } from '@/utils/split-validation';
import { calculateGroupBalances } from './group-balance';

type ScenarioRow = {
  scenario_id: string;
  scenario_name: string;
  people: string;
  expense_id: string;
  expense_description: string;
  paid_by: string;
  amount: string;
  currency: string;
  split_type: 'equal' | 'exact' | 'percent' | 'shares' | 'settlement';
  split_among: string;
  split_values: string;
  expected_net_balances: string;
  expected_simplified_settlements: string;
};

type Scenario = {
  id: string;
  name: string;
  people: string[];
  rows: ScenarioRow[];
  expectedBalances: Map<string, number>;
  expectedSettlements: string;
};

const fixturePath = resolve(
  process.cwd(),
  'services/fixtures/splitwise-settlement-scenarios.csv',
);

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }

  fields.push(field);
  return fields;
}

function parseRows(csv: string): ScenarioRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift() ?? '');
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])) as ScenarioRow;
  });
}

function parseBalances(value: string): Map<string, number> {
  return new Map(value.split(';').map((entry) => {
    const [name, amount] = entry.trim().split(':');
    return [name, Number(amount)];
  }));
}

function loadScenarios(): Scenario[] {
  const rows = parseRows(readFileSync(fixturePath, 'utf8'));
  const grouped = new Map<string, ScenarioRow[]>();

  for (const row of rows) {
    grouped.set(row.scenario_id, [...(grouped.get(row.scenario_id) ?? []), row]);
  }

  return [...grouped.entries()].map(([id, scenarioRows]) => {
    const expectationRow = [...scenarioRows]
      .reverse()
      .find(row => row.expected_net_balances && row.expected_simplified_settlements);
    if (!expectationRow) throw new Error(`Scenario ${id} has no final expectation`);

    return {
      id,
      name: scenarioRows[0].scenario_name,
      people: scenarioRows[0].people.split(','),
      rows: scenarioRows,
      expectedBalances: parseBalances(expectationRow.expected_net_balances),
      expectedSettlements: expectationRow.expected_simplified_settlements,
    };
  });
}

function rowValues(row: ScenarioRow): Array<{ userId: string; amount: number }> {
  const users = row.split_among.split(',');
  const amounts = row.split_values.split(',').map(Number);
  if (users.length !== amounts.length) {
    throw new Error(`${row.scenario_id}/${row.expense_id} has mismatched split users and values`);
  }
  return users.map((userId, index) => ({ userId, amount: amounts[index] }));
}

function splitMethod(row: ScenarioRow): SplitMethod {
  if (row.split_type === 'exact') return 'unequal';
  if (row.split_type === 'percent') return 'percentage';
  return row.split_type as SplitMethod;
}

function calculatedRowSplits(row: ScenarioRow): Array<{ userId: string; amount: number }> {
  const enteredValues = rowValues(row);
  if (Number(row.amount) < 0) return enteredValues;

  const result = calculateExpenseSplits(
    enteredValues.map(split => split.userId),
    Number(row.amount),
    splitMethod(row),
    Object.fromEntries(enteredValues.map(split => [split.userId, String(split.amount)])),
  );
  if (!result.splits) {
    throw new Error(`${row.scenario_id}/${row.expense_id}: ${result.error ?? 'split calculation failed'}`);
  }
  return result.splits;
}

function scenarioRecords(scenario: Scenario): {
  expenses: Expense[];
  splits: ExpenseSplit[];
  settlements: Settlement[];
} {
  const expenses: Expense[] = [];
  const splits: ExpenseSplit[] = [];
  const settlements: Settlement[] = [];

  scenario.rows.forEach((row, rowIndex) => {
    const recordId = `${scenario.id}:${rowIndex}:${row.expense_id}`;
    if (row.split_type === 'settlement') {
      const recipients = rowValues(row);
      if (recipients.length !== 1) {
        throw new Error(`${recordId} must have exactly one settlement recipient`);
      }
      settlements.push({
        id: recordId,
        groupId: scenario.id,
        fromUserId: row.paid_by,
        toUserId: recipients[0].userId,
        amount: Number(row.amount),
        currency: row.currency,
        date: 0,
        createdAt: 0,
      });
      return;
    }

    expenses.push({
      id: recordId,
      groupId: scenario.id,
      description: row.expense_description,
      amount: Number(row.amount),
      currency: row.currency,
      paidBy: row.paid_by,
      date: 0,
      createdAt: 0,
      updatedAt: 0,
    });
    for (const [splitIndex, split] of calculatedRowSplits(row).entries()) {
      splits.push({
        id: `${recordId}:split:${splitIndex}`,
        expenseId: recordId,
        userId: split.userId,
        amount: split.amount,
        splitType: row.split_type === 'percent' ? 'percentage' : row.split_type === 'equal' ? 'equal' : 'exact',
      });
    }
  });

  return { expenses, splits, settlements };
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function simplifyBalances(people: string[], balances: Map<string, number>): string {
  const position = new Map(people.map((person, index) => [person, index]));
  const byLargestAmount = (
    left: { person: string; amount: number },
    right: { person: string; amount: number },
  ) => right.amount - left.amount
    || (position.get(left.person) ?? 0) - (position.get(right.person) ?? 0);
  const creditors = people
    .map(person => ({ person, amount: cents(balances.get(person) ?? 0) }))
    .filter(entry => entry.amount > 0)
    .sort(byLargestAmount);
  const debtors = people
    .map(person => ({ person, amount: -cents(balances.get(person) ?? 0) }))
    .filter(entry => entry.amount > 0)
    .sort(byLargestAmount);
  const payments: string[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.amount, debtor.amount);
    payments.push(`${debtor.person} pays ${creditor.person} ${(amount / 100).toFixed(2)}`);
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) creditorIndex += 1;
    if (debtor.amount === 0) debtorIndex += 1;
  }

  return payments.length === 0 ? 'none' : payments.join('; ');
}

const scenarios = loadScenarios();
const consistentScenarios = scenarios.filter(scenario => !['S17', 'S28', 'S33'].includes(scenario.id));

function normalizedPayments(value: string): string[] {
  return value.split(';').map(payment => payment.trim()).sort();
}

describe('Splitwise settlement scenario matrix', () => {
  it('loads all 35 supplied scenarios and 69 rows', () => {
    expect(scenarios).toHaveLength(35);
    expect(scenarios.reduce((count, scenario) => count + scenario.rows.length, 0)).toBe(69);
  });

  it.each(consistentScenarios.map(scenario => [scenario.id, scenario] as const))(
    '%s calculates the expected net balances',
    (_id, scenario) => {
      const records = scenarioRecords(scenario);
      const balances = calculateGroupBalances(records.expenses, records.splits, records.settlements);
      const actual = Object.fromEntries(
        scenario.people.map(person => [person, cents(balances.get(person) ?? 0)]),
      );
      const expected = Object.fromEntries(
        scenario.people.map(person => [person, cents(scenario.expectedBalances.get(person) ?? 0)]),
      );
      expect(actual).toEqual(expected);
    },
  );

  it.each(consistentScenarios.map(scenario => [scenario.id, scenario] as const))(
    '%s reconciles the expected simplified payments with its balances',
    (_id, scenario) => {
      expect([...scenario.expectedBalances.values()].reduce((total, balance) => total + cents(balance), 0))
        .toBe(0);
      expect(normalizedPayments(simplifyBalances(scenario.people, scenario.expectedBalances)))
        .toEqual(normalizedPayments(scenario.expectedSettlements));
    },
  );

  const nonNegativeExpenseRows = scenarios.flatMap(scenario => scenario.rows)
    .filter(row => row.split_type !== 'settlement' && Number(row.amount) >= 0);

  it.each(nonNegativeExpenseRows.map((row, index) => [`${row.scenario_id}/${row.expense_id}/${index}`, row] as const))(
    '%s is accepted by the production split calculator',
    (_id, row) => {
      const expected = rowValues(row);
      const values = Object.fromEntries(expected.map(split => [split.userId, String(split.amount)]));
      const result = calculateExpenseSplits(
        expected.map(split => split.userId),
        Number(row.amount),
        splitMethod(row),
        values,
      );

      expect(result.error).toBeUndefined();
      expect(result.splits?.map(split => split.userId)).toEqual(expected.map(split => split.userId));
      expect(result.splits?.reduce((total, split) => total + cents(split.amount), 0))
        .toBe(cents(Number(row.amount)));
    },
  );

  it('identifies S17 as the superseded scenario with a duplicate expense ID', () => {
    const scenario = scenarios.find(candidate => candidate.id === 'S17');
    const ids = scenario?.rows.map(row => row.expense_id) ?? [];
    expect(new Set(ids).size).toBeLessThan(ids.length);
    expect(scenarios.find(candidate => candidate.id === 'S18')?.name)
      .toBe('Roommate month mixed CORRECT');
  });

  it('documents the corrected S28 EUR balances from the production calculator', () => {
    const scenario = scenarios.find(candidate => candidate.id === 'S28');
    expect(scenario).toBeDefined();
    const records = scenarioRecords(scenario!);
    const balances = calculateGroupBalances(records.expenses, records.splits, records.settlements);
    expect(Object.fromEntries(scenario!.people.map(person => [person, cents(balances.get(person) ?? 0)])))
      .toEqual({ Alice: 4500, Bob: 0, Carol: -4500 });
    expect(Object.fromEntries(scenario!.expectedBalances.entries()))
      .toEqual({ Alice: 45, Bob: 15, Carol: -60 });
  });

  it('documents the corrected S33 payer balance', () => {
    const scenario = scenarios.find(candidate => candidate.id === 'S33');
    expect(scenario).toBeDefined();
    const records = scenarioRecords(scenario!);
    const balances = calculateGroupBalances(records.expenses, records.splits, records.settlements);
    expect(Object.fromEntries(scenario!.people.map(person => [person, cents(balances.get(person) ?? 0)])))
      .toEqual({ Alice: -1500, Bob: 3000, Carol: -1500 });
    expect(Object.fromEntries(scenario!.expectedBalances.entries()))
      .toEqual({ Alice: -15, Bob: 45, Carol: -15 });
    expect(normalizedPayments(simplifyBalances(scenario!.people, balances)))
      .toEqual(normalizedPayments(scenario!.expectedSettlements));
  });

  it('documents that S29 negative corrections cannot be entered as expenses', () => {
    const correction = scenarios.find(scenario => scenario.id === 'S29')?.rows[1];
    expect(correction).toBeDefined();
    const result = calculateExpenseSplits(
      correction!.split_among.split(','),
      Number(correction!.amount),
      'equal',
      Object.fromEntries(rowValues(correction!).map(split => [split.userId, String(split.amount)])),
    );
    expect(result).toEqual({ splits: null, error: 'Split values must be zero or greater' });
  });
});
