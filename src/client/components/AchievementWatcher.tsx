import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { api } from '../hooks/api';
import { AchievementModal, type Achievement } from './GardenStats';

// Pops the achievement modal (the one tapping an achievement on Home opens) the
// moment one is earned. The API client fires `besmart:xp` after every completion
// that earned XP; the unlocked set seen last is remembered per user, and the first
// check on a device only records it, so old achievements never pop.
export default function AchievementWatcher({ userId }: { userId: number }) {
  const key = `besmart-achievements-${userId}`;
  const [queue, setQueue] = useState<Achievement[]>([]);
  const checking = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        const r = await api.getGardenSummary();
        const unlocked = ((r?.data?.achievements ?? []) as Achievement[]).filter((a) => a.progress >= a.goal);
        let seen: string[] | null = null;
        try { seen = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { /* storage unavailable */ }
        if (seen) {
          const fresh = unlocked.filter((a) => !seen!.includes(a.id));
          if (fresh.length) setQueue((q) => [...q, ...fresh]);
        }
        try { localStorage.setItem(key, JSON.stringify(unlocked.map((a) => a.id))); } catch { /* ignore */ }
      } catch { /* offline: try on the next completion */ }
      checking.current = false;
    };
    check();
    window.addEventListener('besmart:xp', check);
    return () => window.removeEventListener('besmart:xp', check);
  }, [key]);

  const current = queue[0];
  return (
    <AnimatePresence>
      {current && <AchievementModal key={current.id} a={current} onClose={() => setQueue((q) => q.slice(1))} />}
    </AnimatePresence>
  );
}
