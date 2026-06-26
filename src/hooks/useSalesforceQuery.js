import { useState, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';

export function useSalesforceQuery(queryFn, deps = []) {
  const { refreshCount } = useDashboard();
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    queryFn()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshCount]);

  return state;
}
