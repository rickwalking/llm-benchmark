import { useState, useEffect } from 'react';

interface UseFetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFetch<T>(url: string | null): UseFetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const urlString = url; // capture non-null url

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(urlString);
        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(body.error || `HTTP ${response.status}`);
        }
        const result = await response.json();
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [url, refreshTrigger]);

  const refetch = () => setRefreshTrigger(prev => prev + 1);

  return { data, loading, error, refetch };
}

interface UseMutationOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

interface UseMutationResult<V> {
  mutate: (variables: V) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useMutation<T, V>(
  url: string,
  options: UseMutationOptions<T> = {}
): UseMutationResult<V> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mutate(variables: V) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(variables)
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      options.onSuccess?.(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      options.onError?.(message);
    } finally {
      setLoading(false);
    }
  }

  return { mutate, loading, error };
}
