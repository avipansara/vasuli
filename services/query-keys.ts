export const queryKeys = {
  friends: {
    home: (userId: string) => ['friends', 'home', userId] as const,
    detail: (userId: string, friendId: string) => ['friends', 'detail', userId, friendId] as const,
  },
  groups: {
    list: (userId: string) => ['groups', 'list', userId] as const,
    detail: (userId: string, groupId: string) => ['groups', 'detail', userId, groupId] as const,
  },
  expenses: {
    list: (userId: string) => ['expenses', 'list', userId] as const,
  },
  activity: {
    list: (userId: string) => ['activity', 'list', userId] as const,
  },
  invitations: {
    received: (userId: string, email: string) => ['invitations', 'received', userId, email] as const,
    sent: (userId: string) => ['invitations', 'sent', userId] as const,
    friendRequests: (userId: string) => ['invitations', 'friend-requests', userId] as const,
    pendingCount: (userId: string, email: string) => ['invitations', 'pending-count', userId, email] as const,
  },
};
