import { ATTR_META, type Attribute } from '../lib/garden';
import { AttrDot, Bar } from './PageKit';

export interface AttributeLevel {
  attribute: Attribute;
  level: number;
  xp: number;
  floor: number;
  next: number;
}

// floatingsphere's meter: title left, bold value right, thin bar, muted sub line.
export default function AttributeBar({ a, compact = false }: { a: AttributeLevel; compact?: boolean }) {
  const meta = ATTR_META[a.attribute];
  const pct = ((a.xp - a.floor) / (a.next - a.floor)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-2">
          <AttrDot attribute={a.attribute} />{meta.label}
        </span>
        <span className={`font-bold text-gray-900 dark:text-gray-100 ${compact ? 'text-sm' : 'text-base'}`}>Lv {a.level}</span>
      </div>
      <div className={compact ? 'mt-1.5' : 'mt-2 mb-1.5'}>
        <Bar pct={pct} className={meta.bar} thin={compact} />
      </div>
      {!compact && (
        <div className="text-[11px] text-gray-500">
          {a.xp.toLocaleString()} XP · {(a.next - a.xp).toLocaleString()} to Lv {a.level + 1}
        </div>
      )}
    </div>
  );
}
