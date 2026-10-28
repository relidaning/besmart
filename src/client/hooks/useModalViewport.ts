import { useEffect, useState, type CSSProperties } from 'react';

// For a full-screen modal overlay on phones. While `open`:
// - the page under it is frozen (body `position: fixed`; iOS ignores `overflow: hidden`
//   on body, so the page scrolled along with a drag inside the modal), and put back
//   where it was on close;
// - the returned style sizes the overlay to the visual viewport, the part above the
//   iOS keyboard. A `fixed inset-0` overlay keeps the full screen height, so the
//   keyboard covered the bottom of a centered dialog.
export function useModalViewport(open: boolean): CSSProperties {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    const body = document.body.style;
    const saved = { position: body.position, top: body.top, left: body.left, right: body.right, width: body.width };
    Object.assign(body, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', width: '100%' });

    const vv = window.visualViewport;
    const update = () => vv && setBox({ top: vv.offsetTop, height: vv.height });
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      Object.assign(body, saved);
      window.scrollTo(0, y);
      setBox(null);
    };
  }, [open]);

  return box ? { top: box.top, height: box.height, bottom: 'auto' } : {};
}
