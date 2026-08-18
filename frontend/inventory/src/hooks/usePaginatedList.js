import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';

const DEFAULT_LIMIT = 20;

export function usePaginatedList(endpoint, { params = {}, enabled = true, limit = DEFAULT_LIMIT } = {}) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const paramsRef = useRef(params);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    paramsRef.current = params;
  }, [paramsKey, params]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, paramsKey]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError('');
      const res = await api.get(endpoint, {
        params: {
          ...paramsRef.current,
          page,
          limit,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
      });
      setItems(res.data.data || []);
      setTotal(res.data.total ?? 0);
      setTotalPages(res.data.totalPages ?? 1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, enabled, limit, debouncedSearch, page, paramsKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    items,
    page,
    setPage,
    total,
    totalPages,
    loading,
    error,
    search,
    setSearch,
    refresh,
  };
}

export async function fetchAllPages(endpoint, params = {}, pageSize = 50) {
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await api.get(endpoint, { params: { ...params, page, limit: pageSize } });
    all.push(...(res.data.data || []));
    totalPages = res.data.totalPages || 1;
    page += 1;
  } while (page <= totalPages);
  return all;
}
