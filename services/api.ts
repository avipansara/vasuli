/**
 * API Service
 * Supports both mock data and Supabase backend
 * Set EXPO_PUBLIC_USE_SUPABASE=true to use Supabase
 */

import type { Expense, ExpenseSplit, Group, GroupMember, Settlement, User } from '@/types/database';
import {
  mockExpenses,
  mockExpenseSplits,
  mockGroupMembers,
  mockGroups,
  mockSettlements,
  mockUsers,
} from './mock-data';

// Check if Supabase is configured
const USE_SUPABASE = process.env.EXPO_PUBLIC_USE_SUPABASE === 'true' && 
  process.env.EXPO_PUBLIC_SUPABASE_URL && 
  process.env.EXPO_PUBLIC_SUPABASE_KEY;

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const API_DELAY = 100; // ms

// In-memory data store (mutable copies)
let users = [...mockUsers];
let groups = [...mockGroups];
let groupMembers = [...mockGroupMembers];
let expenses = [...mockExpenses];
let expenseSplits = [...mockExpenseSplits];
let settlements = [...mockSettlements];

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Initialize
export async function initDatabase(): Promise<void> {
  if (USE_SUPABASE) {
    const { initDatabase: initSupabase } = await import('./supabase-database');
    await initSupabase();
    console.log('[API] Supabase initialized');
  } else {
    await delay(100);
    console.log('[API] Mock database initialized');
  }
}

// User Service (Mock)
const mockUserService = {
  async create(user: Omit<User, 'id' | 'createdAt'> & { id?: string }): Promise<User> {
    await delay(API_DELAY);
    const newUser: User = {
      id: user.id || generateId(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      createdAt: Date.now(),
    };
    users.push(newUser);
    console.log('[Mock API] User created:', newUser.name);
    return newUser;
  },

  async getById(id: string): Promise<User | null> {
    await delay(API_DELAY);
    return users.find(u => u.id === id) || null;
  },

  async getAll(): Promise<User[]> {
    await delay(API_DELAY);
    return [...users].sort((a, b) => a.name.localeCompare(b.name));
  },

  async update(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<void> {
    await delay(API_DELAY);
    const index = users.findIndex(u => u.id === id);
    if (index !== -1) {
      users[index] = { ...users[index], ...updates };
      console.log('[Mock API] User updated:', id);
    }
  },

  async delete(id: string): Promise<void> {
    await delay(API_DELAY);
    users = users.filter(u => u.id !== id);
    console.log('[Mock API] User deleted:', id);
  },
};

// Group Service (Mock)
const mockGroupService = {
  async create(group: Omit<Group, 'id' | 'createdAt' | 'updatedAt'>): Promise<Group> {
    await delay(API_DELAY);
    const now = Date.now();
    const newGroup: Group = {
      id: generateId(),
      name: group.name,
      description: group.description,
      imageUrl: group.imageUrl,
      createdAt: now,
      updatedAt: now,
    };
    groups.push(newGroup);
    
    // Auto-add current user as admin
    const membership: GroupMember = {
      id: generateId(),
      groupId: newGroup.id,
      userId: 'current-user',
      role: 'admin',
      joinedAt: now,
    };
    groupMembers.push(membership);
    
    console.log('[Mock API] Group created:', newGroup.name);
    return newGroup;
  },

  async getById(id: string): Promise<Group | null> {
    await delay(API_DELAY);
    return groups.find(g => g.id === id) || null;
  },

  async getAll(): Promise<Group[]> {
    await delay(API_DELAY);
    return [...groups].sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async update(id: string, updates: Partial<Omit<Group, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    await delay(API_DELAY);
    const index = groups.findIndex(g => g.id === id);
    if (index !== -1) {
      groups[index] = { ...groups[index], ...updates, updatedAt: Date.now() };
      console.log('[Mock API] Group updated:', id);
    }
  },

  async delete(id: string): Promise<void> {
    await delay(API_DELAY);
    groups = groups.filter(g => g.id !== id);
    groupMembers = groupMembers.filter(gm => gm.groupId !== id);
    expenses = expenses.filter(e => e.groupId !== id);
    settlements = settlements.filter(s => s.groupId !== id);
    console.log('[Mock API] Group deleted:', id);
  },

  async addMember(groupId: string, userId: string, role: 'admin' | 'member' = 'member'): Promise<GroupMember> {
    await delay(API_DELAY);
    const existing = groupMembers.find(gm => gm.groupId === groupId && gm.userId === userId);
    if (existing) {
      throw new Error('User is already a member of this group');
    }
    
    const membership: GroupMember = {
      id: generateId(),
      groupId,
      userId,
      role,
      joinedAt: Date.now(),
    };
    groupMembers.push(membership);
    console.log('[Mock API] Member added to group:', groupId);
    return membership;
  },

  async getMembers(groupId: string): Promise<GroupMember[]> {
    await delay(API_DELAY);
    return groupMembers.filter(gm => gm.groupId === groupId);
  },

  async removeMember(groupId: string, userId: string): Promise<void> {
    await delay(API_DELAY);
    groupMembers = groupMembers.filter(gm => !(gm.groupId === groupId && gm.userId === userId));
    console.log('[Mock API] Member removed from group:', groupId);
  },
};

// Expense Service (Mock)
const mockExpenseService = {
  async create(
    expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>,
    splits: Omit<ExpenseSplit, 'id' | 'expenseId'>[]
  ): Promise<Expense> {
    await delay(API_DELAY);
    const now = Date.now();
    const newExpense: Expense = {
      id: generateId(),
      ...expense,
      createdAt: now,
      updatedAt: now,
    };
    expenses.push(newExpense);
    
    // Add splits
    for (const split of splits) {
      const newSplit: ExpenseSplit = {
        id: generateId(),
        expenseId: newExpense.id,
        ...split,
      };
      expenseSplits.push(newSplit);
    }
    
    // Update group's updatedAt
    const groupIndex = groups.findIndex(g => g.id === expense.groupId);
    if (groupIndex !== -1) {
      groups[groupIndex].updatedAt = now;
    }
    
    console.log('[Mock API] Expense created:', newExpense.description);
    return newExpense;
  },

  async getById(id: string): Promise<Expense | null> {
    await delay(API_DELAY);
    return expenses.find(e => e.id === id) || null;
  },

  async getByGroup(groupId: string): Promise<Expense[]> {
    await delay(API_DELAY);
    return expenses
      .filter(e => e.groupId === groupId)
      .sort((a, b) => b.date - a.date);
  },

  async getAll(): Promise<Expense[]> {
    await delay(API_DELAY);
    return [...expenses].sort((a, b) => b.date - a.date);
  },

  async getSplits(expenseId: string): Promise<ExpenseSplit[]> {
    await delay(API_DELAY);
    return expenseSplits.filter(s => s.expenseId === expenseId);
  },

  async delete(id: string): Promise<void> {
    await delay(API_DELAY);
    expenses = expenses.filter(e => e.id !== id);
    expenseSplits = expenseSplits.filter(s => s.expenseId !== id);
    console.log('[Mock API] Expense deleted:', id);
  },
};

// Settlement Service (Mock)
const mockSettlementService = {
  async create(settlement: Omit<Settlement, 'id' | 'createdAt'>): Promise<Settlement> {
    await delay(API_DELAY);
    const newSettlement: Settlement = {
      id: generateId(),
      ...settlement,
      createdAt: Date.now(),
    };
    settlements.push(newSettlement);
    console.log('[Mock API] Settlement created');
    return newSettlement;
  },

  async getByGroup(groupId: string): Promise<Settlement[]> {
    await delay(API_DELAY);
    return settlements
      .filter(s => s.groupId === groupId)
      .sort((a, b) => b.date - a.date);
  },

  async delete(id: string): Promise<void> {
    await delay(API_DELAY);
    settlements = settlements.filter(s => s.id !== id);
    console.log('[Mock API] Settlement deleted:', id);
  },
};

// Calculate balances for a group (Mock)
async function mockCalculateBalances(groupId: string): Promise<Map<string, number>> {
  await delay(API_DELAY / 2);
  const balances = new Map<string, number>();
  
  const groupExpenses = expenses.filter(e => e.groupId === groupId);
  
  for (const expense of groupExpenses) {
    const splits = expenseSplits.filter(s => s.expenseId === expense.id);
    
    // Person who paid gets credit
    const currentBalance = balances.get(expense.paidBy) || 0;
    balances.set(expense.paidBy, currentBalance + expense.amount);
    
    // Each person in split owes their share
    for (const split of splits) {
      const userBalance = balances.get(split.userId) || 0;
      balances.set(split.userId, userBalance - split.amount);
    }
  }
  
  // Apply settlements
  const groupSettlements = settlements.filter(s => s.groupId === groupId);
  for (const settlement of groupSettlements) {
    const fromBalance = balances.get(settlement.fromUserId) || 0;
    balances.set(settlement.fromUserId, fromBalance + settlement.amount);
    
    const toBalance = balances.get(settlement.toUserId) || 0;
    balances.set(settlement.toUserId, toBalance - settlement.amount);
  }
  
  return balances;
}

// Helper to get database (for compatibility)
export async function getDatabase(): Promise<null> {
  return null;
}

// Export services - use Supabase when configured, otherwise use mock
export const userService = USE_SUPABASE
  ? (() => {
      const supa = require('./supabase-database');
      return supa.userService;
    })()
  : mockUserService;

export const groupService = USE_SUPABASE
  ? (() => {
      const supa = require('./supabase-database');
      return supa.groupService;
    })()
  : mockGroupService;

export const expenseService = USE_SUPABASE
  ? (() => {
      const supa = require('./supabase-database');
      return supa.expenseService;
    })()
  : mockExpenseService;

export const settlementService = USE_SUPABASE
  ? (() => {
      const supa = require('./supabase-database');
      return supa.settlementService;
    })()
  : mockSettlementService;

export const calculateBalances = USE_SUPABASE
  ? (() => {
      const supa = require('./supabase-database');
      return supa.calculateBalances;
    })()
  : mockCalculateBalances;
