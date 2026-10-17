import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import ini from 'react-syntax-highlighter/dist/esm/languages/prism/ini';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import log from 'react-syntax-highlighter/dist/esm/languages/prism/log';
import lua from 'react-syntax-highlighter/dist/esm/languages/prism/lua';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import nginx from 'react-syntax-highlighter/dist/esm/languages/prism/nginx';
import properties from 'react-syntax-highlighter/dist/esm/languages/prism/properties';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast from 'react-hot-toast';
import { celebrate } from '../lib/garden';
import { ArrowLeft, ChevronRight, ExternalLink, Pencil } from 'lucide-react';
import { api, trackLoading } from '../hooks/api';
import { useAuth } from '../store/auth';
import { useTheme } from '../contexts/ThemeContext';
import { PageSpinner } from '../components/Loading';
import NoteEditor, { readDraft } from '../components/NoteEditor';

// The full Prism build bundles ~300 grammars (~1MB). Register only what the vault's
// notes actually use; unknown fence languages still render, just unhighlighted.
// PrismLight's registerLanguage ignores the name it is given: a grammar answers to its
// own name and built-in aliases (sh, yml, py, html, …), and any other name needs alias().
for (const grammar of [
  bash, c, cpp, css, diff, docker, go, ini, java, javascript, json, jsx, log, lua,
  markdown, markup, nginx, properties, python, sql, tsx, typescript, yaml,
]) {
  SyntaxHighlighter.registerLanguage('', grammar);
}
SyntaxHighlighter.alias({ bash: ['zsh'], ini: ['cnf'], json: ['jsonc', 'jsonl'] });

// A fence with no language that holds JSON (or one JSON value per line) is shown as JSON.
function looksLikeJson(code: string) {
  const text = code.trim();
  if (!/^[{[]/.test(text)) return false;
  const parses = (v: string) => { try { JSON.parse(v); return true; } catch { return false; } };
  return parses(text) || text.split('\n').every((line) => !line.trim() || parses(line));
}

// ── Heading helpers ───────────────────────────────────────────────────────────

interface Heading { level: number; text: string; id: string; }

// Heading text as plain words: no **bold**, `code`, [links](…) or the U+2060 the
// heading-numbering plugin puts before "1.2. ".
const plainHeading = (text: string) => text
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>|[*`\u2060]|==|~~/g, '')
  .trim();

// The heading being read and the headings it sits under: 1. Deep learning › 1.2. … › 1.2.3. …
function headingTrail(headings: Heading[], activeId: string): Heading[] {
  const at = headings.findIndex((h) => h.id === activeId);
  if (at < 0) return [];
  const trail = [headings[at]];
  for (let i = at - 1; i >= 0; i--) {
    if (headings[i].level < trail[0].level) trail.unshift(headings[i]);
  }
  return trail;
}

// The fixed header is 48px and the breadcrumb under it 36px; a heading counts as being
// read once it has scrolled up to just below them.
const READ_LINE = 48 + 36 + 8;

// FSRS ratings (server/fsrs.ts): each button shows the gap it would schedule.
type Rating = 'again' | 'hard' | 'ok' | 'easy';
const RATINGS: { id: Rating; label: string; cls: string }[] = [
  { id: 'again', label: 'Forgot', cls: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 dark:bg-[#e66666]/[0.12] dark:text-[#ec8a8a] dark:border-[#e66666]/50 dark:hover:bg-[#e66666]/[0.2]' },
  { id: 'hard', label: 'Hard', cls: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 dark:bg-[#d95926]/[0.12] dark:text-[#ec8a5f] dark:border-[#d95926]/50 dark:hover:bg-[#d95926]/[0.2]' },
  { id: 'ok', label: 'Good', cls: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-brand-400/[0.12] dark:text-brand-400 dark:border-brand-400/50 dark:hover:bg-brand-400/[0.2]' },
  { id: 'easy', label: 'Easy', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-[#1fa874]/[0.12] dark:text-[#4fd6a0] dark:border-[#1fa874]/50 dark:hover:bg-[#1fa874]/[0.2]' },
];

function fmtGap(days: number) {
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round((days / 365) * 10) / 10}y`;
}

// $…$ and $$…$$ math, as in Obsidian. Notes mix Chinese text into formulas, so KaTeX
// isn't strict about it, and a formula it can't parse shows as red source, not an error.
const KATEX_OPTIONS = { strict: false, throwOnError: false };

// Obsidian only reads $…$ as math when the dollars hug it: no space inside either one,
// and no digit right after the closing one. Other dollars ("costs $5, or $10") are
// escaped so remark-math leaves them as text. Inline code and $$ blocks pass through.
const DOLLAR_TOKENS = /(`+)[\s\S]*?\1|\$\$[\s\S]*?\$\$|\$[^\s$](?:[^$\n]*?[^\s$\\])?\$(?!\d)|\\\$|\$/g;
const escapeLoneDollars = (md: string) => md.replace(DOLLAR_TOKENS, (m) => (m === '$' ? '\\$' : m));

// Few notes have math or HTML, so KaTeX (lib/noteMath.ts) and the HTML parser
// (lib/noteHtml.ts) are each loaded only for a note that needs them. Both checks look
// outside code fences, on the markdown as it is rendered.
const FENCE_SPLIT = /(^```[\s\S]*?^```)/m;

// Any dollar remark-math could open math with (escapeLoneDollars has escaped the lone
// ones, and a dollar after an even run of backslashes is not escaped), or a ```math fence.
const hasMath = (md: string) => md.split(FENCE_SPLIT)
  .some((p, i) => (i % 2 ? /^```+\s*math\b/.test(p) : /(^|[^\\])(\\\\)*\$/.test(p)));

// Anything that can open a tag, comment or declaration: <mark>, <img …>, <br>, <!-- -->.
const hasHtml = (md: string) => md.split(FENCE_SPLIT).some((p, i) => i % 2 === 0 && /<[a-zA-Z!/?]/.test(p));

// Imports a chunk once it is wanted: null while it loads, 'failed' if it can't be fetched.
function useLazy<T>(wanted: boolean, load: () => Promise<T>): T | 'failed' | null {
  const [mod, setMod] = useState<T | 'failed' | null>(null);
  useEffect(() => {
    if (!wanted || mod) return;
    let alive = true;
    trackLoading(load()).then((m) => { if (alive) setMod(() => m); }).catch(() => { if (alive) setMod('failed'); });
    return () => { alive = false; };
  }, [wanted, mod]);
  return mod;
}

// ── Vault images ──────────────────────────────────────────────────────────────

const IMAGE_EMBED = /!\[\[([^\]|]+\.(?:png|jpe?g|gif|webp|svg|bmp|avif))(?:\|([^\]]*))?\]\]/gi;
const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Obsidian's ![[image.png|300]] as an <img>; ![](file.png) is already one.
function embedImages(md: string) {
  return md.replace(IMAGE_EMBED, (_, name: string, size?: string) => {
    const width = size?.match(/^\s*(\d+)/)?.[1];
    return `<img src="${escAttr(encodeURI(name.trim()))}" alt="${escAttr(name.trim())}"${width ? ` width="${width}"` : ''}>`;
  });
}

// The note being shown, so an image link can resolve relative to it.
const NotePathContext = createContext<string | null>(null);

// Vault images need the auth header, so they're fetched and shown as blob URLs.
function VaultImage({ src, alt, node: _node, ...rest }: any) {
  const note = useContext(NotePathContext);
  const external = !src || /^(https?:|data:|blob:)/i.test(src);
  const [url, setUrl] = useState<string | null>(external ? src : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (external) { setUrl(src); return; }
    let link = src as string;
    try { link = decodeURI(link); } catch { /* not encoded */ }
    let objectUrl: string | null = null;
    let alive = true;
    setFailed(false);
    trackLoading(fetch(`/api/reviews/vault/image?src=${encodeURIComponent(link)}&note=${encodeURIComponent(note ?? '')}`, {
      headers: { Authorization: `Bearer ${useAuth.getState().token ?? ''}` },
    }).then((r) => (r.ok ? r.blob() : Promise.reject())))
      .then((b) => { if (!alive) return; objectUrl = URL.createObjectURL(b); setUrl(objectUrl); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, note, external]);

  if (failed) return <span className="text-xs text-gray-400 dark:text-gray-500">[image not found: {alt || src}]</span>;
  if (!url) return <span className="inline-block w-full h-32 rounded-lg bg-gray-100 dark:bg-white/[0.05] animate-pulse" />;
  return <img src={url} alt={alt ?? ''} loading="lazy" className="max-w-full h-auto rounded-lg my-3" {...rest} />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReviewContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isRecord = location.pathname.includes('/record/');
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ratingLoading, setRatingLoading] = useState(false);
  // Editing the note's markdown in place; startHeading is where the reader was.
  const [editing, setEditing] = useState<{ startHeading?: string } | null>(null);
  const editingRef = useRef(false);
  editingRef.current = !!editing;
  const [activeId, setActiveId] = useState('');
  // The headings as rendered: the breadcrumb follows all six levels, the outline the top three.
  const [shown, setShown] = useState<Heading[]>([]);
  const outline = useMemo(() => shown.filter((h) => h.level <= 3), [shown]);
  const contentRef = useRef<HTMLDivElement>(null);

  const rawContent = (data?.content ?? '') as string;
  // Strip frontmatter, then convert ==highlight== → <mark> outside code fences
  const content = useMemo(() => {
    const stripped = rawContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
    // Split on fenced code blocks; only transform even-indexed segments (non-code)
    const parts = stripped.split(/(^```[\s\S]*?^```)/m);
    return parts.map((p, i) => i % 2 === 0 ? embedImages(escapeLoneDollars(p).replace(/==([^=\n]+)==/g, '<mark>$1</mark>')) : p).join('');
  }, [rawContent]);


  // A note that needs a plugin waits for it before it renders, so formulas and tags never
  // flash as source. If a chunk can't be loaded, the note is shown without it.
  const needsMath = useMemo(() => hasMath(content), [content]);
  const needsHtml = useMemo(() => hasHtml(content), [content]);
  const mathChunk = useLazy(needsMath, () => import('../lib/noteMath'));
  const htmlChunk = useLazy(needsHtml, () => import('../lib/noteHtml'));
  const pluginsPending = (needsMath && !mathChunk) || (needsHtml && !htmlChunk);
  const katex = needsMath && mathChunk && mathChunk !== 'failed' ? mathChunk : null;
  const rehypeRaw = needsHtml && htmlChunk && htmlChunk !== 'failed' ? htmlChunk.rehypeRaw : null;
  const rehypePlugins = useMemo(() => [
    ...(rehypeRaw ? [rehypeRaw] : []),
    ...(katex ? [[katex.rehypeKatex, KATEX_OPTIONS] as [typeof katex.rehypeKatex, typeof KATEX_OPTIONS]] : []),
  ], [rehypeRaw, katex]);

  // Per-user, per-record reading position key
  const posKey = user && id ? `rpos-${user.id}-${id}` : null;

  const courseId = (data?.record?.course_id ?? data?.course?.id) as number | undefined;
  const draftKey = user && courseId ? `ndraft-${user.id}-${courseId}` : null;
  // Only a note that was read from the vault can be saved back to it.
  const canEdit = !!courseId && !!data?.content_hash;

  // An edit left unsaved (the app was reloaded or closed) reopens on its own.
  useEffect(() => {
    if (canEdit && draftKey && readDraft(draftKey)) {
      setEditing({});
      toast('Restored your unsaved edit', { id: 'note-draft' });
    }
  }, [draftKey, canEdit]);

  useEffect(() => {
    const req = isRecord ? api.getRecordDetail(Number(id)) : api.getCourseDetail(Number(id));
    req
      .then(setData)
      .catch((err: any) => { toast.error(err.message); navigate('/review'); })
      .finally(() => setLoading(false));
  }, [id]);

  // Save scroll position as a 0–1 fraction while reading (debounced, per user per record)
  useEffect(() => {
    if (!posKey) return;
    let t: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (editingRef.current) return; // the editor's length isn't the note's
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (max > 0) localStorage.setItem(posKey, String(window.scrollY / max));
      }, 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); clearTimeout(t); };
  }, [posKey]);

  // Restore scroll position after content renders
  useEffect(() => {
    if (!posKey || !data) return;
    const saved = localStorage.getItem(posKey);
    if (!saved) return;
    const fraction = parseFloat(saved);
    if (isNaN(fraction) || fraction < 0.01) return;
    // Double rAF: first ensures React commit, second ensures layout
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0) window.scrollTo({ top: fraction * max, behavior: 'instant' });
    }));
  }, [data, posKey, pluginsPending]);

  // The active heading is the last one scrolled up to the read line; none above the first.
  useEffect(() => {
    if (!contentRef.current) return;
    const els = Array.from(contentRef.current.querySelectorAll<HTMLElement>('[data-heading]'));
    setShown(els.map((el) => ({ id: el.id, level: Number(el.tagName[1]), text: plainHeading(el.textContent ?? '') })));
    if (!els.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = '';
      for (const el of els) {
        if (el.getBoundingClientRect().top > READ_LINE) break;
        current = el.id;
      }
      setActiveId(current);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [data, pluginsPending, editing]);

  const trail = useMemo(() => headingTrail(shown, activeId), [shown, activeId]);
  const outlineActive = trail.filter((t) => t.level <= 3).pop()?.id;
  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleRating = async (rating: Rating) => {
    if (!data?.record) return;
    setRatingLoading(true);
    try {
      const r = await api.completeReview(data.record.id, rating);
      if (posKey) localStorage.removeItem(posKey);
      // One toast: the XP it earned and when it comes back.
      const next = rating === 'again' ? 'back tomorrow' : `next in ${fmtGap(r.next?.days ?? 1)}`;
      if (!celebrate(r.xp, undefined, next)) toast(next[0].toUpperCase() + next.slice(1), { id: 'review-next' });
      navigate('/review');
    } catch (err: any) { toast.error(err.message); }
    setRatingLoading(false);
  };

  // Reset to 0 every render so heading IDs keep their document order
  const hCountRef = useRef(0);
  hCountRef.current = 0;
  // scroll-margin keeps a heading jumped to clear of the header and the breadcrumb.
  const heading = (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => ({ children, node: _node, ...p }: any) => (
    <Tag id={`h-${hCountRef.current++}`} data-heading="" style={{ scrollMarginTop: READ_LINE - 4 }} {...p}>{children}</Tag>
  );
  // Memoized: new component types on every render would remount every heading whenever
  // the breadcrumb updates, leaving the scroll handler measuring detached elements.
  const mdComponents = useMemo(() => ({
    img: VaultImage,
    h1: heading('h1'), h2: heading('h2'), h3: heading('h3'),
    h4: heading('h4'), h5: heading('h5'), h6: heading('h6'),
    // A table sits on a plate like a code block and scrolls sideways, so narrow screens
    // don't squeeze its columns.
    table: ({ node: _node, ...p }: any) => (
      <div className="my-4 overflow-x-auto rounded-lg bg-[#f6f8fa] dark:bg-[#161b22] px-4 py-1">
        <table {...p} className="my-0 w-max min-w-full max-w-none" />
      </div>
    ),
    code({ className, children, ...rest }: any) {
      const text = String(children);
      // Only a fenced block ends with a newline; inline code never does.
      const language = /language-([\w+#-]+)/.exec(className ?? '')?.[1].toLowerCase()
        ?? (text.endsWith('\n') && looksLikeJson(text) ? 'json' : undefined);
      if (language) {
        return (
          <SyntaxHighlighter
            style={resolvedTheme === 'dark' ? oneDark : oneLight}
            language={language}
            PreTag="div"
            className="rounded-lg text-sm my-4"
            customStyle={resolvedTheme === 'dark'
              ? { background: '#161b22', borderRadius: '0.5rem', padding: '1rem', margin: '1rem 0', maxWidth: '100%', overflowX: 'auto' }
              : { background: '#f6f8fa', borderRadius: '0.5rem', padding: '1rem', margin: '1rem 0', maxWidth: '100%', overflowX: 'auto' }}
          >
            {text.replace(/\n$/, '')}
          </SyntaxHighlighter>
        );
      }
      return <code className={className} {...rest}>{children}</code>;
    },
  }), [resolvedTheme]);

  if (loading) return <PageSpinner />;

  const title = data?.title ?? data?.record?.course_name ?? data?.course?.name ?? 'Note';
  const obsidianUris = (data?.obsidian_uris ?? []) as string[];
  const paths = (data?.paths ?? []) as string[];
  const reviewedTimes = data?.record?.reviewed_times as number | undefined;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="md:ml-16">

      {/* Breadcrumb of the headings above the one being read, fixed under the header */}
      {editing && courseId && draftKey ? (
        <div className="h-8" /> // room for the editor's toolbar over the title row
      ) : trail.length > 0 && !pluginsPending && (
        <nav aria-label="Section"
          className="fixed top-12 inset-x-0 z-30 h-9 bg-white/90 backdrop-blur-lg border-b border-gray-200/70 dark:bg-gray-950/90 dark:border-white/[0.08]">
          <div className="max-w-5xl mx-auto px-4 md:pl-20 h-full flex items-center gap-1 text-xs min-w-0">
            {trail.map((h, i) => {
              const last = i === trail.length - 1;
              return (
                <span key={h.id} className={`flex items-center gap-1 min-w-0 ${last ? 'shrink-0 max-w-[65%]' : ''}`}>
                  {i > 0 && <ChevronRight size={12} className="flex-shrink-0 text-gray-300 dark:text-gray-600" />}
                  <button onClick={() => jumpTo(h.id)} title={h.text}
                    className={`truncate transition-colors ${last
                      ? 'font-semibold text-gray-800 dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}>
                    {h.text}
                  </button>
                </span>
              );
            })}
          </div>
        </nav>
      )}

      {/* Page header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/review')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors flex-shrink-0">
          <ArrowLeft size={18} />
        </button>
        <h1 className={`flex-1 font-bold text-lg truncate text-gray-900 dark:text-gray-100`}>
          {title}
        </h1>
        {canEdit && !editing && (
          <button onClick={() => setEditing({ startHeading: trail[trail.length - 1]?.text })} title="Edit note"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors flex-shrink-0">
            <Pencil size={16} />
          </button>
        )}
        {obsidianUris[0] && (
          <a href={obsidianUris[0]} title="Open in Obsidian"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950 text-purple-400 hover:text-purple-600 transition-colors flex-shrink-0">
            <ExternalLink size={16} />
          </a>
        )}
      </div>

      {/* Meta badges */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {reviewedTimes !== undefined && (
          <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">Review #{reviewedTimes + 1}</span>
        )}
        {paths.map((p) => (
          <span key={p} className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[220px]">{p}</span>
        ))}
      </div>

      {/* Body: outline + content */}
      <div className="flex gap-8 items-start">

        {/* Outline sidebar — desktop only, only when there are headings */}
        {outline.length > 1 && !editing && (
          <aside className="hidden lg:block w-44 flex-shrink-0">
            <nav className="sticky top-20 space-y-0.5 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Contents</p>
              {outline.map((h) => (
                <a
                  key={h.id + h.text}
                  href={`#${h.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    jumpTo(h.id);
                  }}
                  style={{ paddingLeft: `${(h.level - 1) * 10}px` }}
                  className={`block text-xs py-1 rounded truncate transition-colors leading-snug ${outlineActive === h.id
                    ? 'text-brand-600 dark:text-brand-400 font-semibold'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                  {h.text}
                </a>
              ))}
            </nav>
          </aside>
        )}

        {/* Main content */}
        <div ref={contentRef} className="flex-1 min-w-0 overflow-x-hidden">
          {editing && courseId && draftKey ? (
            <NoteEditor
              courseId={courseId}
              content={rawContent}
              baseHash={data.content_hash}
              draftKey={draftKey}
              startHeading={editing.startHeading}
              onSaved={(text, hash) => { setData((d: any) => ({ ...d, content: text, content_hash: hash })); setEditing(null); }}
              onClose={() => setEditing(null)}
            />
          ) : pluginsPending ? <PageSpinner /> : content ? (
            <div className="prose prose-sm max-w-none dark:prose-invert
              prose-headings:font-semibold prose-headings:text-gray-800 dark:prose-headings:text-gray-100
              prose-p:text-gray-600 dark:prose-p:text-gray-300 prose-p:leading-relaxed
              prose-a:text-brand-600 dark:prose-a:text-brand-400 prose-a:no-underline hover:prose-a:underline
              prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded prose-code:text-sm prose-code:text-purple-700 dark:prose-code:text-purple-400 prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-gray-100 dark:prose-pre:bg-gray-900 prose-pre:text-gray-800 dark:prose-pre:text-gray-100 prose-pre:overflow-x-auto prose-pre:max-w-full
              prose-th:whitespace-nowrap prose-td:max-w-[22rem]
              prose-blockquote:border-brand-300 dark:prose-blockquote:border-brand-700 prose-blockquote:text-gray-500 dark:prose-blockquote:text-gray-400
              prose-li:text-gray-600 dark:prose-li:text-gray-300 prose-strong:text-gray-800 dark:prose-strong:text-gray-100 prose-hr:border-gray-200 dark:prose-hr:border-gray-800">
              <NotePathContext.Provider value={paths[0] ?? null}>
                <ReactMarkdown
                  remarkPlugins={katex ? [remarkGfm, katex.remarkMath] : [remarkGfm]}
                  rehypePlugins={rehypePlugins}
                  components={mdComponents}
                >
                  {content}
                </ReactMarkdown>
              </NotePathContext.Provider>
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">No content available.</div>
          )}

          {/* Rating footer */}
          {isRecord && data?.record && !editing && (
            <div className="mt-10 pt-5 border-t border-gray-100 dark:border-white/[0.08]">
              <p className="text-xs text-gray-500 mb-1 text-center">How well did you recall it?</p>
              <p className="text-[11px] text-gray-500 mb-3 text-center">
                {data.memory?.recall != null
                  ? `Predicted recall today: ${Math.round(data.memory.recall * 100)}% · reviewed ${data.memory.reps}×${data.memory.lapses ? ` · forgot ${data.memory.lapses}×` : ''}`
                  : 'First review of this note'}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {RATINGS.map((r) => (
                  <button key={r.id} onClick={() => handleRating(r.id)} disabled={ratingLoading}
                    className={`h-14 rounded-xl border flex flex-col items-center justify-center transition-colors disabled:opacity-40 ${r.cls}`}>
                    <span className="text-sm font-bold">{r.label}</span>
                    <span className="text-[11px] opacity-80">{fmtGap(data.memory?.preview?.[r.id] ?? 1)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
