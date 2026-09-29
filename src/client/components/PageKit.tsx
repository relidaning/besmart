import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ATTR_META, type Attribute } from '../lib/garden';

// Shared building blocks that give every page the Growth Garden look.
// Variant names match the `hidden`/`show` labels every page container uses,
// so these join the page's stagger animation.

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export function PageHeader({ icon: Icon, iconClass, title, subtitle, actions, onBack, backLabel = 'Back' }: {
  icon: LucideIcon;
  iconClass: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <motion.div variants={item}>
      {onBack && (
        <button onClick={onBack} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 mb-3 block">
          ← {backLabel}
        </button>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Icon size={24} className={`flex-shrink-0 ${iconClass}`} />
            <span className="break-words min-w-0">{title}</span>
          </h1>
          {subtitle && <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </motion.div>
  );
}

export interface Stat {
  value: ReactNode;
  label: ReactNode;
  valueClass: string;
  /** 0–100: draws a thin animated progress bar under the label. */
  progress?: number;
  barClass?: string;
}

export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <motion.div variants={item} className="grid grid-cols-3 gap-3">
      {stats.map((s, i) => (
        <div key={i} className="card p-4 text-center">
          <div className={`text-2xl font-bold flex items-center justify-center gap-1 ${s.valueClass}`}>{s.value}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center justify-center gap-1">{s.label}</div>
          {s.progress !== undefined && (
            <div className="h-1 mt-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${s.barClass ?? 'bg-emerald-500'}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.max(0, s.progress))}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          )}
        </div>
      ))}
    </motion.div>
  );
}

// The XP an item will earn when completed, in its attribute's color.
export function XpChip({ attribute, amount, dim = false }: { attribute: Attribute; amount: ReactNode; dim?: boolean }) {
  const meta = ATTR_META[attribute];
  return (
    <span
      title={`Earns ${meta.label} XP`}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${meta.chip} ${dim ? 'opacity-50' : ''}`}
    >
      +{amount} {meta.emoji}
    </span>
  );
}

export function EmptyState({ icon: Icon, iconClass = 'text-gray-300 dark:text-gray-700', title, children }: {
  icon: LucideIcon;
  iconClass?: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <motion.div variants={item} className="card text-center py-12">
      <div className={`flex justify-center mb-4 ${iconClass}`}><Icon size={48} /></div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
      {children}
    </motion.div>
  );
}
