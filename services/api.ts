/**
 * API Service
 * Central export point for all database services
 * Ensures proper Supabase connection initialization
 */

// Database initialization
export async function initDatabase(): Promise<void> {
  // Supabase client is initialized when imported from @/lib/supabase
  // No additional initialization needed - connection is established on first query
  console.log('[API] Supabase services ready');
  return Promise.resolve();
}

// Re-export individual services
export { calculateBalances, calculateFriendBalance, calculateUserNetBalance, calculateUserTotalBalance, getFriendRecentExpenses } from './balance-utils';
export { expenseService } from './expense-service';
export { friendSummaryService } from './friend-summary-service';
export { groupService } from './group-service';
export { settlementService } from './settlement-service';
export { userService } from './user-service';
