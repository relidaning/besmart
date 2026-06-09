import { useState, useEffect, useCallback } from 'react';

export function useInfiniteScroll(total: number, resetKey: any = null, pageSize = 20) {
  const [visible, setVisible] = useState(pageSize);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);

  // Callback ref: fires whenever the sentinel mounts or unmounts
  const sentinelRef = useCallback((node: HTMLDivElement | null) => setSentinel(node), []);

  useEffect(() => {
    setVisible(pageSize);
  }, [resetKey, pageSize]);

  useEffect(() => {
    if (!sentinel || visible >= total) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible((v) => Math.min(v + pageSize, total));
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, visible, total, pageSize]);

  return { visible, setVisible, sentinelRef };
}
