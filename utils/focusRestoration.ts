import { setFocus, doesFocusableExist, navigateByDirection } from '@noriginmedia/norigin-spatial-navigation';

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

function getNavDirection(e: KeyboardEvent): 'up' | 'down' | 'left' | 'right' | null {
  if (e.key === 'ArrowUp' || e.key === 'Up' || e.keyCode === 38) return 'up';
  if (e.key === 'ArrowDown' || e.key === 'Down' || e.keyCode === 40) return 'down';
  if (e.key === 'ArrowLeft' || e.key === 'Left' || e.keyCode === 37) return 'left';
  if (e.key === 'ArrowRight' || e.key === 'Right' || e.keyCode === 39) return 'right';
  return null;
}

/**
 * Safely restores focus when returning to a page.
 * 
 * Prevents:
 * 1. "Focus snapping back" (late timer pulling focus away after user navigates)
 * 2. "Focus disappearing" (user navigates before initial focus was set, resulting in no focus)
 */
export function restoreFocusSafely({
  targetKey,
  fallbackKey,
  delays = [20, 60, 150, 300, 500],
  onSuccess,
  onInitialSetup,
}: RestoreFocusOptions): () => void {
  if (onInitialSetup) {
    onInitialSetup();
  }

  let focusRestored = false;
  let isCleanedUp = false;
  let pendingDirection: 'up' | 'down' | 'left' | 'right' | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];

  const clearTimers = () => {
    timers.forEach(t => clearTimeout(t));
    timers = [];
  };

  const attempt = (isFinal: boolean) => {
    if (focusRestored || isCleanedUp) return;

    try {
      if (targetKey && doesFocusableExist(targetKey)) {
        setFocus(targetKey);
        focusRestored = true;
        clearTimers();
        if (onSuccess) onSuccess(targetKey);

        if (pendingDirection) {
          const dir = pendingDirection;
          pendingDirection = null;
          try {
            navigateByDirection(dir);
          } catch (e) {
            setTimeout(() => {
              try { navigateByDirection(dir); } catch (err) {}
            }, 10);
          }
        }
        return;
      }

      if (isFinal) {
        const finalKey = (fallbackKey && doesFocusableExist(fallbackKey))
          ? fallbackKey
          : (targetKey && doesFocusableExist(targetKey) ? targetKey : fallbackKey);

        if (finalKey) {
          try {
            setFocus(finalKey);
            focusRestored = true;
            if (onSuccess) onSuccess(finalKey);
            if (pendingDirection) {
              const dir = pendingDirection;
              pendingDirection = null;
              try {
                navigateByDirection(dir);
              } catch (e) {}
            }
          } catch (e) {}
        }
        clearTimers();
      }
    } catch (err) {
      if (isFinal && fallbackKey) {
        try {
          setFocus(fallbackKey);
          focusRestored = true;
          if (onSuccess) onSuccess(fallbackKey);
        } catch (e) {}
        clearTimers();
      }
    }
  };

  const handleUserNav = (e: KeyboardEvent | MouseEvent | WheelEvent | TouchEvent) => {
    if (isCleanedUp) return;

    if (e instanceof KeyboardEvent) {
      const dir = getNavDirection(e);
      if (dir) {
        if (!focusRestored) {
          if (targetKey && doesFocusableExist(targetKey)) {
            // Target exists right now! Focus it so SpatialNavigation has a starting point!
            setFocus(targetKey);
            focusRestored = true;
            clearTimers();
            if (onSuccess) onSuccess(targetKey);
            // DO NOT stop event propagation: the event will bubble to SpatialNavigation,
            // which sees targetKey is now focused, and naturally navigates in `dir`!
            return;
          } else if (fallbackKey && doesFocusableExist(fallbackKey)) {
            setFocus(fallbackKey);
            focusRestored = true;
            clearTimers();
            if (onSuccess) onSuccess(fallbackKey);
            return;
          } else {
            // Element not in DOM yet! Save direction so the timer applies it as soon as target mounts
            pendingDirection = dir;
            // DO NOT CLEAR TIMERS! If we clear timers here, nothing will ever mount/focus!
            return;
          }
        }
        // If focus was already restored, user is navigating normally.
        // Timers are already dead, so nothing to do.
        return;
      }

      // Tab or Enter pressed
      if (e.key === 'Tab' || e.key === 'Enter' || e.keyCode === 9 || e.keyCode === 13) {
        if (!focusRestored) {
          if (targetKey && doesFocusableExist(targetKey)) {
            setFocus(targetKey);
            focusRestored = true;
            clearTimers();
            if (onSuccess) onSuccess(targetKey);
          } else if (fallbackKey && doesFocusableExist(fallbackKey)) {
            setFocus(fallbackKey);
            focusRestored = true;
            clearTimers();
            if (onSuccess) onSuccess(fallbackKey);
          }
        }
      }
    } else {
      // Mouse/Touch interaction: user clicked an element directly
      focusRestored = true;
      clearTimers();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleUserNav, { capture: true });
    window.addEventListener('mousedown', handleUserNav, { capture: true });
    window.addEventListener('wheel', handleUserNav, { capture: true, passive: true });
    window.addEventListener('touchstart', handleUserNav, { capture: true, passive: true });
  }

  // 1. Immediate synchronous attempt on mount!
  attempt(false);

  // 2. Fast requestAnimationFrame attempt (runs right after layout calculation)
  if (!focusRestored && typeof window !== 'undefined') {
    requestAnimationFrame(() => attempt(false));
  }

  // 3. If not yet ready, schedule retry timers
  if (!focusRestored) {
    timers = delays.map((delay, idx) =>
      setTimeout(() => attempt(idx === delays.length - 1), delay)
    );
  }

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
