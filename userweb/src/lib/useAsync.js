// Async data loading with the three states every screen actually has.
//
// THE BUG THIS FIXES: screens were written as
//
//     const [d, setD] = useState(null);
//     useEffect(() => { req(...).then(setD) }, []);
//     if (!d) return <p>در حال بارگذاری…</p>;
//
// which has no failure path at all. If the request rejects, `d` stays null
// and the user sits on a loading spinner forever with no error and no retry.
// Confirmed on the live league tab.
//
// It also had no cancellation, so a response arriving after the component
// unmounted set state on a dead component (React logs a warning and the
// update is lost).
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @param {() => Promise<any>} loader  must be stable (wrap in useCallback)
 * @param {Array} deps                 re-run when these change
 * @returns {{data, error, loading, reload}}
 */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // Guards against setting state after unmount, and against an older request
  // overwriting a newer one when deps change quickly.
  const runId = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const run = useCallback(async () => {
    const id = ++runId.current;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader();
      if (!alive.current || id !== runId.current) return;
      setState({ data, error: null, loading: false });
    } catch (e) {
      if (!alive.current || id !== runId.current) return;
      setState({ data: null, error: e, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { ...state, reload: run };
}
