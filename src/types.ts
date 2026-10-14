export type NeedWant = 'need' | 'want';
export type Period = 'week' | 'month' | 'year';
export type Screen = 'home' | 'history' | 'report' | 'limits' | 'settings';

export interface Category {
  id: string;
  name: string;
  icon: string;
  defaultTag: NeedWant;
  keywords: string[];
}

export interface SyncFields {
  updatedAt: string;
  baseVersion: number;
  version: number;
  deleted?: boolean;
  syncState: 'pending' | 'synced';
}

export interface Expense extends SyncFields {
  id: string;
  itemName: string;
  amountPaise: number;
  categoryId: string;
  tag: NeedWant;
  spentOn: string;
  note?: string;
  fixedExpenseId?: string;
}

export interface FixedExpense extends SyncFields {
  id: string;
  name: string;
  amountPaise: number;
  dayOfMonth: number;
  createdOn: string;
  isActive: boolean;
  includeInMonthlyBudget?: boolean;
}

export interface QuickAdd extends SyncFields {
  id: string;
  itemName: string;
  defaultAmountPaise: number;
  categoryId: string;
  tag: NeedWant;
  isPinned: boolean;
  useCount: number;
  lastUsedAt: string;
}

export interface SpendingLimit extends SyncFields {
  id: string;
  period: Period;
  amountPaise: number;
  isActive: boolean;
  categoryId?: string;
}

export interface Settings {
  weekStart: 0 | 1;
  monthStartDay: number;
  monthEndDay: number;
  language: 'en' | 'hi';
  reminderEnabled: boolean;
  reminderTime: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  picture?: string;
}

export interface SyncPayload {
  cursor: number;
  expenses: Expense[];
  quickAdd: QuickAdd[];
  limits: SpendingLimit[];
}

export interface SyncResponse {
  accepted: number;
  nextCursor: number;
  expenses: Expense[];
  quickAdd: QuickAdd[];
  limits: SpendingLimit[];
}
