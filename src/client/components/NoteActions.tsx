import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const noteActionButton =
  'flex h-12 w-12 items-center justify-center rounded-full shadow-lg shadow-black/20 transition-colors active:scale-95 disabled:opacity-50';

export default function NoteActions({ children }: { children: ReactNode }) {
  return createPortal(
    <div
      role="group"
      aria-label="Note actions"
      className="fixed top-1/2 right-[max(calc(1rem+env(safe-area-inset-right)),calc((100%-64rem)/2-0.5rem))] z-30 flex -translate-y-1/2 flex-col gap-2"
    >
      {children}
    </div>,
    document.body,
  );
}
