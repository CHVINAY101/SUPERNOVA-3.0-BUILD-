import { useEffect, useState } from "react";

export interface RowsState<T> {
  rows: T[] | null;
  failed: boolean;
}

export function usePublicRows<T>(load: () => PromiseLike<{ data: T[] | null; error: unknown }>): RowsState<T> {
  const [state, setState] = useState<RowsState<T>>({ rows: null, failed: false });

  useEffect(() => {
    let active = true;
    Promise.resolve(load())
      .then((res) => {
        if (!active) return;
        const { data, error } = res || {};
        if (error) {
          console.warn("Public content load warning:", error);
          if (data && Array.isArray(data) && data.length > 0) {
            setState({ rows: data, failed: false });
            return;
          }
          setState({ rows: data ?? [], failed: false });
          return;
        }
        setState({ rows: data ?? [], failed: false });
      })
      .catch((err) => {
        if (!active) return;
        console.warn("Public content load exception:", err);
        setState({ rows: [], failed: false });
      });
    return () => {
      active = false;
    };
  }, [load]);

  return state;
}
