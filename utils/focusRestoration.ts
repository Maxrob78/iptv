import { setFocus, doesFocusableExist } from '@noriginmedia/norigin-spatial-navigation';

export interface RestoreFocusOptions {
  /** The target key to focus (e.g. last focused movie, series, channel, or favorite) */
  targetKey: string | null | undefined;
  /** Fallback key if targetKey cannot be focused after final attempt (e.g. search bar) */
  fallbackKey?: string | null;
  /** Array of delay intervals in milliseconds to try focusing */
  delays?: number[];
  /** Callback when focus is successfully restored */
  onSuccess?: (key: string) => void;
  /** Optional initial setup before scheduling timers (e.g. resetting scroll) */
  onInitialSetup?: () => void;
}

/**
 * Safely restores focus when returning to a page.
 * 
 * Prevents the "focus snapping back" bug where a late timer overwrites
 * a user's intentional navigation after pressing 'Back'.
 * 
 * - If user presses ANY arrow/directional key, Tab, Enter, or mouse click/wheel/touch,
 *   all pending timers are immediately cancelled and focus is NOT stolen.
 * - As soon as a focus attempt succeeds on an existing element,
 *   all subsequent timers are cancelled immediately.
 * - Cleanup function is returned for useEffect.
 */
export function restoreFocusSafely({
  targetKey,
  fallbackKey,
  delays = [50, 150, 300, 500],
  onSuccess,
  onInitialSetup,
}: RestoreFocusOptions): () => void {
  if (onInitialSetup) {
    onInitialSetup();
  }

  let userInteracted = false;
  let isCleanedUp = false;
  let timers: ReturnType<typeof setTimeout>[] = [];

  const clearTimers = () => {
    timers.forEach(t => clearTimeout(t));
    timers = [];
  };

  const handleUserNav = (e: KeyboardEvent | MouseEvent | WheelEvent | TouchEvent) => {
    if (e instanceof KeyboardEvent) {
      const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'];
      const altKeys = ['Up', 'Down', 'Left', 'Right'];
      const navCodes = [37, 38, 39, 40, 13, 9];
      if (navKeys.includes(e.key) || altKeys.includes(e.key) || navCodes.includes(e.keyCode)) {
        userInteracted = true;
        clearTimers();
      }
    } else {
      userInteracted = true;
      clearTimers();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleUserNav, { capture: true });
    window.addEventListener('mousedown', handleUserNav, { capture: true });
    window.addEventListener('wheel', handleUserNav, { capture: true, passive: true });
    window.addEventListener('touchstart', handleUserNav, { capture: true, passive: true });
  }

  const attempt = (isFinal: boolean) => {
    if (userInteracted || isCleanedUp) return;

    try {
      if (targetKey && doesFocusableExist(targetKey)) {
        setFocus(targetKey);
        clearTimers();
        if (onSuccess) onSuccess(targetKey);
        return;
      }

      if (isFinal) {
        const finalKey = (fallbackKey && doesFocusableExist(fallbackKey))
          ? fallbackKey
          : (targetKey && doesFocusableExist(targetKey) ? targetKey : fallbackKey);

        if (finalKey) {
          try {
            setFocus(finalKey);
            if (onSuccess) onSuccess(finalKey);
          } catch (e) {}
        }
        clearTimers();
      }
    } catch (err) {
      if (isFinal && fallbackKey) {
        try {
          setFocus(fallbackKey);
          if (onSuccess) onSuccess(fallbackKey);
        } catch (e) {}
        clearTimers();
      }
    }
  };

  timers = delays.map((delay, idx) =>
    setTimeout(() => attempt(idx === delays.length - 1), delay)
  );

  return () => {
    isCleanedUp = true;
    clearTimers();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleUserNav, { capture: true });
      window.removeEventListener('mousedown', handleUserNav, { capture: true });
      window.removeEventListener('wheel', handleUserNav, { capture: true });
      window.removeEventListener('touchstart', handleUserNav, { capture: true });
    }
  };
}
