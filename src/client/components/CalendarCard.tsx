import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Bell, BellOff, Check, Clock, ChevronLeft, ChevronRight, Plus, Repeat, Trash2, X } from 'lucide-react';
import { api } from '../hooks/api';
import { useModalViewport } from '../hooks/useModalViewport';
import DatePicker from './ui/DatePicker';

type RepeatKind = 'weekly' | 'monthly' | 'yearly';

// One entry per occurrence: a repeating item comes once for each date it falls on.
export interface CalendarItem {
  id: number;
  date: string; // 'YYYY-MM-DD', this occurrence
  start_date: string; // the series' first day (= date for a one-off)
  repeat: RepeatKind | null;
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

const REPEAT_OPTIONS: [RepeatKind | '', string][] = [
  ['', 'Never'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year'],
];
const REPEAT_SHORT: Record<RepeatKind, string> = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
const itemKey = (it: CalendarItem) => `${it.id}:${it.date}`;

function sortItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.id - b.id);
}

interface Draft { date: string; title: string; time: string; remind_before: number | null; repeat: RepeatKind | '' }
const EMPTY_DRAFT: Draft = { date: '', title: '', time: '', remind_before: 0, repeat: '' };

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
  const overlayStyle = useModalViewport(formOpen);
  // Which way the month grid slides in: 1 = next month (from the right), -1 = previous.
  const [slideDir, setSlideDir] = useState(0);
  const touch = useRef<{ x: number; y: number; swiped: boolean } | null>(null);

  useEffect(() => {
    if (linked) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always six Monday-first weeks, the most a month spans, so the grid keeps one height
  // and swiping between months doesn't move the page below it.
  const days = useMemo(() => {
    const start = addDays(view, -((view.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
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
      setSlideDir(d > view ? 1 : -1);
      setView(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    closeForm();
  };

  const shiftMonth = (n: number) => {
    setSlideDir(n);
    setView(new Date(view.getFullYear(), view.getMonth() + n, 1));
  };

  // A horizontal swipe on the grid turns the month; vertical drags still scroll the page
  // (touch-action: pan-y), and the tap that ends a swipe doesn't select a day.
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, swiped: false };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      start.swiped = true;
      shiftMonth(dx < 0 ? 1 : -1);
    }
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (touch.current?.swiped) {
      e.stopPropagation();
      touch.current = null;
    }
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
    setDraft({ ...EMPTY_DRAFT, date: selected });
    setFormOpen(true);
  };
  const openEdit = (it: CalendarItem) => {
    setEditingId(it.id);
    // A repeating item is edited as a whole series, from its first day.
    setDraft({ date: it.start_date, title: it.title, time: it.time ?? '', remind_before: it.remind_before, repeat: it.repeat ?? '' });
    setFormOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || saving) return;
    setSaving(true);
    const body = {
      date: draft.date, title: draft.title.trim(), time: draft.time || null, remind_before: draftRemind,
      repeat: draft.repeat || null,
    };
    try {
      if (editingId) await api.updateCalendarItem(editingId, body);
      else await api.createCalendarItem(body);
      // Show the day a one-off is on, which an edit may have moved. A series stays put:
      // its first day may be long past, and it shows on the selected day if it falls there.
      if (!body.repeat && body.date !== selected) select(body.date);
      else closeForm();
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!formOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeForm(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [formOpen]);

  // Ticks off this occurrence only; for a series the server needs to know which one.
  const toggleDone = async (it: CalendarItem) => {
    const same = (x: CalendarItem) => x.id === it.id && x.date === it.date;
    apply((l) => l.map((x) => (same(x) ? { ...x, done: !it.done } : x)));
    try {
      await api.updateCalendarItem(it.id, it.repeat ? { done: !it.done, occurrence: it.date } : { done: !it.done });
    } catch (err: any) {
      apply((l) => l.map((x) => (same(x) ? { ...x, done: it.done } : x)));
      toast.error(err.message);
    }
  };

  const remove = async (it: CalendarItem) => {
    const what = it.repeat ? `"${it.title}" and all its repeats (${REPEAT_SHORT[it.repeat].toLowerCase()})` : `"${it.title}"`;
    if (!confirm(`Delete ${what}?`)) return;
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
          <button type="button" onClick={() => shiftMonth(-1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500" aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => select(today)}
            className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 px-1.5 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            title="Back to today">
            {view.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </button>
          <button type="button" onClick={() => shiftMonth(1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-500" aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[316px_1fr] lg:gap-5 [&>*]:min-w-0">
        {/* Month grid */}
        <div>
          <motion.div
            key={from}
            initial={slideDir ? { x: slideDir * 40, opacity: 0 } : false}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="grid grid-cols-7 gap-x-0.5 touch-pan-y select-none"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onClickCapture={onClickCapture}
          >
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
                  className={`relative h-8 rounded-lg flex items-center justify-center text-sm transition-colors
                    ${isSel ? 'bg-brand-400 text-ink font-bold'
                      : isToday ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 font-semibold'
                      : inMonth ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                      : 'text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/[0.06]'}`}>
                  <span className="leading-none">{d.getDate()}</span>
                  {/* Pinned to the bottom edge, out of the flow, so the number stays centered. */}
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {its.slice(0, 3).map((i) => (
                      <span key={itemKey(i)} className={`w-1 h-1 rounded-full ${isSel ? 'bg-ink/70' : i.done ? 'bg-gray-300 dark:bg-gray-600' : 'bg-[#e66666]'}`} />
                    ))}
                  </span>
                  <span className="sr-only">{pending} pending</span>
                </button>
              );
            })}
          </motion.div>
        </div>

        {/* The selected day */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate">
              {selected === today ? 'Today' : selectedLabel}
              {selected === today && <span className="font-normal text-gray-500"> · {selectedLabel}</span>}
            </span>
            <button type="button" onClick={openNew} className="btn-ghost text-xs flex items-center gap-1 flex-shrink-0">
              <Plus size={14} /> Add
            </button>
          </div>

          {dayItems.length === 0 && (
            <p className="text-[12px] text-gray-400 dark:text-gray-500 py-2">Nothing on this day.</p>
          )}
          <div className="grid gap-1.5">
            {dayItems.map((it) => (
              <div key={itemKey(it)} className="row flex items-center gap-2.5">
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
                    {it.repeat && <><span>·</span><Repeat size={10} className="flex-shrink-0" /><span>{REPEAT_SHORT[it.repeat]}</span></>}
                  </div>
                </button>
                <button type="button" onClick={() => remove(it)} aria-label="Delete"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-white/[0.06] flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>


          {comingUp.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] text-gray-500 mb-1.5">Coming up</div>
              <div className="grid gap-1">
                {comingUp.map((it) => (
                  <button key={itemKey(it)} type="button" onClick={() => select(it.date)}
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

      {/* Add/edit dialog, in a portal: a transformed ancestor (the page's stagger) would
          otherwise make `fixed` relative to the card. */}
      {formOpen && createPortal(
        <div
          className="fixed inset-0 bg-[#050609]/60 backdrop-blur-[2px] flex overflow-y-auto overscroll-contain p-4 z-50"
          style={overlayStyle}
          onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/70 dark:border-white/[0.08] shadow-2xl shadow-black/30 w-full max-w-md p-5 m-auto"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editingId ? 'Edit item' : 'New item'}</h2>
              <button type="button" onClick={closeForm} aria-label="Close"
                className="p-1 -m-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input className="input" placeholder="What's on this day?" value={draft.title} autoFocus maxLength={200} required
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{draft.repeat ? 'Starts' : 'Date'}</label>
                <DatePicker value={draft.date} required onChange={(date) => setDraft({ ...draft, date })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time</label>
                {draft.time ? (
                  <div className="relative">
                    <input type="time" className="input pr-8" value={draft.time} aria-label="Time" required
                      onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
                    <button type="button" onClick={() => setDraft({ ...draft, time: '' })} aria-label="Make it all day"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDraft({ ...draft, time: '09:00' })}
                    className="input flex items-center gap-2 text-left text-gray-500" title="Set a time">
                    <Clock size={14} className="flex-shrink-0" /> All day <span className="ml-auto text-[11px]">tap to set a time</span>
                  </button>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Repeat</label>
                <select className="input" value={draft.repeat} aria-label="Repeat"
                  onChange={(e) => setDraft({ ...draft, repeat: e.target.value as RepeatKind | '' })}>
                  {REPEAT_OPTIONS.map(([v, label]) => <option key={label} value={v}>{label}</option>)}
                </select>
                {draft.repeat === 'monthly' && Number(draft.date.slice(8)) > 28 && (
                  <p className="text-[11px] text-gray-500 mt-1">In shorter months it falls on the last day.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reminder</label>
                <select className="input" value={draftRemind ?? 'none'} aria-label="Reminder"
                  onChange={(e) => setDraft({ ...draft, remind_before: e.target.value === 'none' ? null : Number(e.target.value) })}>
                  {reminders.map(([v, label]) => <option key={label} value={v ?? 'none'}>{label}</option>)}
                </select>
                {draftRemind != null && noPush && (
                  <p className="text-[11px] text-gray-500 mt-1">Turn on the bell at the top to get alerts on this device.</p>
                )}
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={!draft.title.trim() || saving} className="btn-primary">
                  {editingId ? 'Save' : 'Add'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>,
        document.body,
      )}
    </div>
  );
}
