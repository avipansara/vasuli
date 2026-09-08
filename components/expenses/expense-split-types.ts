import type { IconSymbolName } from '@/components/ui/icon-symbol';

export enum SplitType {
  GROUP = 'group',
  FRIENDS = 'friends',
}

export enum SplitMethod {
  EQUAL = 'equal',
  UNEQUAL = 'unequal',
  PERCENTAGE = 'percentage',
  SHARES = 'shares',
}

export interface SplitMethodOption {
  id: SplitMethod;
  label: string;
  icon: IconSymbolName;
  description: string;
}

export const SPLIT_METHODS: SplitMethodOption[] = [
  { id: SplitMethod.EQUAL, label: 'Equal', icon: 'divide.circle', description: 'Split evenly' },
  { id: SplitMethod.UNEQUAL, label: 'Unequal', icon: 'plusminus', description: 'Enter amounts' },
  { id: SplitMethod.PERCENTAGE, label: 'Percentage', icon: 'percent', description: 'By percent' },
  { id: SplitMethod.SHARES, label: 'Shares', icon: 'chart.pie', description: 'By shares' },
];

export interface ExpenseParticipant {
  id: string;
  name: string;
  isCurrentUser?: boolean;
}
