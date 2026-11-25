import { useEffect, useState } from 'react';

/**
 * True while the on-screen keyboard is up.
 *
 * Measured from `visualViewport` rather than a keyboard plugin, so it needs no extra
 * dependency and works the same in both the Capacitor and Cordova builds. A viewport that
 * has lost more than a quarter of its height to something is the keyboard; browser chrome
 * never takes that much.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const read = () => {
      const lost = window.innerHeight - viewport.height;
      setOpen(lost > window.innerHeight * 0.25);
    };
    read();
    viewport.addEventListener('resize', read);
    return () => viewport.removeEventListener('resize', read);
  }, []);

  return open;
}
