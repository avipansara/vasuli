import type { Expense, ExpenseSplit, Group, GroupMember, Settlement, User } from '@/types/database';
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'vasuli.db';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase() {
  if (db) return db;
  
  db = await SQLite.openDatabaseAsync(DB_NAME);
  
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      avatar TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
      joined_at INTEGER NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      paid_by TEXT NOT NULL,
      category TEXT,
      date INTEGER NOT NULL,
      image_url TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (paid_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS expense_splits (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      split_type TEXT NOT NULL CHECK(split_type IN ('equal', 'exact', 'percentage')),
      percentage REAL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      date INTEGER NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id);
    CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
  `);

  return db;
}

export async function getDatabase() {
  if (!db) {
    return await initDatabase();
  }
  return db;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const userService = {
  async create(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const database = await getDatabase();
    const id = generateId();
    const createdAt = Date.now();
    
    await database.runAsync(
      'INSERT INTO users (id, name, email, phone, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, user.name, user.email || null, user.phone || null, user.avatar || null, createdAt]
    );
    
    return { id, ...user, createdAt };
  },

  async getById(id: string): Promise<User | null> {
    const database = await getDatabase();
    const result = await database.getFirstAsync<any>(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );
    
    if (!result) return null;
    
    return {
      id: result.id,
      name: result.name,
      email: result.email,
      phone: result.phone,
      avatar: result.avatar,
      createdAt: result.created_at,
    };
  },

  async getAll(): Promise<User[]> {
    const database = await getDatabase();
    const results = await database.getAllAsync<any>('SELECT * FROM users ORDER BY name');
    
    return results.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      avatar: r.avatar,
      createdAt: r.created_at,
    }));
  },

  async update(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<void> {
    const database = await getDatabase();
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.phone !== undefined) {
      fields.push('phone = ?');
      values.push(updates.phone);
    }
    if (updates.avatar !== undefined) {
      fields.push('avatar = ?');
      values.push(updates.avatar);
    }
    
    if (fields.length > 0) {
      values.push(id);
      await database.runAsync(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    }
  },

  async delete(id: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM users WHERE id = ?', [id]);
  },
};

export const groupService = {
  async create(group: Omit<Group, 'id' | 'createdAt' | 'updatedAt'>): Promise<Group> {
    const database = await getDatabase();
    const id = generateId();
    const now = Date.now();
    
    await database.runAsync(
      'INSERT INTO groups (id, name, description, image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, group.name, group.description || null, group.imageUrl || null, now, now]
    );
    
    return { id, ...group, createdAt: now, updatedAt: now };
  },

  async getById(id: string): Promise<Group | null> {
    const database = await getDatabase();
    const result = await database.getFirstAsync<any>(
      'SELECT * FROM groups WHERE id = ?',
      [id]
    );
    
    if (!result) return null;
    
    return {
      id: result.id,
      name: result.name,
      description: result.description,
      imageUrl: result.image_url,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  },

  async getAll(): Promise<Group[]> {
    const database = await getDatabase();
    const results = await database.getAllAsync<any>(
      'SELECT * FROM groups ORDER BY updated_at DESC'
    );
    
    return results.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      imageUrl: r.image_url,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async update(id: string, updates: Partial<Omit<Group, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    const database = await getDatabase();
    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [Date.now()];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.imageUrl !== undefined) {
      fields.push('image_url = ?');
      values.push(updates.imageUrl);
    }
    
    values.push(id);
    await database.runAsync(
      `UPDATE groups SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  },

  async delete(id: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM groups WHERE id = ?', [id]);
  },

  async addMember(groupId: string, userId: string, role: 'admin' | 'member' = 'member'): Promise<GroupMember> {
    const database = await getDatabase();
    const id = generateId();
    const joinedAt = Date.now();
    
    await database.runAsync(
      'INSERT INTO group_members (id, group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?, ?)',
      [id, groupId, userId, role, joinedAt]
    );
    
    return { id, groupId, userId, role, joinedAt };
  },

  async getMembers(groupId: string): Promise<GroupMember[]> {
    const database = await getDatabase();
    const results = await database.getAllAsync<any>(
      'SELECT * FROM group_members WHERE group_id = ?',
      [groupId]
    );
    
    return results.map(r => ({
      id: r.id,
      groupId: r.group_id,
      userId: r.user_id,
      role: r.role,
      joinedAt: r.joined_at,
    }));
  },

  async removeMember(groupId: string, userId: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
  },
};

export const expenseService = {
  async create(
    expense: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>,
    splits: Omit<ExpenseSplit, 'id' | 'expenseId'>[]
  ): Promise<Expense> {
    const database = await getDatabase();
    const id = generateId();
    const now = Date.now();
    
    await database.runAsync(
      `INSERT INTO expenses (id, group_id, description, amount, currency, paid_by, category, date, image_url, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        expense.groupId,
        expense.description,
        expense.amount,
        expense.currency,
        expense.paidBy,
        expense.category || null,
        expense.date,
        expense.imageUrl || null,
        expense.notes || null,
        now,
        now,
      ]
    );
    
    for (const split of splits) {
      const splitId = generateId();
      await database.runAsync(
        'INSERT INTO expense_splits (id, expense_id, user_id, amount, split_type, percentage) VALUES (?, ?, ?, ?, ?, ?)',
        [splitId, id, split.userId, split.amount, split.splitType, split.percentage || null]
      );
    }
    
    return { id, ...expense, createdAt: now, updatedAt: now };
  },

  async getById(id: string): Promise<Expense | null> {
    const database = await getDatabase();
    const result = await database.getFirstAsync<any>(
      'SELECT * FROM expenses WHERE id = ?',
      [id]
    );
    
    if (!result) return null;
    
    return {
      id: result.id,
      groupId: result.group_id,
      description: result.description,
      amount: result.amount,
      currency: result.currency,
      paidBy: result.paid_by,
      category: result.category,
      date: result.date,
      imageUrl: result.image_url,
      notes: result.notes,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };
  },

  async getByGroup(groupId: string): Promise<Expense[]> {
    const database = await getDatabase();
    const results = await database.getAllAsync<any>(
      'SELECT * FROM expenses WHERE group_id = ? ORDER BY date DESC',
      [groupId]
    );
    
    return results.map(r => ({
      id: r.id,
      groupId: r.group_id,
      description: r.description,
      amount: r.amount,
      currency: r.currency,
      paidBy: r.paid_by,
      category: r.category,
      date: r.date,
      imageUrl: r.image_url,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  async getSplits(expenseId: string): Promise<ExpenseSplit[]> {
    const database = await getDatabase();
    const results = await database.getAllAsync<any>(
      'SELECT * FROM expense_splits WHERE expense_id = ?',
      [expenseId]
    );
    
    return results.map(r => ({
      id: r.id,
      expenseId: r.expense_id,
      userId: r.user_id,
      amount: r.amount,
      splitType: r.split_type,
      percentage: r.percentage,
    }));
  },

  async delete(id: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
  },
};

export const settlementService = {
  async create(settlement: Omit<Settlement, 'id' | 'createdAt'>): Promise<Settlement> {
    const database = await getDatabase();
    const id = generateId();
    const createdAt = Date.now();
    
    await database.runAsync(
      'INSERT INTO settlements (id, group_id, from_user_id, to_user_id, amount, currency, date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        settlement.groupId,
        settlement.fromUserId,
        settlement.toUserId,
        settlement.amount,
        settlement.currency,
        settlement.date,
        settlement.notes || null,
        createdAt,
      ]
    );
    
    return { id, ...settlement, createdAt };
  },

  async getByGroup(groupId: string): Promise<Settlement[]> {
    const database = await getDatabase();
    const results = await database.getAllAsync<any>(
      'SELECT * FROM settlements WHERE group_id = ? ORDER BY date DESC',
      [groupId]
    );
    
    return results.map(r => ({
      id: r.id,
      groupId: r.group_id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      amount: r.amount,
      currency: r.currency,
      date: r.date,
      notes: r.notes,
      createdAt: r.created_at,
    }));
  },

  async delete(id: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM settlements WHERE id = ?', [id]);
  },
};

export async function calculateBalances(groupId: string): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  
  const expenses = await expenseService.getByGroup(groupId);
  
  for (const expense of expenses) {
    const splits = await expenseService.getSplits(expense.id);
    
    const currentBalance = balances.get(expense.paidBy) || 0;
    balances.set(expense.paidBy, currentBalance + expense.amount);
    
    for (const split of splits) {
      const userBalance = balances.get(split.userId) || 0;
      balances.set(split.userId, userBalance - split.amount);
    }
  }
  
  const settlements = await settlementService.getByGroup(groupId);
  for (const settlement of settlements) {
    const fromBalance = balances.get(settlement.fromUserId) || 0;
    balances.set(settlement.fromUserId, fromBalance + settlement.amount);
    
    const toBalance = balances.get(settlement.toUserId) || 0;
    balances.set(settlement.toUserId, toBalance - settlement.amount);
  }
  
  return balances;
}
