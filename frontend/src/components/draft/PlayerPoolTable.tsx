'use client';

import type { Player } from '@/api/players';

type PlayerPoolTableProps = {
  players: Player[];
  search: string;
  onSearchChange: (value: string) => void;
  positionFilter: string;
  onPositionFilterChange: (value: string) => void;
  showAvailableOnly: boolean;
  onShowAvailableOnlyChange: (value: boolean) => void;
  selectedPlayerId: string | null;
  onSelectPlayer: (player: Player | null) => void;
  positions: string[];
};

export function PlayerPoolTable({
  players,
  search,
  onSearchChange,
  positionFilter,
  onPositionFilterChange,
  showAvailableOnly,
  onShowAvailableOnlyChange,
  selectedPlayerId,
  onSelectPlayer,
  positions,
}: PlayerPoolTableProps) {
  return (
    <div className="flex flex-col h-full min-h-0 max-h-full bg-app-panel border border-app-border rounded-lg overflow-hidden">
      <div className="p-2 border-b border-app-border flex flex-wrap gap-2">
        <input
          id="draft-player-search"
          type="search"
          placeholder="Search players..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 min-w-[120px] rounded bg-app-dark border border-app-border px-2 py-1.5 text-text-primary text-sm placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label="Search players"
        />
        <select
          value={positionFilter}
          onChange={(e) => onPositionFilterChange(e.target.value)}
          className="rounded bg-app-dark border border-app-border px-2 py-1.5 text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label="Filter by position"
        >
          <option value="">All positions</option>
          {positions.map((pos) => (
            <option key={pos} value={pos}>
              {pos}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-text-secondary text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showAvailableOnly}
            onChange={(e) => onShowAvailableOnlyChange(e.target.checked)}
            className="rounded border-app-border text-primary focus:ring-primary"
          />
          Available
        </label>
      </div>
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full text-sm text-left">
          <thead className="sticky top-0 bg-app-panel text-text-secondary border-b border-app-border">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Pos</th>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Proj Val</th>
              <th className="px-3 py-2 font-medium">ADP</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="text-text-primary">
            {players.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-text-secondary text-center">
                  No players match.
                </td>
              </tr>
            ) : (
              players.map((p) => {
                const isSelected = p._id === selectedPlayerId;
                return (
                  <tr
                    key={p._id}
                    onClick={() => onSelectPlayer(isSelected ? null : p)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectPlayer(isSelected ? null : p);
                      }
                    }}
                    tabIndex={0}
                    aria-selected={isSelected}
                    className={`border-b border-app-border cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary/20 text-text-primary'
                        : 'hover:bg-app-dark'
                    }`}
                  >
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2">
                      {(p.eligiblePositions ?? []).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2">{p.mlbTeam ?? '—'}</td>
                    <td className="px-3 py-2">
                      {p.projectedValue != null ? p.projectedValue : '—'}
                    </td>
                    <td className="px-3 py-2">{p.adp != null ? p.adp : '—'}</td>
                    <td className="px-3 py-2">
                      {p.isDrafted ? (
                        <span className="text-budget-caution">Drafted</span>
                      ) : (
                        <span className="text-budget-safe">Available</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
