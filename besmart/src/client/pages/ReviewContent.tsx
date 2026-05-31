import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import toast from 'react-hot-toast';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { api } from '../hooks/api';

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReviewContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isRecord = location.pathname.includes('/record/');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [activeId, setActiveId] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const req = isRecord ? api.getRecordDetail(Number(id)) : api.getCourseDetail(Number(id));
    req
      .then(setData)
      .catch((err: any) => { toast.error(err.message); navigate('/review'); })
      .finally(() => setLoading(false));
  }, [id]);

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

  const handleRating = async (rating: 'hard' | 'ok' | 'easy') => {
    if (!data?.record) return;
    setRatingLoading(true);
    try {
      await api.completeReview(data.record.id, rating);
      toast.success({ hard: 'Keep at it!', ok: 'Good job!', easy: 'Nailed it!' }[rating]);
      navigate('/review');
    } catch (err: any) { toast.error(err.message); }
    setRatingLoading(false);
  };

  const content = (data?.content ?? '') as string;

  const headings = useMemo(() => extractHeadings(content), [content]);

  // Reset to 0 every render so heading IDs stay consistent with extractHeadings
  const hCountRef = useRef(0);
  hCountRef.current = 0;
  const mdComponents = {
    h1: ({ children, ...p }: any) => <h1 id={`h-${hCountRef.current++}`} {...p}>{children}</h1>,
    h2: ({ children, ...p }: any) => <h2 id={`h-${hCountRef.current++}`} {...p}>{children}</h2>,
    h3: ({ children, ...p }: any) => <h3 id={`h-${hCountRef.current++}`} {...p}>{children}</h3>,
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const title        = data?.title ?? data?.record?.course_name ?? data?.course?.name ?? 'Note';
  const matchStatus  = data?.record?.vault_match_status ?? data?.course?.vault_match_status;
  const obsidianUris = (data?.obsidian_uris ?? []) as string[];
  const paths        = (data?.paths ?? []) as string[];
  const reviewedTimes = data?.record?.reviewed_times as number | undefined;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="md:ml-16">

      {/* Page header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/review')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors flex-shrink-0">
          <ArrowLeft size={18} />
        </button>
        <h1 className={`flex-1 font-bold text-lg truncate ${matchStatus === 'none' ? 'text-red-500' : 'text-gray-900'}`}>
          {title}
        </h1>
        {obsidianUris[0] && (
          <a href={obsidianUris[0]} title="Open in Obsidian"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-50 text-purple-400 hover:text-purple-600 transition-colors flex-shrink-0">
            <ExternalLink size={16} />
          </a>
        )}
      </div>

      {/* Meta badges */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {reviewedTimes !== undefined && (
          <span className="badge bg-purple-100 text-purple-700">Review #{reviewedTimes + 1}</span>
        )}
        {paths.length > 1 && (
          <span className="badge bg-blue-100 text-blue-700">{paths.length} notes merged</span>
        )}
        {matchStatus === 'none' && (
          <span className="badge bg-red-100 text-red-600">No vault match</span>
        )}
        {paths.map((p) => (
          <span key={p} className="text-xs text-gray-400 truncate max-w-[220px]">{p}</span>
        ))}
      </div>

      {/* Body: outline + content */}
      <div className="flex gap-8 items-start">

        {/* Outline sidebar — desktop only, only when there are headings */}
        {headings.length > 1 && (
          <aside className="hidden lg:block w-44 flex-shrink-0">
            <nav className="sticky top-20 space-y-0.5 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Contents</p>
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
                  className={`block text-xs py-1 rounded truncate transition-colors leading-snug ${
                    activeId === h.id
                      ? 'text-brand-600 font-semibold'
                      : 'text-gray-400 hover:text-gray-700'
                  }`}
                >
                  {h.text}
                </a>
              ))}
            </nav>
          </aside>
        )}

        {/* Main content */}
        <div ref={contentRef} className="flex-1 min-w-0">
          {content ? (
            <div className="prose prose-sm max-w-none
              prose-headings:font-semibold prose-headings:text-gray-800
              prose-p:text-gray-600 prose-p:leading-relaxed
              prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline
              prose-code:bg-gray-100 prose-code:px-1 prose-code:rounded prose-code:text-sm prose-code:text-purple-700 prose-code:before:content-none prose-code:after:content-none
              prose-pre:bg-gray-100 prose-pre:text-gray-800
              prose-blockquote:border-brand-300 prose-blockquote:text-gray-500
              prose-li:text-gray-600 prose-strong:text-gray-800 prose-hr:border-gray-200">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
                {content}
              </ReactMarkdown>
            </div>
          ) : matchStatus === 'none' ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">No matching note found in vault for <span className="font-medium text-gray-600">"{title}"</span>.</p>
              <p className="text-xs mt-2">Create a note in Obsidian with a matching name, then reload.</p>
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400 text-sm">No content available.</div>
          )}

          {/* Rating footer */}
          {isRecord && data?.record && (
            <div className="mt-10 pt-5 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-3 text-center">How well did you recall?</p>
              <div className="flex gap-2">
                {(['hard', 'ok', 'easy'] as const).map((r) => (
                  <button key={r} onClick={() => handleRating(r)} disabled={ratingLoading}
                    className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors disabled:opacity-40 ${
                      r === 'hard' ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' :
                      r === 'ok'   ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' :
                                     'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    }`}>
                    {r === 'hard' ? 'Hard' : r === 'ok' ? 'OK' : 'Easy'}
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
