import { useEffect, useRef } from "react";

/**
 * Runs `fn` now and then every `intervalMs` while the tab is visible. A
 * hidden tab stops polling (each poll is a Docker API round trip on the
 * server) and refreshes once when it becomes visible again.
 */
export function usePolling(fn: () => unknown, intervalMs: number, enabled = true): void {
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => {
    void latest.current();
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer === undefined) timer = setInterval(() => void latest.current(), intervalMs);
    };
    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        void latest.current();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
