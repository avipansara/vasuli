import { describe, expect, it } from 'vitest';
import {
  mapActivityRow,
  mapExpenseRow,
  mapExpenseSplitRow,
  mapFriendshipRow,
  mapGroupMemberRow,
  mapGroupRow,
  mapInvitationRow,
  mapSettlementRow,
  mapUserRow,
} from './database-row-mappers';

const date = '2026-01-02T03:04:05.000Z';

describe('database row mappers', () => {
  it('maps timestamps, nullable user fields, and is_active defaults', () => {
    expect(mapUserRow({
      id: 'u',
      name: 'N',
      email: null,
      phone: '',
      avatar: null,
      created_at: date,
    })).toEqual({
      id: 'u',
      name: 'N',
      isActive: true,
      createdAt: new Date(date).getTime(),
    });
  });

  it('preserves soft deletion fields and null-to-undefined rules', () => {
    expect(mapGroupRow({
      id: 'g',
      name: 'G',
      description: null,
      image_url: null,
      created_at: date,
      updated_at: date,
      deleted_at: date,
      deleted_by: 'u',
    })).toMatchObject({
      deletedAt: new Date(date).getTime(),
      deletedBy: 'u',
    });
    expect(mapExpenseRow({
      id: 'e',
      group_id: null,
      description: 'D',
      amount: 0,
      currency: 'USD',
      paid_by: 'u',
      category: null,
      date,
      image_url: null,
      notes: null,
      created_at: date,
      updated_at: date,
      deleted_at: date,
      deleted_by: 'u',
    })).toMatchObject({
      groupId: undefined,
      amount: 0,
      deletedAt: new Date(date).getTime(),
      deletedBy: 'u',
    });
  });

  it('retains the historical zero truthiness behavior for activity and split percentage', () => {
    const activity = mapActivityRow({
      id: 'a',
      type: 'expense_created',
      user_id: 'u',
      user_name: null,
      target_id: 'e',
      group_id: null,
      group_name: null,
      description: 'D',
      amount: 0,
      metadata: null,
      created_at: date,
    });
    const split = mapExpenseSplitRow({
      id: 's',
      expense_id: 'e',
      user_id: 'u',
      amount: 1,
      split_type: 'percentage',
      percentage: 0,
    });

    expect(activity.amount).toBeUndefined();
    expect(split.percentage).toBeUndefined();
  });

  it('maps row-specific conversions and settlement group-id modes', () => {
    const settlement = {
      id: 's',
      operation_id: null,
      group_id: null,
      from_user_id: 'u',
      to_user_id: 'v',
      amount: 1,
      currency: 'USD',
      date,
      notes: null,
      created_at: date,
    };

    expect(mapGroupMemberRow({
      id: 'm',
      group_id: 'g',
      user_id: 'u',
      role: 'admin',
      joined_at: date,
    }).role).toBe('admin');
    expect(mapFriendshipRow({
      id: 'f',
      user_id: 'u',
      friend_id: 'v',
      status: 'accepted',
      created_at: date,
    }).status).toBe('accepted');
    expect(mapInvitationRow({
      id: 'i',
      inviter_id: 'u',
      invitee_email: 'x@y.test',
      invitee_phone: null,
      invitee_name: '  X  ',
      status: 'pending',
      created_at: date,
      expires_at: date,
    }).inviteeName).toBe('X');
    expect(mapSettlementRow(settlement).groupId).toBeUndefined();
    expect(mapSettlementRow(settlement, { preserveNullGroupId: true }).groupId).toBeNull();
  });
});
