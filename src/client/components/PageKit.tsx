import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ATTR_META, type Attribute } from '../lib/garden';

// Shared building blocks styled after floatingsphere's web view: small bold
// headings, muted meta text, ink numbers, thin meter bars, status dots.
// Variant names match the `hidden`/`show` labels every page container uses,
// so these join the page's stagger animation.

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function PageHeader({ icon: Icon, title, subtitle, actions, onBack, backLabel = 'Back' }: {
  icon: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <motion.div variants={item}>
      {onBack && (
        <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-3 block">
          ‹ {backLabel}
        </button>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Icon size={18} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />
            <span className="min-w-0">{title}</span>
          </h1>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </motion.div>
  );
}

// A card heading row: bold title left, muted meta right (floatingsphere's .head).
export function CardHead({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-3">
      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</h2>
      {meta && <span className="text-[11px] text-gray-500 flex items-center gap-2">{meta}</span>}
    </div>
  );
}

// Thin meter bar; `tick` marks a reference point (e.g. time elapsed).
export function Bar({ pct, className = 'bg-brand-400', tick, thin = false }: {
  pct: number;
  className?: string;
  tick?: number;
  thin?: boolean;
}) {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  return (
    <div className={`relative ${thin ? 'h-1.5' : 'h-2'} rounded-full bg-gray-200/70 dark:bg-white/[0.08]`}>
      <motion.div
        className={`absolute inset-y-0 left-0 rounded-full ${className}`}
        initial={{ width: 0 }}
        animate={{ width: `${clamp(pct)}%` }}
        transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
      />
      {tick !== undefined && (
        <div className="absolute -top-[3px] w-0.5 h-[calc(100%+6px)] rounded-sm bg-gray-900 dark:bg-white" style={{ left: `${clamp(tick)}%` }} />
      )}
    </div>
  );
}

export interface Stat {
  value: ReactNode;
  label: ReactNode;
  /** `critical` for values that need attention, `muted` for zero/idle. */
  tone?: 'critical' | 'muted';
  /** 0–100: draws a thin meter bar under the value. */
  progress?: number;
  barClass?: string;
}

const TONE = {
  critical: 'text-[#d64545] dark:text-[#ec8a8a]',
  muted: 'text-gray-400 dark:text-gray-600',
};

export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <motion.div variants={item} className="grid grid-cols-3 gap-3">
      {stats.map((s, i) => (
        <div key={i} className="card !p-3.5">
          <div className="text-[11px] text-gray-500 flex items-center gap-1">{s.label}</div>
          <div className={`text-xl font-bold mt-0.5 flex items-center gap-1 ${s.tone ? TONE[s.tone] : 'text-gray-900 dark:text-gray-100'}`}>
            {s.value}
          </div>
          {s.progress !== undefined && <div className="mt-2"><Bar pct={s.progress} className={s.barClass} thin /></div>}
        </div>
      ))}
    </motion.div>
  );
}

export function AttrDot({ attribute }: { attribute: Attribute }) {
  return <span className={`dot ${ATTR_META[attribute].dot}`} />;
}

// The XP an item will earn when completed: attribute dot + amount.
export function XpChip({ attribute, amount }: { attribute: Attribute; amount: ReactNode }) {
  const meta = ATTR_META[attribute];
  return (
    <span title={`Earns ${meta.label} XP`} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 whitespace-nowrap">
      <AttrDot attribute={attribute} />+{amount} XP
    </span>
  );
}

export function EmptyState({ icon: Icon, title, children }: {
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <motion.div variants={item} className="card text-center py-10">
      <div className="flex justify-center mb-3 text-gray-300 dark:text-gray-700"><Icon size={32} /></div>
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">{title}</h3>
      <div className="text-xs text-gray-500 [&_p]:mb-4">{children}</div>
    </motion.div>
  );
}
