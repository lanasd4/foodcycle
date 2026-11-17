import { useEffect, useState } from 'react';

/**
 * Current time that updates every `intervalMs`.
 * The clock is read in the state initializer and in the timer only, never
 * during render, so a render always shows a consistent "now".
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * Seconds left until a deadline the server gave as "seconds from now".
 * When the server sends a fresh value (refetch), the deadline is re-anchored.
 */
export function useCountdown(seconds: number | null) {
  const now = useNow(1000);
  const [anchor, setAnchor] = useState(() => ({ seconds, at: Date.now() }));
  // Adjusting state while rendering when a prop changes (React-documented pattern):
  // the new anchor uses the last tick's time, not a fresh clock read.
  if (anchor.seconds !== seconds) setAnchor({ seconds, at: now });
  if (seconds == null) return null;
  return Math.max(0, Math.round(anchor.seconds! - (now - anchor.at) / 1000));
}
