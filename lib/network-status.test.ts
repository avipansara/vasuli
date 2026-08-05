import { describe, expect, it } from 'vitest';

import { isNetworkOnline } from './network-status';

describe('isNetworkOnline', () => {
  it('treats connected and reachable as online', () => {
    expect(isNetworkOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
  });

  it('treats disconnected and unreachable states as offline', () => {
    expect(isNetworkOnline({ isConnected: false, isInternetReachable: null })).toBe(false);
    expect(isNetworkOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('keeps unknown reachability online when connected', () => {
    expect(isNetworkOnline({ isConnected: true, isInternetReachable: null })).toBe(true);
  });
});
