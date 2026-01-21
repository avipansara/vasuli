export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  pushToken?: string;
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
  groupId?: string;
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

export interface Invitation {
  id: string;
  inviterId: string;
  inviteeEmail: string;
  inviteePhone?: string;
  inviteeName?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: number;
  expiresAt: number;
}

export enum ActivityType {
  EXPENSE_CREATED = 'expense_created',
  EXPENSE_UPDATED = 'expense_updated',
  EXPENSE_DELETED = 'expense_deleted',
  SETTLEMENT_CREATED = 'settlement_created',
  SETTLEMENT_UPDATED = 'settlement_updated',
  SETTLEMENT_DELETED = 'settlement_deleted',
  GROUP_CREATED = 'group_created',
  GROUP_UPDATED = 'group_updated',
  MEMBER_ADDED = 'member_added',
  MEMBER_REMOVED = 'member_removed',
}

export interface Activity {
  id: string;
  type: ActivityType;
  userId: string;           // Who performed the action
  userName?: string;        // Cached user name for display
  targetId: string;         // ID of the expense/settlement/group
  groupId?: string;         // Associated group (if applicable)
  groupName?: string;       // Cached group name for display
  description: string;      // Human-readable description
  amount?: number;          // For expense/settlement amounts
  metadata?: string;        // Additional data (JSON string)
  createdAt: number;        // Timestamp
}
