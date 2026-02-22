'use client';

import { useMemo, useState } from 'react';
import type { Team } from '@/api/teams';
import { getMainFilledCount } from './rosterUtils';

type BudgetTrackerTableProps = {
  teams: Team[];
  totalSlotsPerTeam?: number;
};

type SortKey = 'remaining' | 'ownerName' | 'slotsLeft';

function getStatusColor(remaining: number, total: number) {
  const pct = total > 0 ? (remaining / total) * 100 : 0;
  if (pct > 20) return 'text-budget-safe';
  if (pct >= 10) return 'text-budget-caution';
  return 'text-budget-critical';
}

export function BudgetTrackerTable({ teams, totalSlotsPerTeam: totalSlotsProp }: BudgetTrackerTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('remaining');
  const [sortDesc, setSortDesc] = useState(true);

  const totalSlotsPerTeam = useMemo(() => {
    if (typeof totalSlotsProp === 'number' && totalSlotsProp > 0) return totalSlotsProp;
    const t = teams[0];
    if (!t?.roster) return 23;
    return (t.roster as unknown[]).length;
  }, [teams, totalSlotsProp]);

  const teamsWithMeta = useMemo(() => {
    return teams.map((t) => {
      const rosterLen = getMainFilledCount(t);
      const total = t.budget?.total ?? 260;
      const remaining = t.budget?.remaining ?? total;
      const slotsLeft = Math.max(0, (totalSlotsPerTeam || 23) - rosterLen);
      const minHold = Math.max(0, slotsLeft - 1);
      const maxBid = Math.max(0, remaining - minHold);
      return {
        ...t,
        remaining,
        total,
        slotsLeft,
        maxBid,
      };
    });
  }, [teams, totalSlotsPerTeam]);

  const sorted = useMemo(() => {
    const arr = [...teamsWithMeta];
    arr.sort((a, b) => {
      let va: number | string = a.remaining;
      let vb: number | string = b.remaining;
      if (sortKey === 'ownerName') {
        va = a.ownerName ?? '';
        vb = b.ownerName ?? '';
      } else if (sortKey === 'slotsLeft') {
        va = a.slotsLeft;
        vb = b.slotsLeft;
      }
      const cmp = typeof va === 'string' ? String(va).localeCompare(String(vb)) : va - (vb as number);
      return sortDesc ? -cmp : cmp;
    });
    return arr;
  }, [teamsWithMeta, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(key === 'ownerName' ? false : true);
    }
  };

  return (
    <div className="bg-app-panel border border-app-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-text-primary">
          <thead className="bg-app-dark text-text-secondary border-b border-app-border">
            <tr>
              <th className="px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort('ownerName')}
                  className="hover:text-text-primary"
                >
                  Team {sortKey === 'ownerName' && (sortDesc ? ' ↓' : ' ↑')}
                </button>
              </th>
              <th className="px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort('remaining')}
                  className="hover:text-text-primary"
                >
                  Budget Left {sortKey === 'remaining' && (sortDesc ? ' ↓' : ' ↑')}
                </button>
              </th>
              <th className="px-3 py-2 font-medium">Max Bid</th>
              <th className="px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort('slotsLeft')}
                  className="hover:text-text-primary"
                >
                  Slots Left {sortKey === 'slotsLeft' && (sortDesc ? ' ↓' : ' ↑')}
                </button>
              </th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const statusColor = getStatusColor(t.remaining, t.total);
              const statusLabel =
                t.remaining < 10
                  ? '$1 Only'
                  : t.remaining > 100
                    ? 'Rich'
                  : t.remaining < totalSlotsPerTeam
                    ? 'Nearly Done'
                    : 'Active';
              return (
                <tr key={t._id} className="border-b border-app-border">
                  <td className="px-3 py-2">
                    {t.ownerName}
                    {t.isMyTeam && (
                      <span className="ml-1 text-primary font-medium">(YOUR TEAM)</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 font-medium ${statusColor}`}>${t.remaining}</td>
                  <td className="px-3 py-2">${t.maxBid}</td>
                  <td className="px-3 py-2">{t.slotsLeft}</td>
                  <td className={`px-3 py-2 ${statusColor}`}>{statusLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
