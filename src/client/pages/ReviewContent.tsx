import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
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
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { api } from '../hooks/api';
import { useAuth } from '../store/auth';
import { useTheme } from '../contexts/ThemeContext';

// The full Prism build bundles ~300 grammars (~1MB). Register only what the vault's
// notes actually use; unknown fence languages still render, just unhighlighted.
for (const [lang, grammar] of Object.entries({
  bash, sh: bash, shell: bash, zsh: bash, c, cpp, css, diff, docker, dockerfile: docker, go,
  ini, cnf: ini, java, javascript, js: javascript, json, jsonc: json, jsonl: json, jsx, log, lua,
  markdown, md: markdown, markup, html: markup, xml: markup, nginx, properties, python, py: python,
  sql, tsx, typescript, ts: typescript, yaml, yml: yaml,
})) {
  SyntaxHighlighter.registerLanguage(lang, grammar);
}

// ── Heading helpers ───────────────────────────────────────────────────────────

interface Heading { level: number; text: string; id: string; }

function extractHeadings(md: string): Heading[] {
  // Strip fenced code blocks so `# inside code` isn't treated as a heading
  const stripped = md.replace(/^`{3,}.*$[\s\S]*?^`{3,}/gm, '');
  let idx = 0;
  return stripped.split('\n')
    .filter((line) => /^#{1,3}\s/.test(line))
    .map((line) => {
      const m = line.match(/^(#{1,3})\s+(.+)$/)!;
      return { level: m[1].length, text: m[2].trim(), id: `h-${idx++}` };
    });
}

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
  const [activeId, setActiveId] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  // Per-user, per-record reading position key
  const posKey = user && id ? `rpos-${user.id}-${id}` : null;

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
  }, [data, posKey]);

  // Track active heading via IntersectionObserver
  useEffect(() => {
    if (!contentRef.current) return;
    const els = contentRef.current.querySelectorAll('h1[id],h2[id],h3[id]');
    if (!els.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-10% 0px -75% 0px' }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [data]);

  const handleRating = async (rating: Rating) => {
    if (!data?.record) return;
    setRatingLoading(true);
    try {
      const r = await api.completeReview(data.record.id, rating);
      if (posKey) localStorage.removeItem(posKey);
      // The XP toast confirms the review; this one says when it comes back.
      toast(rating === 'again' ? 'Back tomorrow to relearn' : `Next review in ${fmtGap(r.next?.days ?? 1)}`, { id: 'review-next' });
      navigate('/review');
    } catch (err: any) { toast.error(err.message); }
    setRatingLoading(false);
  };

  const rawContent = (data?.content ?? '') as string;
  // Strip frontmatter, then convert ==highlight== → <mark> outside code fences
  const content = useMemo(() => {
    const stripped = rawContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
    // Split on fenced code blocks; only transform even-indexed segments (non-code)
    const parts = stripped.split(/(^```[\s\S]*?^```)/m);
    return parts.map((p, i) => i % 2 === 0 ? p.replace(/==([^=\n]+)==/g, '<mark>$1</mark>') : p).join('');
  }, [rawContent]);

  const headings = useMemo(() => extractHeadings(content), [content]);

  // Reset to 0 every render so heading IDs stay consistent with extractHeadings
  const hCountRef = useRef(0);
  hCountRef.current = 0;
  const mdComponents = {
    h1: ({ children, ...p }: any) => <h1 id={`h-${hCountRef.current++}`} {...p}>{children}</h1>,
    h2: ({ children, ...p }: any) => <h2 id={`h-${hCountRef.current++}`} {...p}>{children}</h2>,
    h3: ({ children, ...p }: any) => <h3 id={`h-${hCountRef.current++}`} {...p}>{children}</h3>,
    code({ className, children, ...rest }: any) {
      const match = /language-(\w+)/.exec(className ?? '');
      if (match) {
        return (
          <SyntaxHighlighter
            style={resolvedTheme === 'dark' ? oneDark : oneLight}
            language={match[1]}
            PreTag="div"
            className="rounded-lg text-sm my-4"
            customStyle={resolvedTheme === 'dark'
              ? { background: '#161b22', borderRadius: '0.5rem', padding: '1rem', margin: '1rem 0', maxWidth: '100%', overflowX: 'auto' }
              : { background: '#f6f8fa', borderRadius: '0.5rem', padding: '1rem', margin: '1rem 0', maxWidth: '100%', overflowX: 'auto' }}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        );
      }
      return <code className={className} {...rest}>{children}</code>;
    },
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const title = data?.title ?? data?.record?.course_name ?? data?.course?.name ?? 'Note';
  const obsidianUris = (data?.obsidian_uris ?? []) as string[];
  const paths = (data?.paths ?? []) as string[];
  const reviewedTimes = data?.record?.reviewed_times as number | undefined;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="md:ml-16">

      {/* Page header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/review')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors flex-shrink-0">
          <ArrowLeft size={18} />
        </button>
        <h1 className={`flex-1 font-bold text-lg truncate text-gray-900 dark:text-gray-100`}>
          {title}
        </h1>
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
        {headings.length > 1 && (
          <aside className="hidden lg:block w-44 flex-shrink-0">
            <nav className="sticky top-20 space-y-0.5 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Contents</p>
              {headings.map((h) => (
                <a
                  key={h.id + h.text}
                  href={`#${h.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    setActiveId(h.id);
                  }}
                  style={{ paddingLeft: `${(h.level - 1) * 10}px` }}
                  className={`block text-xs py-1 rounded truncate transition-colors leading-snug ${activeId === h.id
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
          {content ? (
            <div className="prose prose-sm max-w-none dark:prose-invert
              prose-headings:font-semibold prose-headings:text-gray-800 dark:prose-headings:text-gray-100
              prose-p:text-gray-600 dark:prose-p:text-gray-300 prose-p:leading-relaxed
              prose-a:text-brand-600 dark:prose-a:text-brand-400 prose-a:no-underline hover:prose-a:underline
              prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded prose-code:text-sm prose-code:text-purple-700 dark:prose-code:text-purple-400 prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-gray-100 dark:prose-pre:bg-gray-900 prose-pre:text-gray-800 dark:prose-pre:text-gray-100 prose-pre:overflow-x-auto prose-pre:max-w-full
              prose-table:block prose-table:overflow-x-auto
              prose-blockquote:border-brand-300 dark:prose-blockquote:border-brand-700 prose-blockquote:text-gray-500 dark:prose-blockquote:text-gray-400
              prose-li:text-gray-600 dark:prose-li:text-gray-300 prose-strong:text-gray-800 dark:prose-strong:text-gray-100 prose-hr:border-gray-200 dark:prose-hr:border-gray-800">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">No content available.</div>
          )}

          {/* Rating footer */}
          {isRecord && data?.record && (
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
