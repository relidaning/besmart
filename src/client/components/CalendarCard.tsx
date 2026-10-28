import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Bell, BellOff, Check, Clock, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { api } from '../hooks/api';

export interface CalendarItem {
  id: number;
  date: string; // 'YYYY-MM-DD'
  time: string | null; // 'HH:MM', null = all day
  title: string;
  remind_before: number | null; // minutes, null = no reminder
  done: boolean;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Reminder choices; an all-day item reminds at 09:00 (ALL_DAY_REMIND_HOUR on the server).
const TIMED_REMINDERS: [number | null, string][] = [
  [0, 'At the time'], [10, '10 min before'], [30, '30 min before'], [60, '1 hour before'], [1440, '1 day before'], [null, 'No reminder'],
];
const ALL_DAY_REMINDERS: [number | null, string][] = [
  [0, 'On the day, 9:00'], [1440, 'Day before, 9:00'], [null, 'No reminder'],
];
function reminderLabel(item: Pick<CalendarItem, 'time' | 'remind_before'>): string {
  const list = item.time ? TIMED_REMINDERS : ALL_DAY_REMINDERS;
  return list.find(([v]) => v === item.remind_before)?.[1] ?? `${item.remind_before} min before`;
}

function sortItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.id - b.id);
}

interface Draft { title: string; time: string; remind_before: number | null }
const EMPTY_DRAFT: Draft = { title: '', time: '', remind_before: 0 };

export default function CalendarCard() {
  const [params, setParams] = useSearchParams();
  const today = toDateStr(new Date());
  // A tapped reminder opens Home at ?date=…
  const linked = params.get('date');
  const [selected, setSelected] = useState(linked && DATE_RE.test(linked) ? linked : today);
  const [view, setView] = useState(() => { const d = parseDate(selected); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarItem[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (linked) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Monday-first weeks covering the month.
  const days = useMemo(() => {
    const start = addDays(view, -((view.getDay() + 6) % 7));
    const last = new Date(view.getFullYear(), view.getMonth() + 1, 0);
    const end = addDays(last, 6 - ((last.getDay() + 6) % 7));
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [view]);
  const from = toDateStr(days[0]);
  const to = toDateStr(days[days.length - 1]);

  const load = () => {
    api.getCalendar(from, to).then(setItems).catch(() => {});
    api.getCalendar(today, toDateStr(addDays(new Date(), 90))).then(setUpcoming).catch(() => {});
  };
  useEffect(load, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items) m.set(it.date, [...(m.get(it.date) ?? []), it]);
    return m;
  }, [items]);
  const dayItems = byDate.get(selected) ?? [];
  const comingUp = upcoming.filter((it) => !it.done && it.date !== selected).slice(0, 5);
  const todayLeft = upcoming.filter((it) => it.date === today && !it.done).length;
  const pendingAhead = upcoming.filter((it) => !it.done).length;
  const meta = todayLeft > 0 ? `${todayLeft} today` : pendingAhead > 0 ? `${pendingAhead} coming up` : null;

  const select = (date: string) => {
    setSelected(date);
    const d = parseDate(date);
    if (d.getMonth() !== view.getMonth() || d.getFullYear() !== view.getFullYear()) {
      setView(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    closeForm();
  };

  // Keeps both lists in step with a change, without waiting for a refetch.
  const apply = (fn: (list: CalendarItem[]) => CalendarItem[]) => {
    setItems((l) => sortItems(fn(l)));
    setUpcoming((l) => sortItems(fn(l)));
  };

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  const openNew = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFormOpen(true);
  };
  const openEdit = (it: CalendarItem) => {
    setEditingId(it.id);
    setDraft({ title: it.title, time: it.time ?? '', remind_before: it.remind_before });
    setFormOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || saving) return;
    setSaving(true);
    const body = { date: selected, title: draft.title.trim(), time: draft.time || null, remind_before: draftRemind };
    try {
      if (editingId) {
        const updated: CalendarItem = await api.updateCalendarItem(editingId, body);
        apply((l) => l.map((x) => (x.id === updated.id ? updated : x)));
      } else {
        const created: CalendarItem = await api.createCalendarItem(body);
        apply((l) => [...l, created]);
      }
      closeForm();
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (it: CalendarItem) => {
    apply((l) => l.map((x) => (x.id === it.id ? { ...x, done: !it.done } : x)));
    try {
      await api.updateCalendarItem(it.id, { done: !it.done });
    } catch (err: any) {
      apply((l) => l.map((x) => (x.id === it.id ? { ...x, done: it.done } : x)));
      toast.error(err.message);
    }
  };

  const remove = async (it: CalendarItem) => {
    if (!confirm(`Delete "${it.title}"?`)) return;
    try {
      await api.deleteCalendarItem(it.id);
      apply((l) => l.filter((x) => x.id !== it.id));
      if (editingId === it.id) closeForm();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const reminders = draft.time ? TIMED_REMINDERS : ALL_DAY_REMINDERS;
  // Switching between timed and all-day keeps the choice only when the new list has it.
  const draftRemind = reminders.some(([v]) => v === draft.remind_before) ? draft.remind_before : 0;
  const noPush = typeof Notification === 'undefined' || Notification.permission !== 'granted';
  const selectedLabel = parseDate(selected).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="card">
      {/* Title and month switcher share one row, to keep the card short. */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-baseline gap-2 min-w-0">
          Calendar
          {meta && <span className="text-[11px] font-normal text-gray-500 truncate">{meta}</span>}
        </h2>
        <div className="flex items-center flex-shrink-0">
          <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500" aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => select(today)}
            className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 px-1.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            title="Back to today">
            {view.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </button>
          <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500" aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[316px_1fr] lg:gap-5 [&>*]:min-w-0">
        {/* Month grid */}
        <div>
          <div className="grid grid-cols-7 gap-x-0.5">
            {WEEKDAYS.map((w, i) => (
              <div key={i} className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500 h-5 flex items-center justify-center">{w}</div>
            ))}
            {days.map((d) => {
              const ds = toDateStr(d);
              const its = byDate.get(ds) ?? [];
              const pending = its.filter((i) => !i.done).length;
              const inMonth = d.getMonth() === view.getMonth();
              const isSel = ds === selected;
              const isToday = ds === today;
              return (
                <button key={ds} type="button" onClick={() => select(ds)}
                  className={`h-8 rounded-lg flex flex-col items-center justify-center gap-0.5 text-sm transition-colors
                    ${isSel ? 'bg-brand-400 text-ink font-bold'
                      : isToday ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 font-semibold'
                      : inMonth ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                      : 'text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/[0.06]'}`}>
                  <span className="leading-none">{d.getDate()}</span>
                  <span className="flex gap-0.5 h-1">
                    {its.slice(0, 3).map((i) => (
                      <span key={i.id} className={`w-1 h-1 rounded-full ${isSel ? 'bg-ink/70' : i.done ? 'bg-gray-300 dark:bg-gray-600' : 'bg-[#e66666]'}`} />
                    ))}
                  </span>
                  <span className="sr-only">{pending} pending</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* The selected day */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate">
              {selected === today ? 'Today' : selectedLabel}
              {selected === today && <span className="font-normal text-gray-500"> · {selectedLabel}</span>}
            </span>
            {!formOpen && (
              <button type="button" onClick={openNew} className="btn-ghost text-xs flex items-center gap-1 flex-shrink-0">
                <Plus size={14} /> Add
              </button>
            )}
          </div>

          {dayItems.length === 0 && !formOpen && (
            <p className="text-[12px] text-gray-400 dark:text-gray-500 py-2">Nothing on this day.</p>
          )}
          <div className="grid gap-1.5">
            {dayItems.map((it) => (
              <div key={it.id} className="row flex items-center gap-2.5">
                <button type="button" onClick={() => toggleDone(it)} aria-label={it.done ? 'Mark not done' : 'Mark done'}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                    ${it.done ? 'bg-[#1fa874] border-[#1fa874] text-white' : 'border-gray-300 dark:border-gray-600 hover:border-[#1fa874]'}`}>
                  {it.done && <Check size={12} strokeWidth={3} className="checkbox-done" />}
                </button>
                <button type="button" onClick={() => openEdit(it)} className="flex-1 min-w-0 text-left">
                  <div className={`text-[13px] font-semibold truncate ${it.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                    {it.title}
                  </div>
                  <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                    {it.time ?? 'All day'}
                    <span>·</span>
                    {it.remind_before == null ? <BellOff size={10} /> : <Bell size={10} />}
                    <span className="truncate">{reminderLabel(it)}</span>
                  </div>
                </button>
                <button type="button" onClick={() => remove(it)} aria-label="Delete"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-white/[0.06] flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {formOpen && (
            <form onSubmit={save} className="mt-2 space-y-2">
              <input className="input" placeholder="What's on this day?" value={draft.title} autoFocus maxLength={200}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <div className="flex gap-2">
                {draft.time ? (
                  <div className="relative flex-1 min-w-0">
                    <input type="time" className="input pr-8" value={draft.time} aria-label="Time" required
                      onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
                    <button type="button" onClick={() => setDraft({ ...draft, time: '' })} aria-label="Make it all day"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDraft({ ...draft, time: '09:00' })}
                    className="input flex-1 min-w-0 flex items-center gap-2 text-left text-gray-500" title="Set a time">
                    <Clock size={14} className="flex-shrink-0" /> All day
                  </button>
                )}
                <select className="input flex-1 min-w-0" value={draftRemind ?? 'none'} aria-label="Reminder"
                  onChange={(e) => setDraft({ ...draft, remind_before: e.target.value === 'none' ? null : Number(e.target.value) })}>
                  {reminders.map(([v, label]) => <option key={label} value={v ?? 'none'}>{label}</option>)}
                </select>
              </div>
              {draftRemind != null && noPush && (
                <p className="text-[11px] text-gray-500">Turn on the bell at the top to get alerts on this device.</p>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={closeForm} className="btn-secondary text-sm">Cancel</button>
                <button type="submit" disabled={!draft.title.trim() || saving} className="btn-primary text-sm">
                  {editingId ? 'Save' : 'Add'}
                </button>
              </div>
            </form>
          )}

          {comingUp.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] text-gray-500 mb-1.5">Coming up</div>
              <div className="grid gap-1">
                {comingUp.map((it) => (
                  <button key={it.id} type="button" onClick={() => select(it.date)}
                    className="flex items-center gap-2 text-left text-[12px] px-1 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06]">
                    <span className="w-16 flex-shrink-0 text-gray-500">
                      {it.date === today ? 'Today' : parseDate(it.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-gray-800 dark:text-gray-200">{it.title}</span>
                    {it.time && <span className="text-gray-500 flex-shrink-0">{it.time}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
