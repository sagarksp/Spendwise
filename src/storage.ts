import type { Category, Expense, FixedExpense, QuickAdd, Settings, SpendingLimit, SyncPayload } from './types';
import { categories as defaultCategories } from './domain';

const DB_NAME = 'spendwise-local';
const DB_VERSION = 2;
const stores = ['expenses', 'quickAdd', 'limits', 'settings', 'meta', 'categories', 'fixedExpenses'] as const;
type StoreName = (typeof stores)[number];

const defaults: Settings = {
  weekStart: 1,
  monthStartDay: 1,
  monthEndDay: 31,
  language: 'en',
  reminderEnabled: false,
  reminderTime: '21:00'
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const store of stores) {
        if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAll<T>(storeName: StoreName): Promise<T[]> {
  const database = await openDb();
  try {
    return await requestResult<T[]>(database.transaction(storeName, 'readonly').objectStore(storeName).getAll());
  } finally {
    database.close();
  }
}

async function put<T>(storeName: StoreName, value: T): Promise<void> {
  const database = await openDb();
  try {
    await requestResult(database.transaction(storeName, 'readwrite').objectStore(storeName).put(value));
  } finally {
    database.close();
  }
}

async function get<T>(storeName: StoreName, id: string): Promise<T | undefined> {
  const database = await openDb();
  try {
    return (await requestResult(database.transaction(storeName, 'readonly').objectStore(storeName).get(id))) ?? undefined;
  } finally {
    database.close();
  }
}

export const localStore = {
  expenses: () => readAll<Expense>('expenses'),
  quickAdd: () => readAll<QuickAdd>('quickAdd'),
  limits: () => readAll<SpendingLimit>('limits'),
  categories: async () => {
    const saved = await readAll<(Category & { deleted?: boolean })>('categories');
    const byId = new Map(saved.map((category) => [category.id, category]));
    return [...defaultCategories.map((category) => byId.get(category.id) ?? category), ...saved.filter((category) => !defaultCategories.some((base) => base.id === category.id))];
  },
  fixedExpenses: () => readAll<FixedExpense>('fixedExpenses'),
  saveExpense: (expense: Expense) => put('expenses', expense),
  saveQuickAdd: (chip: QuickAdd) => put('quickAdd', chip),
  saveLimit: (limit: SpendingLimit) => put('limits', limit),
  saveCategory: (category: Category & { deleted?: boolean }) => put('categories', category),
  saveFixedExpense: (record: FixedExpense) => put('fixedExpenses', record),
  async settings(): Promise<Settings> {
    const saved = await get<{ id: string } & Partial<Settings>>('settings', 'settings');
    return { ...defaults, ...saved };
  },
  saveSettings: (settings: Settings) => put('settings', { id: 'settings', ...settings }),
  async cursor(): Promise<number> {
    return (await get<{ id: string; value: number }>('meta', 'cursor'))?.value ?? 0;
  },
  setCursor: (value: number) => put('meta', { id: 'cursor', value }),
  async syncPayload(): Promise<SyncPayload> {
    const [cursor, expenses, quickAdd, limits] = await Promise.all([localStore.cursor(), localStore.expenses(), localStore.quickAdd(), localStore.limits()]);
    return {
      cursor,
      expenses: expenses.filter((item) => item.syncState === 'pending'),
      quickAdd: quickAdd.filter((item) => item.syncState === 'pending'),
      limits: limits.filter((item) => item.syncState === 'pending')
    };
  }
};
