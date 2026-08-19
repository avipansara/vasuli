import type {
  Activity,
  ActivityType,
  Expense,
  ExpenseSplit,
  Group,
  GroupMember,
  Invitation,
  Settlement,
  User,
} from '@/types/database';

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  push_token?: string | null;
  is_active?: boolean | null;
  created_at: string;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

type GroupMemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

type ExpenseRow = {
  id: string;
  group_id: string | null;
  description: string;
  amount: number;
  currency: string;
  paid_by: string;
  created_by?: string | null;
  category: string | null;
  date: string;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

type ExpenseSplitRow = {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
  split_type: string;
  percentage: number | null;
};

type SettlementRow = {
  id: string;
  operation_id: string | null;
  group_id: string | null;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: string;
  date: string;
  notes: string | null;
  created_at: string;
};

type ActivityRow = {
  id: string;
  type: string;
  user_id: string;
  user_name: string | null;
  target_id: string;
  group_id: string | null;
  group_name: string | null;
  description: string;
  amount: number | null;
  metadata: string | null;
  created_at: string;
};

type InvitationRow = {
  id: string;
  inviter_id: string;
  invitee_email: string;
  invitee_phone: string | null;
  invitee_name: string | null;
  status: Invitation['status'];
  created_at: string;
  expires_at: string;
};

type FriendshipRow = {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
};

const optional = (value: string | null | undefined) => value || undefined;
const timestamp = (value: string) => new Date(value).getTime();

export function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: optional(row.email),
    phone: optional(row.phone),
    avatar: optional(row.avatar),
    pushToken: optional(row.push_token),
    isActive: row.is_active ?? true,
    createdAt: timestamp(row.created_at),
  };
}

export function mapGroupRow(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: optional(row.description),
    imageUrl: optional(row.image_url),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    deletedAt: row.deleted_at ? timestamp(row.deleted_at) : undefined,
    deletedBy: optional(row.deleted_by),
  };
}

export function mapGroupMemberRow(row: GroupMemberRow): GroupMember {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    role: row.role as GroupMember['role'],
    joinedAt: timestamp(row.joined_at),
  };
}

export function mapExpenseRow(row: ExpenseRow): Expense {
  return {
    id: row.id,
    groupId: optional(row.group_id),
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    paidBy: row.paid_by,
    createdBy: optional(row.created_by),
    category: optional(row.category),
    date: timestamp(row.date),
    imageUrl: optional(row.image_url),
    notes: optional(row.notes),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    deletedAt: row.deleted_at ? timestamp(row.deleted_at) : undefined,
    deletedBy: optional(row.deleted_by),
  };
}

export function mapExpenseSplitRow(row: ExpenseSplitRow): ExpenseSplit {
  return {
    id: row.id,
    expenseId: row.expense_id,
    userId: row.user_id,
    amount: row.amount,
    splitType: row.split_type as ExpenseSplit['splitType'],
    percentage: row.percentage || undefined,
  };
}

export function mapSettlementRow(row: SettlementRow, options?: { preserveNullGroupId?: boolean }): Settlement {
  return {
    id: row.id,
    operationId: optional(row.operation_id),
    // create() and getByGroup() historically returned the raw nullable value.
    // Keep that behavior during this mechanical refactor even though the
    // domain type models an absent group as undefined.
    groupId: options?.preserveNullGroupId ? row.group_id as unknown as string : optional(row.group_id),
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amount: row.amount,
    currency: row.currency,
    date: timestamp(row.date),
    notes: optional(row.notes),
    createdAt: timestamp(row.created_at),
  };
}

export function mapActivityRow(row: ActivityRow): Activity {
  return {
    id: row.id,
    type: row.type as ActivityType,
    userId: row.user_id,
    userName: optional(row.user_name),
    targetId: row.target_id,
    groupId: optional(row.group_id),
    groupName: optional(row.group_name),
    description: row.description,
    amount: row.amount || undefined,
    metadata: optional(row.metadata),
    createdAt: timestamp(row.created_at),
  };
}

export function mapInvitationRow(row: InvitationRow): Invitation {
  return {
    id: row.id,
    inviterId: row.inviter_id,
    inviteeEmail: row.invitee_email,
    inviteePhone: optional(row.invitee_phone),
    inviteeName: row.invitee_name?.trim() || undefined,
    status: row.status,
    createdAt: timestamp(row.created_at),
    expiresAt: timestamp(row.expires_at),
  };
}

export function mapFriendshipRow(row: FriendshipRow): {
  id: string;
  userId: string;
  friendId: string;
  status: FriendshipRow['status'];
  createdAt: number;
} {
  return {
    id: row.id,
    userId: row.user_id,
    friendId: row.friend_id,
    status: row.status,
    createdAt: timestamp(row.created_at),
  };
}
