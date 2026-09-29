import { motion } from 'framer-motion';
import { ATTR_META, type Attribute } from '../lib/garden';

export interface AttributeLevel {
  attribute: Attribute;
  level: number;
  xp: number;
  floor: number;
  next: number;
}

export default function AttributeBar({ a, compact = false }: { a: AttributeLevel; compact?: boolean }) {
  const meta = ATTR_META[a.attribute];
  const pct = Math.round(((a.xp - a.floor) / (a.next - a.floor)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-gray-800 dark:text-gray-200">
          {meta.emoji} {meta.label}
        </span>
        <span className={`font-bold ${meta.text}`}>Lv {a.level}</span>
      </div>
      <div className={`${compact ? 'h-1.5' : 'h-2.5'} mt-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden`}>
        <motion.div
          className={`h-full rounded-full ${meta.bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      {!compact && (
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {a.xp.toLocaleString()} XP · {(a.next - a.xp).toLocaleString()} to Lv {a.level + 1}
        </div>
      )}
    </div>
  );
}
