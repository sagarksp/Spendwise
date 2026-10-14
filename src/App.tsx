import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { googleSignIn, restoreSession, signOut, syncCloud } from './api';
import {
  activeLimit,
  categories,
  categoryById,
  categoryForItem,
  chooseDefaultTag,
  dateRange,
  datesForWeek,
  expensesInRange,
  limitStatus,
  makeId,
  money,
  nextSyncRecord,
  now,
  paiseFromInput,
  relativeDay,
  sumExpenses,
  today
} from './domain';
import { localStore } from './storage';
import type { AuthUser, Expense, NeedWant, Period, QuickAdd, Screen, Settings, SpendingLimit } from './types';

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void; renderButton: (element: HTMLElement, options: Record<string, unknown>) => void } } };
  }
}

type ExpenseDraft = {
  amount: string;
  itemName: string;
  categoryId: string;
  tag: NeedWant;
  spentOn: string;
  note: string;
  saveAsQuick: boolean;
};

const blankDraft = (): ExpenseDraft => ({ amount: '', itemName: '', categoryId: 'other', tag: 'need', spentOn: today(), note: '', saveAsQuick: false });

function GoogleButton({ onSuccess, onError }: { onSuccess: (credential: string) => void; onError: (message: string) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !holder.current) return;
    const load = () => {
      if (!window.google || !holder.current) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: (response) => onSuccess(response.credential) });
      window.google.accounts.id.renderButton(holder.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 260 });
    };
    if (window.google) {
      load();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = load;
    script.onerror = () => onError('Google sign-in could not be loaded. Check your connection and Google client ID.');
    document.head.append(script);
    return () => script.remove();
  }, [clientId, onError, onSuccess]);

  if (!clientId || clientId.startsWith('your-')) return <p className="hint">Add <code>VITE_GOOGLE_CLIENT_ID</code> to <code>.env</code> to enable cloud backup.</p>;
  return <div ref={holder} aria-label="Continue with Google" />;
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-mark">✦</div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [chips, setChips] = useState<QuickAdd[]>([]);
  const [limits, setLimits] = useState<SpendingLimit[]>([]);
  const [settings, setSettings] = useState<Settings>({ weekStart: 1, language: 'en', reminderEnabled: false, reminderTime: '21:00' });
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => ('Notification' in window ? Notification.permission : 'denied'));
  const [draft, setDraft] = useState<ExpenseDraft>(blankDraft);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyTag, setHistoryTag] = useState<'all' | NeedWant>('all');
  const [chipDraft, setChipDraft] = useState({ itemName: '', amount: '', categoryId: 'other', tag: 'need' as NeedWant });

  const refreshLocal = async () => {
    const [savedExpenses, savedChips, savedLimits, savedSettings] = await Promise.all([localStore.expenses(), localStore.quickAdd(), localStore.limits(), localStore.settings()]);
    setExpenses(savedExpenses);
    setChips(savedChips);
    setLimits(savedLimits);
    setSettings(savedSettings);
  };

  useEffect(() => {
    Promise.all([refreshLocal(), restoreSession()]).then(([, restored]) => {
      setUser(restored);
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!ready || !settings.reminderEnabled || notificationPermission !== 'granted' || !('serviceWorker' in navigator)) return;

    let timer = 0;
    let disposed = false;
    const scheduleNext = () => {
      const [hours, minutes] = settings.reminderTime.split(':').map(Number);
      const scheduled = new Date();
      scheduled.setHours(hours, minutes, 0, 0);
      if (scheduled.getTime() <= Date.now()) scheduled.setDate(scheduled.getDate() + 1);
      timer = window.setTimeout(() => {
        const dayKey = `spendwise-reminder-shown-${today()}`;
        if (localStorage.getItem(dayKey) === today()) {
          scheduleNext();
          return;
        }
        void navigator.serviceWorker.ready.then((registration) => registration.showNotification('Time for a quick money check-in?', {
          body: 'Take a moment to add today\'s expenses to Spendwise.',
          icon: '/icons/spendwise.svg',
          badge: '/icons/spendwise.svg',
          tag: 'spendwise-daily-reminder',
          data: { url: '/' }
        })).then(() => localStorage.setItem(dayKey, today())).catch((error: unknown) => {
          console.error('Spendwise could not show the reminder notification.', error);
        }).finally(() => {
          if (!disposed) scheduleNext();
        });
      }, Math.max(0, scheduled.getTime() - Date.now()));
    };
    scheduleNext();

    return () => { disposed = true; window.clearTimeout(timer); };
  }, [ready, settings.reminderEnabled, settings.reminderTime, notificationPermission]);

  const visibleExpenses = useMemo(() => expenses.filter((expense) => !expense.deleted), [expenses]);
  const todayExpenses = useMemo(() => visibleExpenses.filter((expense) => expense.spentOn === today()), [visibleExpenses]);
  const todayTotal = sumExpenses(todayExpenses);
  const week = dateRange('week', new Date(), settings.weekStart);
  const weekExpenses = expensesInRange(visibleExpenses, week.start, week.end);
  const weekTotal = sumExpenses(weekExpenses);
  const weekLimit = activeLimit(limits, 'week');
  const currentLimit = limitStatus(weekTotal, weekLimit);
  const pendingCount = [...expenses, ...chips, ...limits].filter((item) => item.syncState === 'pending').length;

  const updateDraftFromItem = (itemName: string) => {
    const suggested = categoryForItem(itemName);
    setDraft((current) => ({ ...current, itemName, categoryId: suggested.id, tag: suggested.defaultTag }));
  };

  const saveQuickFromExpense = async (expense: Expense) => {
    const existing = chips.find((chip) => !chip.deleted && chip.itemName.trim().toLowerCase() === expense.itemName.trim().toLowerCase());
    const record: QuickAdd = nextSyncRecord({
      id: existing?.id ?? makeId(),
      itemName: expense.itemName,
      defaultAmountPaise: expense.amountPaise,
      categoryId: expense.categoryId,
      tag: expense.tag,
      isPinned: true,
      useCount: existing?.useCount ?? 0,
      lastUsedAt: now(),
      deleted: false
    }, existing?.version ?? 0);
    await localStore.saveQuickAdd(record);
  };

  const saveExpense = async (event: FormEvent) => {
    event.preventDefault();
    const amountPaise = paiseFromInput(draft.amount);
    if (!draft.itemName.trim() || amountPaise <= 0) {
      setToast('Add an item name and a valid amount.');
      return;
    }
    const existing = editingExpense;
    const record: Expense = nextSyncRecord({
      id: existing?.id ?? makeId(),
      itemName: draft.itemName.trim(),
      amountPaise,
      categoryId: draft.categoryId,
      tag: draft.tag,
      spentOn: draft.spentOn,
      note: draft.note.trim() || undefined,
      deleted: false
    }, existing?.version ?? 0);
    await localStore.saveExpense(record);
    if (draft.saveAsQuick) await saveQuickFromExpense(record);
    await refreshLocal();
    setEditingExpense(null);
    setDraft(blankDraft());
    setToast(existing ? 'Expense updated on this device.' : 'Saved locally. You can back it up whenever you are ready.');
  };

  const startEdit = (expense: Expense) => {
    setEditingExpense(expense);
    setDraft({ amount: String(expense.amountPaise / 100), itemName: expense.itemName, categoryId: expense.categoryId, tag: expense.tag, spentOn: expense.spentOn, note: expense.note ?? '', saveAsQuick: false });
    setScreen('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeExpense = async (expense: Expense) => {
    await localStore.saveExpense(nextSyncRecord({ ...expense, deleted: true }, expense.version));
    await refreshLocal();
    setToast('Expense removed. It will be removed from your cloud backup on next sync.');
  };

  const useChip = async (chip: QuickAdd) => {
    const record: Expense = nextSyncRecord({
      id: makeId(), itemName: chip.itemName, amountPaise: chip.defaultAmountPaise, categoryId: chip.categoryId, tag: chip.tag, spentOn: today(), deleted: false
    });
    await localStore.saveExpense(record);
    await localStore.saveQuickAdd(nextSyncRecord({ ...chip, useCount: chip.useCount + 1, lastUsedAt: now(), deleted: false }, chip.version));
    await refreshLocal();
    setToast(`${chip.itemName} added for ${money(chip.defaultAmountPaise)}.`);
  };

  const saveChip = async (event: FormEvent) => {
    event.preventDefault();
    const amountPaise = paiseFromInput(chipDraft.amount);
    if (!chipDraft.itemName.trim() || amountPaise <= 0) return setToast('Give the quick add an item and amount.');
    const duplicate = chips.find((chip) => !chip.deleted && chip.itemName.trim().toLowerCase() === chipDraft.itemName.trim().toLowerCase());
    const chip = nextSyncRecord({
      id: duplicate?.id ?? makeId(), itemName: chipDraft.itemName.trim(), defaultAmountPaise: amountPaise, categoryId: chipDraft.categoryId, tag: chipDraft.tag,
      isPinned: true, useCount: duplicate?.useCount ?? 0, lastUsedAt: duplicate?.lastUsedAt ?? now(), deleted: false
    }, duplicate?.version ?? 0);
    await localStore.saveQuickAdd(chip);
    await refreshLocal();
    setChipDraft({ itemName: '', amount: '', categoryId: 'other', tag: 'need' });
    setToast('Quick add saved.');
  };

  const removeChip = async (chip: QuickAdd) => {
    await localStore.saveQuickAdd(nextSyncRecord({ ...chip, deleted: true }, chip.version));
    await refreshLocal();
  };

  const saveLimit = async (period: Period, amount: string, enabled: boolean) => {
    const amountPaise = paiseFromInput(amount);
    const current = limits.find((limit) => limit.period === period);
    if (enabled && amountPaise <= 0) return setToast('Enter a positive limit amount.');
    const limit = nextSyncRecord({ id: current?.id ?? makeId(), period, amountPaise, isActive: enabled, deleted: false }, current?.version ?? 0);
    await localStore.saveLimit(limit);
    await refreshLocal();
    setToast(`${period[0].toUpperCase()}${period.slice(1)} limit saved.`);
  };

  const saveSettings = async (next: Settings) => {
    setSettings(next);
    await localStore.saveSettings(next);
  };

  const toggleReminder = async (enabled: boolean) => {
    if (!enabled) {
      await saveSettings({ ...settings, reminderEnabled: false });
      setToast('Daily reminder turned off.');
      return;
    }
    if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator)) {
      setToast('Notifications need an installed app or a secure HTTPS page in a supported browser.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== 'granted') {
        setToast(permission === 'denied' ? 'Notifications are blocked. Allow them for Spendwise in your browser settings.' : 'Allow notifications to turn on your daily reminder.');
        return;
      }
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      await saveSettings({ ...settings, reminderEnabled: true });
      setToast(`Daily reminder enabled for ${settings.reminderTime}. Keep Spendwise open to receive it.`);
    } catch {
      setToast('Could not enable notifications. Check the browser notification permission and try again.');
    }
  };

  const testReminder = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setToast('Notifications are not supported in this browser. Open Spendwise in Chrome on Android.');
      return;
    }
    try {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      setNotificationPermission(permission);
      if (permission !== 'granted') {
        setToast('Notifications are blocked. Allow them for Spendwise in Android or browser settings.');
        return;
      }
      await navigator.serviceWorker.register('/sw.js');
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('Spendwise notification test', {
        body: 'Notifications are reaching this device.',
        icon: '/icons/spendwise-192.png',
        badge: '/icons/spendwise-192.png',
        tag: 'spendwise-reminder-test',
        data: { url: '/' }
      });
      setToast('Test notification sent.');
    } catch {
      setToast('Could not send a test notification. Check Android notification settings for Spendwise.');
    }
  };

  const backupAndSync = async () => {
    if (!user) return setScreen('settings');
    setSyncing(true);
    try {
      const response = await syncCloud(await localStore.syncPayload());
      await Promise.all([
        ...response.expenses.map((record) => localStore.saveExpense({ ...record, syncState: 'synced' })),
        ...response.quickAdd.map((record) => localStore.saveQuickAdd({ ...record, syncState: 'synced' })),
        ...response.limits.map((record) => localStore.saveLimit({ ...record, syncState: 'synced' })),
        localStore.setCursor(response.nextCursor)
      ]);
      await refreshLocal();
      setToast(response.accepted ? `Backup complete. ${response.accepted} local change${response.accepted === 1 ? '' : 's'} synced.` : 'Your backup is already up to date.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Backup could not complete. Your local data is still safe.');
    } finally {
      setSyncing(false);
    }
  };

  const handleGoogle = async (credential: string) => {
    try {
      const result = await googleSignIn(credential);
      setUser(result.user);
      setToast(`Welcome, ${result.user.displayName.split(' ')[0] || 'there'}. Your data is still private to you.`);
      await backupAndSync();
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Google sign-in did not complete.');
    }
  };

  const filteredHistory = visibleExpenses.filter((expense) => {
    const matchesText = expense.itemName.toLowerCase().includes(historyQuery.toLowerCase());
    return matchesText && (historyTag === 'all' || expense.tag === historyTag);
  }).sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.updatedAt.localeCompare(a.updatedAt));

  const byDay = filteredHistory.reduce<Record<string, Expense[]>>((groups, expense) => {
    (groups[expense.spentOn] ??= []).push(expense);
    return groups;
  }, {});

  if (!ready) return <main className="app-loading">Opening your private ledger…</main>;

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setScreen('home')} aria-label="Spendwise home"><span>✦</span> Spendwise</button>
      <button className={`sync-button ${user ? 'is-connected' : ''}`} onClick={backupAndSync} disabled={syncing}>
        <span>{syncing ? '↻' : user ? '☁' : '◌'}</span>{syncing ? 'Syncing…' : user ? (pendingCount ? `Back up ${pendingCount}` : 'Backed up') : 'Back up'}
      </button>
    </header>

    <main className="content">
      {screen === 'home' && <>
        <section className="welcome-row">
          <div><p className="eyebrow">{editingExpense ? 'Editing expense' : 'Today, ' + new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long' }).format(new Date())}</p><h1>{editingExpense ? 'Make it right.' : 'Keep today clear.'}</h1></div>
          <div className="today-total"><span>Today</span><strong>{money(todayTotal)}</strong></div>
        </section>

        <section className="card entry-card">
          <div className="section-heading"><div><p className="eyebrow">{editingExpense ? 'Edit details' : 'Quick entry'}</p><h2>{editingExpense ? 'Update this spend' : 'What did you spend?'}</h2></div>{editingExpense && <button className="text-button" onClick={() => { setEditingExpense(null); setDraft(blankDraft()); }}>Cancel edit</button>}</div>
          <form onSubmit={saveExpense} className="expense-form">
            <label className="amount-field"><span>Amount</span><div><b>₹</b><input inputMode="decimal" placeholder="0" value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} autoFocus /></div></label>
            <label className="wide-field"><span>For what?</span><input placeholder="Auto, groceries, tea…" value={draft.itemName} onChange={(event) => updateDraftFromItem(event.target.value)} /></label>
            <label><span>Date</span><input type="date" value={draft.spentOn} onChange={(event) => setDraft((current) => ({ ...current, spentOn: event.target.value }))} /></label>
            <label><span>Category</span><select value={draft.categoryId} onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value, tag: chooseDefaultTag(event.target.value) }))}>{categories.map((category) => <option value={category.id} key={category.id}>{category.icon} {category.name}</option>)}</select></label>
            <fieldset className="tag-toggle"><legend>Type</legend><button type="button" className={draft.tag === 'need' ? 'selected need' : ''} onClick={() => setDraft((current) => ({ ...current, tag: 'need' }))}>Need</button><button type="button" className={draft.tag === 'want' ? 'selected want' : ''} onClick={() => setDraft((current) => ({ ...current, tag: 'want' }))}>Want</button></fieldset>
            <label className="wide-field note-field"><span>Note <em>Optional</em></span><input placeholder="Anything useful to remember" value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} /></label>
            <label className="quick-checkbox"><input type="checkbox" checked={draft.saveAsQuick} onChange={(event) => setDraft((current) => ({ ...current, saveAsQuick: event.target.checked }))} /> Save as a quick add</label>
            <button className="primary-button add-button" type="submit">{editingExpense ? 'Save changes' : 'Add expense'} <span>→</span></button>
          </form>
        </section>

        <section className="quick-section"><div className="section-heading"><div><p className="eyebrow">Your shortcuts</p><h2>Quick add</h2></div><button className="text-button" onClick={() => setScreen('settings')}>Manage</button></div>
          {chips.filter((chip) => !chip.deleted).length ? <div className="chip-row">{chips.filter((chip) => !chip.deleted).sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.useCount - a.useCount).map((chip) => <button className="expense-chip" key={chip.id} onClick={() => useChip(chip)}><span>{categoryById(chip.categoryId).icon}</span><b>{chip.itemName}</b><small>{money(chip.defaultAmountPaise)}</small></button>)}</div> : <div className="soft-note">No default chips here—make shortcuts for only the things you use.</div>}
        </section>

        <section className="limit-banner"><div><p className="eyebrow">This week</p><strong>{weekLimit ? `${money(weekTotal)} of ${money(weekLimit.amountPaise)}` : `${money(weekTotal)} spent`}</strong><span>{currentLimit.label}</span></div><div className="progress-track"><span className={`progress-fill ${currentLimit.tone}`} style={{ width: `${Math.min(currentLimit.percent, 100)}%` }} /></div><button onClick={() => setScreen('limits')}>View limits →</button></section>

        <section className="recent-section"><div className="section-heading"><div><p className="eyebrow">Latest entries</p><h2>Recent spending</h2></div><button className="text-button" onClick={() => setScreen('history')}>See history</button></div>{visibleExpenses.length ? <ExpenseList expenses={visibleExpenses.sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)} onEdit={startEdit} onDelete={removeExpense} /> : <EmptyState title="Your ledger starts here" text="Add the small things first. The picture builds itself." />}</section>
      </>}

      {screen === 'history' && <section><div className="page-title"><p className="eyebrow">Everything you logged</p><h1>History</h1></div><div className="filter-row"><label><span className="sr-only">Search</span><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search an item" /></label><select value={historyTag} onChange={(event) => setHistoryTag(event.target.value as 'all' | NeedWant)}><option value="all">All types</option><option value="need">Needs</option><option value="want">Wants</option></select></div>{Object.keys(byDay).length ? Object.entries(byDay).sort(([a], [b]) => b.localeCompare(a)).map(([date, records]) => <section className="day-group" key={date}><div className="day-heading"><h2>{relativeDay(date)}</h2><span>{money(sumExpenses(records))}</span></div><ExpenseList expenses={records} onEdit={startEdit} onDelete={removeExpense} /></section>) : <EmptyState title="Nothing matches yet" text="Try a different search, or add your first expense." />}</section>}

      {screen === 'report' && <Report expenses={visibleExpenses} limits={limits} settings={settings} />}

      {screen === 'limits' && <Limits limits={limits} expenses={visibleExpenses} settings={settings} onSave={saveLimit} />}

      {screen === 'settings' && <section><div className="page-title"><p className="eyebrow">Control your data</p><h1>Settings</h1></div><div className="settings-grid"><section className="card settings-card"><p className="eyebrow">Cloud backup</p><h2>{user ? `Backed up as ${user.displayName}` : 'Keep a private backup'}</h2><p>{user ? 'Your Google account is only used to identify your private backup. We never read email or contacts.' : 'Your expenses remain on this device until you choose Google sign-in and Back up.'}</p>{user ? <div className="account-row">{user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{user.displayName.slice(0, 1)}</span>}<div><b>{user.displayName}</b><span>{user.email}</span></div><button className="text-button" onClick={async () => { await signOut(); setUser(null); setToast('Signed out. Your local data remains on this device.'); }}>Sign out</button></div> : <GoogleButton onSuccess={handleGoogle} onError={setToast} />}{user && <button className="primary-button full-button" onClick={backupAndSync} disabled={syncing}>{syncing ? 'Syncing…' : pendingCount ? `Back up ${pendingCount} change${pendingCount === 1 ? '' : 's'}` : 'Sync now'}</button>}</section>
        <section className="card settings-card"><p className="eyebrow">Preferences</p><h2>Make it yours</h2><label className="settings-label">Week starts on<select value={settings.weekStart} onChange={(event) => saveSettings({ ...settings, weekStart: Number(event.target.value) as 0 | 1 })}><option value={1}>Monday</option><option value={0}>Sunday</option></select></label><label className="settings-label">Language<select value={settings.language} onChange={(event) => saveSettings({ ...settings, language: event.target.value as 'en' | 'hi' })}><option value="en">English</option><option value="hi">Hindi</option></select></label><label className="reminder-row"><input type="checkbox" checked={settings.reminderEnabled} onChange={(event) => toggleReminder(event.target.checked)} /><span><b>Daily reminder</b><small>At {settings.reminderTime}; keep Spendwise open to receive it</small></span><input type="time" value={settings.reminderTime} onChange={(event) => saveSettings({ ...settings, reminderTime: event.target.value })} /></label>{settings.reminderEnabled && <button className="text-button reminder-test" type="button" onClick={testReminder}>Send test notification</button>}</section>
        <section className="card settings-card quick-manager"><p className="eyebrow">Your shortcuts</p><h2>Quick add shelf</h2><p>Create only the shortcuts that make your own day faster.</p><form className="quick-form" onSubmit={saveChip}><input placeholder="Item, e.g. Tea" value={chipDraft.itemName} onChange={(event) => setChipDraft((current) => ({ ...current, itemName: event.target.value }))} /><input inputMode="decimal" placeholder="Amount" value={chipDraft.amount} onChange={(event) => setChipDraft((current) => ({ ...current, amount: event.target.value }))} /><select value={chipDraft.categoryId} onChange={(event) => setChipDraft((current) => ({ ...current, categoryId: event.target.value, tag: chooseDefaultTag(event.target.value) }))}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select value={chipDraft.tag} onChange={(event) => setChipDraft((current) => ({ ...current, tag: event.target.value as NeedWant }))}><option value="need">Need</option><option value="want">Want</option></select><button className="secondary-button" type="submit">Add quick add</button></form><div className="managed-chip-list">{chips.filter((chip) => !chip.deleted).length ? chips.filter((chip) => !chip.deleted).map((chip) => <div key={chip.id}><span>{categoryById(chip.categoryId).icon}</span><b>{chip.itemName}</b><small>{money(chip.defaultAmountPaise)}</small><button aria-label={`Remove ${chip.itemName}`} onClick={() => removeChip(chip)}>×</button></div>) : <p className="hint">No quick adds yet.</p>}</div></section></div></section>}
    </main>

    <nav className="bottom-nav" aria-label="Primary navigation">{([['home', '⌂', 'Add'], ['history', '≡', 'History'], ['report', '◔', 'Report'], ['limits', '◎', 'Limits'], ['settings', '⚙', 'Settings']] as [Screen, string, string][]).map(([target, icon, label]) => <button key={target} className={screen === target ? 'active' : ''} onClick={() => setScreen(target)}><span>{icon}</span>{label}</button>)}</nav>
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

function ExpenseList({ expenses, onEdit, onDelete }: { expenses: Expense[]; onEdit: (expense: Expense) => void; onDelete: (expense: Expense) => void }) {
  return <div className="expense-list">{expenses.map((expense) => <article className="expense-row" key={expense.id}><div className="category-badge">{categoryById(expense.categoryId).icon}</div><button className="expense-details" onClick={() => onEdit(expense)}><b>{expense.itemName}</b><span>{categoryById(expense.categoryId).name} · <em className={expense.tag}>{expense.tag}</em></span></button><strong>{money(expense.amountPaise)}</strong><button className="delete-button" onClick={() => onDelete(expense)} aria-label={`Delete ${expense.itemName}`}>×</button></article>)}</div>;
}

function Limits({ limits, expenses, settings, onSave }: { limits: SpendingLimit[]; expenses: Expense[]; settings: Settings; onSave: (period: Period, amount: string, enabled: boolean) => void }) {
  const [values, setValues] = useState<Record<Period, string>>(() => ({ week: String((activeLimit(limits, 'week')?.amountPaise ?? 0) / 100 || ''), month: String((activeLimit(limits, 'month')?.amountPaise ?? 0) / 100 || ''), year: String((activeLimit(limits, 'year')?.amountPaise ?? 0) / 100 || '') }));
  const current = (period: Period) => {
    const range = dateRange(period, new Date(), settings.weekStart);
    return sumExpenses(expensesInRange(expenses, range.start, range.end));
  };
  return <section><div className="page-title"><p className="eyebrow">Gentle guardrails</p><h1>Spending limits</h1><p>Limits are private signals, never a judgement.</p></div><div className="limit-cards">{(['week', 'month', 'year'] as Period[]).map((period) => { const limit = activeLimit(limits, period); const spent = current(period); const status = limitStatus(spent, limit); return <article className="card limit-card" key={period}><div><p className="eyebrow">Per {period}</p><h2>{limit ? money(limit.amountPaise) : 'No limit'}</h2><span>{money(spent)} spent</span></div><div className="progress-track"><span className={`progress-fill ${status.tone}`} style={{ width: `${Math.min(status.percent, 100)}%` }} /></div><div className="limit-editor"><label><span>Limit amount</span><input inputMode="decimal" placeholder="No limit" value={values[period]} onChange={(event) => setValues((currentValues) => ({ ...currentValues, [period]: event.target.value }))} /></label><label className="switch"><input type="checkbox" checked={Boolean(limit)} onChange={(event) => onSave(period, values[period], event.target.checked)} /><span>Enabled</span></label><button className="secondary-button" onClick={() => onSave(period, values[period], true)}>Save</button></div></article>; })}</div></section>;
}

function Report({ expenses, limits, settings }: { expenses: Expense[]; limits: SpendingLimit[]; settings: Settings }) {
  const range = dateRange('week', new Date(), settings.weekStart);
  const records = expensesInRange(expenses, range.start, range.end);
  const total = sumExpenses(records);
  const lastAnchor = new Date();
  lastAnchor.setDate(lastAnchor.getDate() - 7);
  const previousRange = dateRange('week', lastAnchor, settings.weekStart);
  const previous = sumExpenses(expensesInRange(expenses, previousRange.start, previousRange.end));
  const difference = total - previous;
  const categoryTotals = categories.map((category) => ({ ...category, total: sumExpenses(records.filter((expense) => expense.categoryId === category.id)) })).filter((category) => category.total > 0).sort((a, b) => b.total - a.total);
  const maximum = Math.max(...categoryTotals.map((category) => category.total), 1);
  const need = sumExpenses(records.filter((expense) => expense.tag === 'need'));
  const want = sumExpenses(records.filter((expense) => expense.tag === 'want'));
  const days = datesForWeek(new Date(), settings.weekStart).map((date) => ({ date, total: sumExpenses(records.filter((expense) => expense.spentOn === date)) }));
  const dayMaximum = Math.max(...days.map((day) => day.total), 1);
  const limit = activeLimit(limits, 'week');
  const status = limitStatus(total, limit);
  return <section><div className="page-title"><p className="eyebrow">{range.start} — {range.end}</p><h1>This week</h1><p className="report-total">{money(total)}</p><p className={difference > 0 ? 'up' : 'down'}>{previous ? `${difference >= 0 ? '+' : ''}${money(difference)} compared with last week` : 'Your first week is taking shape.'}</p></div><div className="report-grid"><article className="card report-card"><p className="eyebrow">Where it went</p><h2>By category</h2><div className="category-bars">{categoryTotals.length ? categoryTotals.map((category) => <div key={category.id}><span>{category.icon} {category.name}</span><div><i style={{ width: `${(category.total / maximum) * 100}%` }} /></div><b>{money(category.total)}</b></div>) : <p className="hint">Add a few expenses to see a pattern.</p>}</div></article><article className="card report-card"><p className="eyebrow">Your rhythm</p><h2>Daily spending</h2><div className="daily-bars">{days.map((day) => <div key={day.date}><b style={{ height: `${Math.max((day.total / dayMaximum) * 100, day.total ? 8 : 2)}%` }} title={`${day.date}: ${money(day.total)}`} /><span>{new Intl.DateTimeFormat('en-IN', { weekday: 'narrow' }).format(new Date(`${day.date}T12:00:00`))}</span></div>)}</div></article><article className="card report-card split-card"><p className="eyebrow">Need and want</p><h2>Choice, not guilt</h2><div className="split-ring" style={{ background: `conic-gradient(var(--need) 0 ${(need / Math.max(total, 1)) * 100}%, var(--want) ${(need / Math.max(total, 1)) * 100}% 100%)` }}><span>{total ? Math.round((want / total) * 100) : 0}%<small>wants</small></span></div><div className="split-labels"><span><i className="need-dot" />Needs <b>{money(need)}</b></span><span><i className="want-dot" />Wants <b>{money(want)}</b></span></div></article><article className="card report-card"><p className="eyebrow">Your weekly limit</p><h2>{limit ? status.label : 'No weekly limit'}</h2><p>{limit ? `${money(total)} of ${money(limit.amountPaise)}` : 'Set a comfortable weekly limit whenever it helps.'}</p><div className="progress-track"><span className={`progress-fill ${status.tone}`} style={{ width: `${Math.min(status.percent, 100)}%` }} /></div></article></div></section>;
}

export default App;
