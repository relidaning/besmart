import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { api } from '../hooks/api';

// An unsaved edit is kept per user per course, so a reload (iOS resuming the app after
// a deploy, a dead tab) never loses it. It remembers the text it started from.
interface Draft { text: string; base: string | null; }

export function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    const d = raw ? JSON.parse(raw) : null;
    return d && typeof d.text === 'string' ? d : null;
  } catch { return null; }
}
const writeDraft = (key: string, d: Draft) => { try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* full or blocked */ } };
const dropDraft = (key: string) => { try { localStorage.removeItem(key); } catch { /* blocked */ } };

// Where each line starts, from the textarea's top edge. Measured on a hidden copy with
// the same width and font, one block per line, since wrapped lines make line × height wrong.
function lineTops(area: HTMLTextAreaElement, text: string): number[] {
  const cs = getComputedStyle(area);
  const mirror = document.createElement('div');
  Object.assign(mirror.style, {
    position: 'absolute', visibility: 'hidden', top: '0', left: '0', boxSizing: 'border-box',
    width: `${area.clientWidth}px`, padding: cs.padding, font: cs.font, letterSpacing: cs.letterSpacing,
    lineHeight: cs.lineHeight, tabSize: cs.tabSize, whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
  });
  for (const line of text.split('\n')) {
    const row = document.createElement('div');
    row.textContent = line || '​';
    mirror.appendChild(row);
  }
  document.body.appendChild(mirror);
  const border = parseFloat(cs.borderTopWidth) || 0;
  const tops = Array.from(mirror.children, (row) => (row as HTMLElement).offsetTop + border);
  mirror.remove();
  return tops;
}

// The screen spot where a line of the note sits: line index (0-based) and its top in px.
export interface ScreenLine { line: number; y: number; }

// The editor's toolbar ends 92px down (header 48 + toolbar 44).
const TOOLBAR_BOTTOM = 92;

interface Props {
  courseId: number;
  content: string;
  baseHash: string | null;
  draftKey: string;
  // The line the reader was looking at, put back at the same spot on screen.
  start?: ScreenLine;
  // Both report the line at the top of the editor, so the note reopens there.
  onSaved: (content: string, hash: string, at: ScreenLine | null) => void;
  onClose: (at: ScreenLine | null) => void;
}

export default function NoteEditor({ courseId, content, baseHash, draftKey, start, onSaved, onClose }: Props) {
  const [initial] = useState(() => readDraft(draftKey) ?? { text: content, base: baseHash });
  const [text, setText] = useState(initial.text);
  const [saving, setSaving] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== content;

  // Grow with the text, so the page scrolls rather than a box inside it. Measuring means
  // collapsing the box for a moment, which shortens the page; the browser then clamps the
  // scroll and, after a deletion near the end, dropped the caret under the keyboard. So
  // the scroll position is put back.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const y = window.scrollY;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    if (window.scrollY !== y) window.scrollTo({ top: y, behavior: 'instant' });
  }, [text]);

  // Open where the reader was: their line stays where it was on screen.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el || !start) return;
    const lines = text.split('\n');
    const line = Math.min(start.line, lines.length - 1);
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + lineTops(el, text)[line] - start.y, behavior: 'instant' });
    const pos = lines.slice(0, line).join('\n').length + (line ? 1 : 0);
    el.setSelectionRange(pos, pos);
  }, []);

  // The first line fully below the toolbar, to reopen the rendered note at.
  const screenLine = (t: string): ScreenLine | null => {
    const el = areaRef.current;
    if (!el) return null;
    const top = el.getBoundingClientRect().top;
    const tops = lineTops(el, t);
    const line = tops.findIndex((y) => top + y >= TOOLBAR_BOTTOM);
    return line < 0 ? null : { line, y: top + tops[line] };
  };

  useEffect(() => {
    if (dirty) writeDraft(draftKey, { text, base: initial.base });
    else dropDraft(draftKey);
  }, [text, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async (force = false) => {
    if (saving) return;
    if (!dirty) { onClose(screenLine(text)); return; }
    setSaving(true);
    try {
      const r = await api.saveNote(courseId, text, initial.base, force);
      dropDraft(draftKey);
      toast.success('Note saved');
      onSaved(r.content, r.content_hash, screenLine(text));
    } catch (err: any) {
      setSaving(false);
      if (err.status === 409) {
        if (confirm('This note was changed in Obsidian or by sync since you started editing.\n\nOK replaces it with your version. Cancel keeps you editing, so you can copy your text first.')) save(true);
        return;
      }
      toast.error(err.message);
      return;
    }
    setSaving(false);
  };

  const cancel = () => {
    if (dirty && !confirm('Discard your changes to this note?')) return;
    dropDraft(draftKey);
    onClose(screenLine(text));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
    // Tab indents (the notes' sub-items are tab-indented) instead of leaving the field.
    // insertText keeps the browser's undo history.
    if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (!document.execCommand('insertText', false, '\t')) {
        e.currentTarget.setRangeText('\t', e.currentTarget.selectionStart, e.currentTarget.selectionEnd, 'end');
        setText(e.currentTarget.value);
      }
    }
  };

  return (
    <>
      {/* Toolbar fixed under the header, where the breadcrumb sits while reading */}
      <div className="fixed top-12 inset-x-0 z-30 h-11 bg-white/90 backdrop-blur-lg border-b border-gray-200/70 dark:bg-gray-950/90 dark:border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-4 md:pl-20 h-full flex items-center gap-2">
          <span className="flex-1 min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">
            {dirty ? 'Editing · unsaved changes' : 'Editing'}
            <span className="hidden sm:inline text-gray-400 dark:text-gray-500"> · ⌘/Ctrl+S to save, Esc to cancel</span>
          </span>
          <button onClick={cancel} disabled={saving} className="btn-ghost text-xs !px-3 !py-1.5">Cancel</button>
          <button onClick={() => save()} disabled={saving}
            className="btn-primary text-xs !px-3 !py-1.5 flex items-center gap-1.5">
            {saving && <Loader2 size={12} className="animate-spin" />}Save
          </button>
        </div>
      </div>

      <textarea
        ref={areaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{ tabSize: 4 }}
        className="block w-full min-h-[60vh] mt-6 resize-none overflow-hidden rounded-lg border border-gray-200 bg-white px-3 py-3 font-mono text-sm leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-400/50 dark:border-white/[0.1] dark:bg-[#161b22] dark:text-gray-100"
      />
    </>
  );
}
