export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  createdAt: number;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: 'admin' | 'member';
  joinedAt: number;
}

export interface Expense {
  id: string;
  groupId?: string;
  description: string;
  amount: number;
  currency: string;
  paidBy: string;
  category?: string;
  date: number;
  imageUrl?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExpenseSplit {
  id: string;
  expenseId: string;
  userId: string;
  amount: number;
  splitType: 'equal' | 'exact' | 'percentage';
  percentage?: number;
}

export interface Settlement {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  date: number;
  notes?: string;
  createdAt: number;
}

export interface Balance {
  userId: string;
  groupId: string;
  balance: number;
}

export type SplitType = 'equal' | 'exact' | 'percentage';

export interface ExpenseWithDetails extends Expense {
  paidByUser?: User;
  splits?: (ExpenseSplit & { user?: User })[];
  group?: Group;
}

export interface GroupWithMembers extends Group {
  members?: (GroupMember & { user?: User })[];
  totalExpenses?: number;
  yourBalance?: number;
}
