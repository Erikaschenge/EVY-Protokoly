import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from './errors';

export type AsyncState<T> = { loading: boolean; data?: T; error?: string; reload: () => void };

/** Načítanie údajov so stavom načítavania a chyby. */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ loading: boolean; data?: T; error?: string }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn().then(
      (data) => alive && setState({ loading: false, data }),
      (e) => alive && setState({ loading: false, error: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  return { ...state, reload };
}

/** Spustenie akcie s ošetrením chyby – žiadna chyba neostane nezobrazená. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (fn: () => unknown) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy, error, setError };
}
