'use client';

import { useCallback, useMemo } from 'react';
import { swapPosition } from '@/api/draft';
import type { Team } from '@/api/teams';
import type { League } from '@/api/leagues';
import {
  MAIN_ROSTER_POSITIONS,
  normalizeMainSlotConfig,
  getBenchSlots,
} from './rosterUtils';

type PopulatedPlayer = { _id: string; name?: string; eligiblePositions?: string[] };
type RosterSlot = {
  playerId: string | PopulatedPlayer;
  position: string;
  cost: number;
  draftPhase: string;
};

type RosterPositionViewProps = {
  team: Team;
  league: League | null;
  onRefresh: () => void;
  onStatus?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onTeamUpdate?: (team: Team) => void;
};

function getVacantEligiblePositions(
  eligiblePositions: string[],
  roster: RosterSlot[],
  currentPosition: string,
  slotCounts: Record<string, number>
): string[] {
  return (eligiblePositions ?? []).filter(
    (pos) => {
      if (pos === currentPosition) return false;
      const maxSlots = Number(slotCounts[pos] ?? 0);
      if (maxSlots <= 0) return false;
      const currentlyFilled = roster.filter((s) => s.position === pos).length;
      return currentlyFilled < maxSlots;
    }
  );
}

export function RosterPositionView({
  team,
  league,
  onRefresh,
  onStatus,
  onTeamUpdate,
}: RosterPositionViewProps) {
  const roster = useMemo(() => (team.roster ?? []) as RosterSlot[], [team.roster]);
  const slotCounts = useMemo(
    () => normalizeMainSlotConfig((league?.rosterSlots as Record<string, unknown> | undefined) ?? {}),
    [league?.rosterSlots]
  );
  const benchSlots = useMemo(
    () => getBenchSlots((league as { benchSlots?: number } | null)?.benchSlots),
    [league]
  );

  const handlePositionChange = useCallback(
    async (playerId: string, newPosition: string) => {
      try {
        const response = await swapPosition(playerId, newPosition);
        if (response?.data?.team) {
          onTeamUpdate?.(response.data.team);
        }
        void onRefresh();
        onStatus?.(`Position updated to ${newPosition}.`, 'success');
      } catch {
        onStatus?.('Failed to update player position.', 'error');
      }
    },
    [onRefresh, onStatus, onTeamUpdate]
  );

  const slotsByPosition = useCallback(() => {
    const map: Record<string, RosterSlot[]> = {};
    for (const position of MAIN_ROSTER_POSITIONS) {
      const configuredCount = Number(slotCounts[position] ?? 0);
      if (configuredCount <= 0) continue;
      map[position] = roster.filter((slot) => slot.position === position);
    }
    return map;
  }, [roster, slotCounts])();
  const benchRoster = useMemo(
    () =>
      roster.filter(
        (slot) =>
          slot?.draftPhase === 'TAXI' ||
          String(slot?.position || '').toUpperCase() === 'BENCH'
      ),
    [roster]
  );
  const displayRows = useMemo(() => {
    const rows: Array<{ position: string; slots: RosterSlot[]; max: number }> = [];
    for (const [position, slots] of Object.entries(slotsByPosition)) {
      const max = Number((slotCounts as Record<string, number>)[position] ?? 0);
      if (max <= 0) continue;
      rows.push({ position, slots, max });
    }
    if (benchSlots > 0) {
      rows.push({ position: 'BENCH', slots: benchRoster, max: benchSlots });
    }
    return rows;
  }, [slotsByPosition, slotCounts, benchSlots, benchRoster]);

  return (
    <div className="bg-app-panel border border-app-border rounded-lg overflow-hidden">
      <div className="p-2 border-b border-app-border">
        <h3 className="font-medium text-text-primary">
          {team.ownerName} {team.isMyTeam && '(YOUR TEAM)'}
        </h3>
        <p className="text-text-secondary text-sm">
          ${team.budget?.remaining ?? 0} remaining · {(team.roster ?? []).length} filled
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-text-primary">
          <thead className="bg-app-dark text-text-secondary border-b border-app-border">
            <tr>
              <th className="px-3 py-2 font-medium">Position</th>
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Cost</th>
              <th className="px-3 py-2 font-medium">Move to</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.flatMap(({ position: pos, slots, max }) => {
              const placeholders = Array.from({ length: max }, (_, i) => i);
              return placeholders.map((_, i) => {
                const slot = slots[i];
                const pop = slot?.playerId && typeof slot.playerId === 'object' ? (slot.playerId as PopulatedPlayer) : null;
                const playerName = pop?.name ?? (slot?.playerId ? String(slot.playerId) : null);
                const pid = pop?._id ?? (slot?.playerId as string) ?? '';
                const eligible = pop?.eligiblePositions ?? [];
                const vacant = pos !== 'BENCH' && slot
                  ? getVacantEligiblePositions(eligible, roster, slot.position, slotCounts as Record<string, number>)
                  : [];
                return (
                  <tr key={`${pos}-${i}`} className="border-b border-app-border">
                    <td className="px-3 py-2">{pos}</td>
                    <td className="px-3 py-2">{playerName ?? '—'}</td>
                    <td className="px-3 py-2">{slot ? (slot.cost > 0 ? `$${slot.cost}` : 'Free') : '—'}</td>
                    <td className="px-3 py-2">
                      {slot && vacant.length > 0 && pid ? (
                        <select
                          value=""
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v) handlePositionChange(pid, v);
                          }}
                          className="rounded bg-app-dark border border-app-border px-2 py-1 text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">—</option>
                          {vacant.map((vpos) => (
                            <option key={vpos} value={vpos}>
                              {vpos}
                            </option>
                          ))}
                        </select>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
