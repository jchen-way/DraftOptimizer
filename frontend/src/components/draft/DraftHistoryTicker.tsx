'use client';

import type { DraftHistoryEntry } from '@/api/draft';

type DraftHistoryTickerProps = {
  history: DraftHistoryEntry[];
  limit?: number;
};

export function DraftHistoryTicker({ history, limit = 10 }: DraftHistoryTickerProps) {
  const items = history.slice(0, limit);
  const display = [...items].reverse();

  return (
    <div className="border-t border-app-border bg-app-panel text-text-secondary text-sm overflow-x-auto">
      <div className="flex items-center gap-4 py-2 px-3 min-w-max">
        <span className="text-text-primary font-medium shrink-0">Last picks:</span>
        {display.length === 0 ? (
          <span className="italic">No picks yet.</span>
        ) : (
          display.map((entry) => {
            const player = entry.playerId;
            const team = entry.teamId;
            const name = typeof player === 'object' && player?.name ? player.name : '—';
            const posArr = typeof player === 'object' && player?.eligiblePositions;
            const pos = Array.isArray(posArr) ? (posArr[0] ?? '') : '';
            const teamName = typeof team === 'object' && team?.ownerName ? team.ownerName : '—';
            return (
              <span
                key={entry._id}
                className="shrink-0 whitespace-nowrap"
              >{`${name} (${pos}) → ${teamName} | $${entry.amount}`}</span>
            );
          })
        )}
      </div>
    </div>
  );
}
