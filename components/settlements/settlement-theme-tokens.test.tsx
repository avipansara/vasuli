import { describe, expect, it, vi } from 'vitest';
import { FriendDetailTheme } from '@/constants/theme';

vi.mock('react-native', () => ({ Platform: { OS: 'web', select: (value: { web?: unknown; default?: unknown }) => value.web ?? value.default } }));

describe('FriendDetailTheme settlement tokens', () => {
  it('defines activity and delete dialog tokens for both appearances', () => {
    for (const mode of ['light', 'dark'] as const) {
      const theme = FriendDetailTheme[mode];
      expect(theme.activityTitle).toBeTruthy();
      expect(theme.activitySecondary).toBeTruthy();
      expect(theme.activityBadgeSurface).toBeTruthy();
      expect(theme.activityShadow).toBeTruthy();
      expect(theme.dialogSecondarySurface).toBeTruthy();
      expect(theme.dialogSecondaryBorder).toBeTruthy();
    }
  });
});
