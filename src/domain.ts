import type { Category, Expense, NeedWant, Period, SpendingLimit } from './types';

export const categories: Category[] = [
  { id: 'food', name: 'Food', icon: '🍲', defaultTag: 'need', keywords: ['tea', 'samosa', 'lunch', 'dinner', 'snack', 'food', 'coffee'] },
  { id: 'travel', name: 'Travel', icon: '🛺', defaultTag: 'need', keywords: ['auto', 'bus', 'metro', 'petrol', 'fuel', 'cab', 'train'] },
  { id: 'bills', name: 'Bills', icon: '📄', defaultTag: 'need', keywords: ['recharge', 'electricity', 'wifi', 'internet', 'rent', 'bill'] },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', defaultTag: 'want', keywords: ['clothes', 'shopping', 'amazon', 'flipkart'] },
  { id: 'health', name: 'Health', icon: '🩺', defaultTag: 'need', keywords: ['medicine', 'doctor', 'pharmacy', 'gym'] },
  { id: 'education', name: 'Education', icon: '📚', defaultTag: 'need', keywords: ['book', 'course', 'class', 'fees'] },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', defaultTag: 'want', keywords: ['movie', 'netflix', 'game', 'concert'] },
  { id: 'groceries', name: 'Groceries', icon: '🧺', defaultTag: 'need', keywords: ['milk', 'rice', 'vegetables', 'grocery', 'fruit'] },
  { id: 'other', name: 'Other', icon: '✨', defaultTag: 'need', keywords: [] }
];

export const today = () => new Date().toISOString().slice(0, 10);
export const now = () => new Date().toISOString();
export const makeId = () => crypto.randomUUID();

export function paiseFromInput(value: string): number {
  const numeric = Number.parseFloat(value.replace(/,/g, ''));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

export function money(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
}

export function categoryForItem(itemName: string): Category {
  const normalized = itemName.trim().toLowerCase();
  return categories.find((category) => category.keywords.some((word) => normalized.includes(word))) ?? categories.at(-1)!;
}

export function categoryById(id: string): Category {
  return categories.find((category) => category.id === id) ?? categories.at(-1)!;
}

export function dateRange(period: Period, anchor = new Date(), weekStart: 0 | 1 = 1): { start: string; end: string } {
  const first = new Date(anchor);
  const last = new Date(anchor);
  if (period === 'week') {
    const offset = (first.getDay() - weekStart + 7) % 7;
    first.setDate(first.getDate() - offset);
    last.setTime(first.getTime());
    last.setDate(last.getDate() + 6);
  } else if (period === 'month') {
    first.setDate(1);
    last.setMonth(last.getMonth() + 1, 0);
  } else {
    first.setMonth(0, 1);
    last.setMonth(11, 31);
  }
  return { start: toDateInput(first), end: toDateInput(last) };
}

export function toDateInput(date: Date): string {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
}

export function sumExpenses(expenses: Expense[]): number {
  return expenses.filter((expense) => !expense.deleted).reduce((total, expense) => total + expense.amountPaise, 0);
}

export function expensesInRange(expenses: Expense[], start: string, end: string): Expense[] {
  return expenses.filter((expense) => !expense.deleted && expense.spentOn >= start && expense.spentOn <= end);
}

export function activeLimit(limits: SpendingLimit[], period: Period): SpendingLimit | undefined {
  return limits.find((limit) => limit.period === period && limit.isActive && !limit.deleted);
}

export function limitStatus(spentPaise: number, limit?: SpendingLimit): { percent: number; label: string; tone: 'calm' | 'warning' | 'danger' } {
  if (!limit || !limit.amountPaise) return { percent: 0, label: 'No limit set', tone: 'calm' };
  const percent = Math.round((spentPaise / limit.amountPaise) * 100);
  if (percent >= 100) return { percent, label: 'Limit reached', tone: 'danger' };
  if (percent >= 80) return { percent, label: 'Nearly there', tone: 'warning' };
  return { percent, label: `${percent}% used`, tone: 'calm' };
}

export function datesForWeek(anchor = new Date(), weekStart: 0 | 1 = 1): string[] {
  const { start } = dateRange('week', anchor, weekStart);
  const first = new Date(`${start}T12:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return toDateInput(date);
  });
}

export function relativeDay(date: string): string {
  const difference = Math.round((new Date(`${today()}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86_400_000);
  if (difference === 0) return 'Today';
  if (difference === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', weekday: 'short' }).format(new Date(`${date}T12:00:00`));
}

export function nextSyncRecord<T extends object>(record: T, baseVersion = 0): T & { updatedAt: string; baseVersion: number; version: number; syncState: 'pending' } {
  return { ...record, updatedAt: now(), baseVersion, version: baseVersion, syncState: 'pending' };
}

export function chooseDefaultTag(categoryId: string): NeedWant {
  return categoryById(categoryId).defaultTag;
}
