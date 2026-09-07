export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  pushToken?: string;
  isActive: boolean;
  createdAt: number;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  deletedBy?: string;
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
  createdBy?: string;
  category?: string;
  date: number;
  imageUrl?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  deletedBy?: string;
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
  operationId?: string;
  /** Source transfer ID for a historical backfill row; it is projection-neutral cash. */
  backfilledTransferId?: string;
  groupId?: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  date: number;
  notes?: string;
  createdAt: number;
}

/**
 * A non-cash reclassification between the Group and direct ledgers.
 *
 * signedGroupBalanceDelta is the change to the transfer from-user's Group
 * balance (ticket 09 shared orientation, matching the backfill conversion
 * and every balance reader). The direct-ledger projection applies the
 * inverse change so the relationship total remains unchanged.
 */
export interface SettlementScopeTransfer {
  id: string;
  operationId: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  currency: string;
  signedGroupBalanceDelta: number;
  note?: string;
  isReversal?: boolean;
  createdAt: number;
}

export interface SettlementCancellation {
  id: string;
  operationId: string;
  groupId: string;
  amount: number;
  /** Immutable effect on the operation actor's group balance, when available. */
  signedGroupBalanceDelta?: number;
  currency: string;
  note?: string;
  isReversal?: boolean;
  createdAt: number;
  /**
   * Settling pair attribution from the parent operation (exposed by the
   * `get_friend_cancellations` / `get_group_cancellations` read RPCs).
   * Cancellations still name the cleared scope and amount only — these
   * columns let client resolvers scope nets to the operation pair for
   * cancellation-only operations with no sibling rows or metadata.
   */
  actorUserId?: string;
  friendUserId?: string;
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
