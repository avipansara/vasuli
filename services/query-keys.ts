export const queryKeys = {
  friends: {
    home: (userId: string) => ['friends', 'home', userId] as const,
  },
};
