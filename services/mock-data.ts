import type { Expense, ExpenseSplit, Group, GroupMember, Settlement, User } from '@/types/database';

// Mock Users
export const mockUsers: User[] = [
  {
    id: 'current-user',
    name: 'You',
    email: 'you@example.com',
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'user-1',
    name: 'Alex Johnson',
    email: 'alex@example.com',
    createdAt: Date.now() - 25 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'user-2',
    name: 'Sarah Chen',
    email: 'sarah@example.com',
    createdAt: Date.now() - 20 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'user-3',
    name: 'Mike Wilson',
    email: 'mike@example.com',
    createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'user-4',
    name: 'Emma Davis',
    email: 'emma@example.com',
    createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
  },
];

// Mock Groups
export const mockGroups: Group[] = [
  {
    id: 'group-1',
    name: 'Roommates',
    description: 'Monthly rent and utilities',
    createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'group-2',
    name: 'Trip to Vegas',
    description: 'Weekend getaway expenses',
    createdAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'group-3',
    name: 'Office Lunch',
    description: 'Daily lunch splits',
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
];

// Mock Group Members
export const mockGroupMembers: GroupMember[] = [
  // Roommates group
  { id: 'gm-1', groupId: 'group-1', userId: 'current-user', role: 'admin', joinedAt: Date.now() - 60 * 24 * 60 * 60 * 1000 },
  { id: 'gm-2', groupId: 'group-1', userId: 'user-1', role: 'member', joinedAt: Date.now() - 60 * 24 * 60 * 60 * 1000 },
  { id: 'gm-3', groupId: 'group-1', userId: 'user-2', role: 'member', joinedAt: Date.now() - 55 * 24 * 60 * 60 * 1000 },
  // Vegas trip group
  { id: 'gm-4', groupId: 'group-2', userId: 'current-user', role: 'admin', joinedAt: Date.now() - 14 * 24 * 60 * 60 * 1000 },
  { id: 'gm-5', groupId: 'group-2', userId: 'user-1', role: 'member', joinedAt: Date.now() - 14 * 24 * 60 * 60 * 1000 },
  { id: 'gm-6', groupId: 'group-2', userId: 'user-3', role: 'member', joinedAt: Date.now() - 14 * 24 * 60 * 60 * 1000 },
  { id: 'gm-7', groupId: 'group-2', userId: 'user-4', role: 'member', joinedAt: Date.now() - 14 * 24 * 60 * 60 * 1000 },
  // Office lunch group
  { id: 'gm-8', groupId: 'group-3', userId: 'current-user', role: 'member', joinedAt: Date.now() - 30 * 24 * 60 * 60 * 1000 },
  { id: 'gm-9', groupId: 'group-3', userId: 'user-2', role: 'admin', joinedAt: Date.now() - 30 * 24 * 60 * 60 * 1000 },
  { id: 'gm-10', groupId: 'group-3', userId: 'user-4', role: 'member', joinedAt: Date.now() - 28 * 24 * 60 * 60 * 1000 },
];

// Mock Expenses
export const mockExpenses: Expense[] = [
  // Roommates expenses
  {
    id: 'exp-1',
    groupId: 'group-1',
    description: 'Electricity Bill',
    amount: 150.00,
    currency: 'USD',
    paidBy: 'current-user',
    date: Date.now() - 3 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'exp-2',
    groupId: 'group-1',
    description: 'Internet',
    amount: 89.99,
    currency: 'USD',
    paidBy: 'user-1',
    date: Date.now() - 5 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'exp-3',
    groupId: 'group-1',
    description: 'Groceries',
    amount: 234.50,
    currency: 'USD',
    paidBy: 'user-2',
    date: Date.now() - 7 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  },
  // Vegas trip expenses
  {
    id: 'exp-4',
    groupId: 'group-2',
    description: 'Hotel Room',
    amount: 450.00,
    currency: 'USD',
    paidBy: 'current-user',
    date: Date.now() - 10 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'exp-5',
    groupId: 'group-2',
    description: 'Dinner at Steakhouse',
    amount: 320.00,
    currency: 'USD',
    paidBy: 'user-3',
    date: Date.now() - 9 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 9 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 9 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'exp-6',
    groupId: 'group-2',
    description: 'Show Tickets',
    amount: 280.00,
    currency: 'USD',
    paidBy: 'user-1',
    date: Date.now() - 8 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
  },
  // Office lunch expenses
  {
    id: 'exp-7',
    groupId: 'group-3',
    description: 'Thai Food',
    amount: 45.00,
    currency: 'USD',
    paidBy: 'user-2',
    date: Date.now() - 1 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
  {
    id: 'exp-8',
    groupId: 'group-3',
    description: 'Pizza',
    amount: 36.00,
    currency: 'USD',
    paidBy: 'current-user',
    date: Date.now() - 2 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
  },
  // Friend-only expense (no group)
  {
    id: 'exp-9',
    description: 'Coffee with Alex',
    amount: 20.00,
    currency: 'USD',
    paidBy: 'current-user',
    date: Date.now() - 1 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
];

// Mock Expense Splits (equal splits for simplicity)
export const mockExpenseSplits: ExpenseSplit[] = [
  // Electricity split (3 people)
  { id: 'split-1', expenseId: 'exp-1', userId: 'current-user', amount: 50.00, splitType: 'equal' },
  { id: 'split-2', expenseId: 'exp-1', userId: 'user-1', amount: 50.00, splitType: 'equal' },
  { id: 'split-3', expenseId: 'exp-1', userId: 'user-2', amount: 50.00, splitType: 'equal' },
  // Internet split
  { id: 'split-4', expenseId: 'exp-2', userId: 'current-user', amount: 30.00, splitType: 'equal' },
  { id: 'split-5', expenseId: 'exp-2', userId: 'user-1', amount: 30.00, splitType: 'equal' },
  { id: 'split-6', expenseId: 'exp-2', userId: 'user-2', amount: 29.99, splitType: 'equal' },
  // Groceries split
  { id: 'split-7', expenseId: 'exp-3', userId: 'current-user', amount: 78.17, splitType: 'equal' },
  { id: 'split-8', expenseId: 'exp-3', userId: 'user-1', amount: 78.17, splitType: 'equal' },
  { id: 'split-9', expenseId: 'exp-3', userId: 'user-2', amount: 78.16, splitType: 'equal' },
  // Hotel split (4 people)
  { id: 'split-10', expenseId: 'exp-4', userId: 'current-user', amount: 112.50, splitType: 'equal' },
  { id: 'split-11', expenseId: 'exp-4', userId: 'user-1', amount: 112.50, splitType: 'equal' },
  { id: 'split-12', expenseId: 'exp-4', userId: 'user-3', amount: 112.50, splitType: 'equal' },
  { id: 'split-13', expenseId: 'exp-4', userId: 'user-4', amount: 112.50, splitType: 'equal' },
  // Dinner split
  { id: 'split-14', expenseId: 'exp-5', userId: 'current-user', amount: 80.00, splitType: 'equal' },
  { id: 'split-15', expenseId: 'exp-5', userId: 'user-1', amount: 80.00, splitType: 'equal' },
  { id: 'split-16', expenseId: 'exp-5', userId: 'user-3', amount: 80.00, splitType: 'equal' },
  { id: 'split-17', expenseId: 'exp-5', userId: 'user-4', amount: 80.00, splitType: 'equal' },
  // Show tickets split
  { id: 'split-18', expenseId: 'exp-6', userId: 'current-user', amount: 70.00, splitType: 'equal' },
  { id: 'split-19', expenseId: 'exp-6', userId: 'user-1', amount: 70.00, splitType: 'equal' },
  { id: 'split-20', expenseId: 'exp-6', userId: 'user-3', amount: 70.00, splitType: 'equal' },
  { id: 'split-21', expenseId: 'exp-6', userId: 'user-4', amount: 70.00, splitType: 'equal' },
  // Thai food split (3 people)
  { id: 'split-22', expenseId: 'exp-7', userId: 'current-user', amount: 15.00, splitType: 'equal' },
  { id: 'split-23', expenseId: 'exp-7', userId: 'user-2', amount: 15.00, splitType: 'equal' },
  { id: 'split-24', expenseId: 'exp-7', userId: 'user-4', amount: 15.00, splitType: 'equal' },
  // Pizza split
  { id: 'split-25', expenseId: 'exp-8', userId: 'current-user', amount: 12.00, splitType: 'equal' },
  { id: 'split-26', expenseId: 'exp-8', userId: 'user-2', amount: 12.00, splitType: 'equal' },
  { id: 'split-27', expenseId: 'exp-8', userId: 'user-4', amount: 12.00, splitType: 'equal' },
  // Coffee with Alex (friend-only, no group) - current-user paid, split with user-1
  { id: 'split-28', expenseId: 'exp-9', userId: 'current-user', amount: 10.00, splitType: 'equal' },
  { id: 'split-29', expenseId: 'exp-9', userId: 'user-1', amount: 10.00, splitType: 'equal' },
];

// Mock Settlements
export const mockSettlements: Settlement[] = [
  {
    id: 'settle-1',
    groupId: 'group-1',
    fromUserId: 'user-1',
    toUserId: 'current-user',
    amount: 20.00,
    currency: 'USD',
    date: Date.now() - 2 * 24 * 60 * 60 * 1000,
    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
  },
];
