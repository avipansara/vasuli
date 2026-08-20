import { activityService } from '@/services/activity-service';
import { expenseService } from '@/services/expense-service';
import { friendshipService } from '@/services/friendship-service';
import { groupService } from '@/services/group-service';
import { settlementService } from '@/services/settlement-service';
import { userService } from '@/services/user-service';
import type { Expense, ExpenseSplit, Group, User } from '@/types/database';
import { normalizeEmail } from '@/utils/validation';

const APP_REVIEWER_EMAIL = process.env.EXPO_PUBLIC_APP_REVIEWER_EMAIL || '';

type DemoFriend = {
  name: string;
  email: string;
};

type DemoParticipant = Pick<User, 'id' | 'name'>;

const DEMO_FRIENDS: DemoFriend[] = [
  { name: 'Maya Rao', email: 'maya.demo@vasuli.app' },
  { name: 'Ben Carter', email: 'ben.demo@vasuli.app' },
  { name: 'Sofia Kim', email: 'sofia.demo@vasuli.app' },
];

function daysAgo(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

async function ensureDemoFriend(friend: DemoFriend): Promise<User> {
  const existing = await userService.getByEmail(friend.email);
  if (existing) return existing;

  return userService.create({
    name: friend.name,
    email: friend.email,
    isActive: true,
  });
}

async function ensureAcceptedFriendship(userId: string, friendId: string): Promise<void> {
  await friendshipService.createAccepted(userId, friendId);
}

async function ensureGroup(params: {
  currentUser: DemoParticipant;
  name: string;
  description: string;
  members: DemoParticipant[];
}): Promise<Group> {
  const groups = await groupService.getUserGroups(params.currentUser.id);
  let group = groups.find(item => item.name === params.name);

  if (!group) {
    group = await groupService.create({
      name: params.name,
      description: params.description,
    });

    await activityService.logGroupCreated({
      groupId: group.id,
      userId: params.currentUser.id,
      userName: params.currentUser.name,
      groupName: group.name,
    });
  }

  const existingMembers = await groupService.getMembers(group.id);
  const existingMemberIds = new Set(existingMembers.map(member => member.userId));

  for (const member of params.members) {
    if (existingMemberIds.has(member.id)) continue;

    await groupService.addMember(
      group.id,
      member.id,
      member.id === params.currentUser.id ? 'admin' : 'member'
    );

    if (member.id !== params.currentUser.id) {
      await activityService.logMemberAdded({
        groupId: group.id,
        userId: params.currentUser.id,
        userName: params.currentUser.name,
        memberName: member.name,
        groupName: group.name,
      });
    }
  }

  return group;
}

async function findExistingExpense(params: {
  currentUserId: string;
  groupId?: string;
  description: string;
}): Promise<Expense | undefined> {
  const expenses = params.groupId
    ? await expenseService.getByGroup(params.groupId)
    : await expenseService.getUserExpenses(params.currentUserId);

  return expenses.find(expense =>
    expense.description === params.description &&
    (expense.groupId || undefined) === params.groupId
  );
}

async function ensureExpense(params: {
  currentUserId: string;
  description: string;
  amount: number;
  paidBy: DemoParticipant;
  participants: DemoParticipant[];
  group?: Group;
  date: number;
  category: string;
}): Promise<Expense> {
  const existing = await findExistingExpense({
    currentUserId: params.currentUserId,
    groupId: params.group?.id,
    description: params.description,
  });

  if (existing) return existing;

  const equalShare = Math.floor((params.amount / params.participants.length) * 100) / 100;
  const splits: Omit<ExpenseSplit, 'id' | 'expenseId'>[] = params.participants.map((participant, index) => {
    const isLast = index === params.participants.length - 1;
    const amount = isLast
      ? Number((params.amount - equalShare * (params.participants.length - 1)).toFixed(2))
      : equalShare;

    return {
      userId: participant.id,
      amount,
      splitType: 'equal',
    };
  });

  const expense = await expenseService.create({
    groupId: params.group?.id,
    description: params.description,
    amount: params.amount,
    currency: 'USD',
    paidBy: params.paidBy.id,
    category: params.category,
    date: params.date,
  }, splits);

  await activityService.logExpenseCreated({
    expenseId: expense.id,
    userId: params.paidBy.id,
    userName: params.paidBy.name,
    description: params.description,
    amount: params.amount,
    groupId: params.group?.id,
    groupName: params.group?.name,
  });

  return expense;
}

async function ensureSettlement(params: {
  group: Group;
  fromUser: DemoParticipant;
  toUser: DemoParticipant;
  amount: number;
  date: number;
  notes: string;
}): Promise<void> {
  const settlements = await settlementService.getByGroup(params.group.id);
  const existing = settlements.find(settlement =>
    settlement.fromUserId === params.fromUser.id &&
    settlement.toUserId === params.toUser.id &&
    settlement.amount === params.amount &&
    settlement.notes === params.notes
  );

  if (existing) return;

  const settlement = await settlementService.create({
    groupId: params.group.id,
    fromUserId: params.fromUser.id,
    toUserId: params.toUser.id,
    amount: params.amount,
    currency: 'USD',
    date: params.date,
    notes: params.notes,
  });

  await activityService.logSettlementCreated({
    settlementId: settlement.id,
    fromUserId: params.fromUser.id,
    fromUserName: params.fromUser.name,
    toUserName: params.toUser.name,
    amount: params.amount,
    groupId: params.group.id,
    groupName: params.group.name,
  });
}

export async function ensureAppReviewDemoData(user: Pick<User, 'id' | 'name' | 'email'>): Promise<void> {
  if (normalizeEmail(user.email) !== APP_REVIEWER_EMAIL) return;

  const friends = await Promise.all(DEMO_FRIENDS.map(ensureDemoFriend));

  for (const friend of friends) {
    await ensureAcceptedFriendship(user.id, friend.id);
  }

  const [maya, ben, sofia] = friends;
  const reviewer = { id: user.id, name: user.name };
  const allTripMembers = [reviewer, maya, ben, sofia];
  const apartmentMembers = [reviewer, maya, ben];

  const trip = await ensureGroup({
    currentUser: reviewer,
    name: 'Austin Weekend',
    description: 'Demo trip expenses for App Review',
    members: allTripMembers,
  });

  const apartment = await ensureGroup({
    currentUser: reviewer,
    name: 'Apartment',
    description: 'Shared monthly household expenses',
    members: apartmentMembers,
  });

  await ensureExpense({
    currentUserId: user.id,
    description: 'Hotel and taxes',
    amount: 420,
    paidBy: reviewer,
    participants: allTripMembers,
    group: trip,
    date: daysAgo(5),
    category: 'Travel',
  });

  await ensureExpense({
    currentUserId: user.id,
    description: 'BBQ dinner',
    amount: 156,
    paidBy: maya,
    participants: allTripMembers,
    group: trip,
    date: daysAgo(4),
    category: 'Food',
  });

  await ensureExpense({
    currentUserId: user.id,
    description: 'Rideshares',
    amount: 84,
    paidBy: ben,
    participants: allTripMembers,
    group: trip,
    date: daysAgo(3),
    category: 'Transport',
  });

  await ensureSettlement({
    group: trip,
    fromUser: sofia,
    toUser: reviewer,
    amount: 45,
    date: daysAgo(2),
    notes: 'Partial trip settlement',
  });

  await ensureExpense({
    currentUserId: user.id,
    description: 'Internet bill',
    amount: 89.99,
    paidBy: ben,
    participants: apartmentMembers,
    group: apartment,
    date: daysAgo(8),
    category: 'Utilities',
  });

  await ensureExpense({
    currentUserId: user.id,
    description: 'Groceries',
    amount: 128.40,
    paidBy: reviewer,
    participants: apartmentMembers,
    group: apartment,
    date: daysAgo(7),
    category: 'Groceries',
  });

  await ensureExpense({
    currentUserId: user.id,
    description: 'Coffee with Sofia',
    amount: 18,
    paidBy: reviewer,
    participants: [reviewer, sofia],
    date: daysAgo(1),
    category: 'Food',
  });
}
