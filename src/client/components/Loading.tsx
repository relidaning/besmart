import { useEffect, useState } from 'react';
import { onPendingChange } from '../hooks/api';

// Waits this long before showing anything, so cached and fast answers don't flicker.
const SHOW_DELAY_MS = 150;

function useDelayed(on: boolean) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) { setShown(false); return; }
    const t = setTimeout(() => setShown(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [on]);
  return shown;
}

/** A thin amber bar along the header's bottom edge while any API request is on its way. */
export function LoadingBar() {
  const [pending, setPending] = useState(0);
  useEffect(() => onPendingChange(setPending), []);
  const shown = useDelayed(pending > 0);
  return (
    <div
      aria-hidden
      className={`absolute inset-x-0 -bottom-px h-0.5 overflow-hidden pointer-events-none transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}
    >
      {shown && <div className="h-full w-full origin-left bg-brand-500 animate-loading-bar" />}
    </div>
  );
}

/** Spinner in the middle of the screen for a page whose chunk or first data is still loading. */
export function PageSpinner() {
  const shown = useDelayed(true);
  // Fills the screen between the header and the nav (main's 72px top padding, plus the
  // mobile nav's 96px bottom padding or 24px on desktop), so the spinner sits in the middle.
  return (
    <div className="flex items-center justify-center min-h-[calc(100dvh-168px)] md:min-h-[calc(100dvh-96px)]" role="status" aria-label="Loading">
      {shown && <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />}
    </div>
  );
}
