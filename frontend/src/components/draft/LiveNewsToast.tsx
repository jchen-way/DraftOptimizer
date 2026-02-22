'use client';

import { useState, useEffect, useCallback } from 'react';
import { getNews, type NewsItem } from '@/api/news';

const POLL_INTERVAL_MS = 30000;

export function LiveNewsToast() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchNews = useCallback(async () => {
    try {
      const res = await getNews();
      const list = Array.isArray(res.data) ? res.data : [];
      setItems(list);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const id = setInterval(fetchNews, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchNews]);

  const visible = items.filter((i) => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-30 space-y-2 max-w-sm" aria-live="polite">
      {visible.slice(0, 3).map((item) => (
        <div
          key={item.id}
          className="bg-app-panel border-l-4 border-budget-caution p-4 rounded-lg shadow-lg flex items-start gap-2"
        >
          <span className="text-xl shrink-0" aria-hidden>
            ⚠️
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text-primary">{item.playerName}</p>
            <p className="text-text-secondary text-sm">{item.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed((prev) => new Set(prev).add(item.id))}
            className="text-text-secondary hover:text-text-primary text-sm shrink-0"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
