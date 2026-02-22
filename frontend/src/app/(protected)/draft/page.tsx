'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getLeague, type League } from '@/api/leagues';
import { getTeams, getTeamRoster, type Team } from '@/api/teams';
import { getPlayers, type Player } from '@/api/players';
import {
  exportDraftLog,
  getDraftHistory,
  startTaxiRound,
  submitBid,
  undoLastPick,
  type DraftHistoryEntry,
} from '@/api/draft';
import { Toast } from '@/components/Toast';
import { DraftHeaderBar } from '@/components/draft/DraftHeaderBar';
import { DraftHistoryTicker } from '@/components/draft/DraftHistoryTicker';
import { DraftInputPanel } from '@/components/draft/DraftInputPanel';
import { PlayerPoolTable } from '@/components/draft/PlayerPoolTable';
import { AddCustomPlayerModal } from '@/components/draft/AddCustomPlayerModal';
import { BudgetTrackerTable } from '@/components/draft/BudgetTrackerTable';
import { RosterPositionView } from '@/components/draft/RosterPositionView';
import { LiveNewsToast } from '@/components/draft/LiveNewsToast';
import {
  MAIN_ROSTER_POSITIONS,
  normalizeMainSlotConfig,
  getBenchSlots,
  getMainSlotsLeft,
} from '@/components/draft/rosterUtils';

const ACTIVE_POSITION_SET = new Set<string>(MAIN_ROSTER_POSITIONS);
type DraftTab = 'draft' | 'budget' | 'roster';

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export default function DraftPage() {
  const searchParams = useSearchParams();
  const leagueId = searchParams.get('leagueId');

  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [draftHistory, setDraftHistory] = useState<DraftHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [showAvailableOnly, setShowAvailableOnly] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const [tab, setTab] = useState<DraftTab>('draft');
  const [addPlayerModalOpen, setAddPlayerModalOpen] = useState(false);
  const [rosterTeam, setRosterTeam] = useState<Team | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!leagueId) return;
    try {
      const [leagueRes, teamsRes, playersRes, historyRes] = await Promise.all([
        getLeague(leagueId),
        getTeams(leagueId),
        getPlayers(leagueId),
        getDraftHistory(leagueId),
      ]);
      setLeague(leagueRes.data);
      setTeams(Array.isArray(teamsRes.data) ? teamsRes.data : []);
      setPlayers(Array.isArray(playersRes.data) ? playersRes.data : []);
      setDraftHistory(Array.isArray(historyRes.data) ? historyRes.data : []);
    } catch {
      setError('Failed to load draft data');
      setToastType('error');
      setToast('Failed to load draft data.');
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) {
      setLoading(false);
      return;
    }
    fetchData();
  }, [leagueId, fetchData]);

  const handleConfirmPick = useCallback(
    async (playerId: string, teamId: string, amount: number) => {
      const { data } = await submitBid(playerId, teamId, amount);
      const updatedTeam = data.team;
      const updatedPlayer = data.player;
      setTeams((prev) => prev.map((team) => (team._id === updatedTeam._id ? updatedTeam : team)));
      setPlayers((prev) =>
        prev.map((player) => (player._id === updatedPlayer._id ? { ...player, ...updatedPlayer } : player))
      );
      setToastType('success');
      const pickAmountLabel = amount > 0 ? `$${amount}` : 'free';
      setToast(
        `${updatedPlayer?.name ?? 'Player'} drafted by ${updatedTeam?.ownerName ?? updatedTeam?.teamName ?? 'team'} for ${pickAmountLabel}.`
      );
      void fetchData();
    },
    [fetchData]
  );

  const handleUndoLastPick = useCallback(async () => {
    if (!leagueId) return;
    await undoLastPick(leagueId);
    await fetchData();
    setToastType('success');
    setToast('Last pick undone.');
  }, [leagueId, fetchData]);

  const handleStartTaxiRound = useCallback(async () => {
    if (!leagueId) return;
    try {
      const { data } = await startTaxiRound(leagueId);
      setToastType('success');
      setToast(data.message || 'Taxi round started.');
      await fetchData();
      setTab('draft');
    } catch {
      setToastType('error');
      setToast('Unable to start taxi round yet. Ensure all teams filled main rosters.');
    }
  }, [leagueId, fetchData]);

  const positions = useMemo(() => {
    const rosterSlots = league?.rosterSlots as Record<string, unknown> | undefined;
    if (!rosterSlots) return [...MAIN_ROSTER_POSITIONS];
    const configured = Object.entries(rosterSlots)
      .filter(([position, count]) => ACTIVE_POSITION_SET.has(position) && Number(count) > 0)
      .map(([position]) => position);
    return configured.length ? configured : [...MAIN_ROSTER_POSITIONS];
  }, [league?.rosterSlots]);
  const rosterSlotConfig = useMemo(() => {
    return normalizeMainSlotConfig(
      (league?.rosterSlots as Record<string, unknown> | undefined) ?? {}
    );
  }, [league?.rosterSlots]);
  const filteredPlayers = useMemo(
    () =>
      players.filter((p) => {
        if (showAvailableOnly && p.isDrafted) return false;
        if (search && !(p.name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
        if (positionFilter && !(p.eligiblePositions ?? []).includes(positionFilter)) return false;
        return true;
      }),
    [players, showAvailableOnly, search, positionFilter]
  );

  const draftPhase = useMemo(
    () =>
      ((league as { draftPhase?: string } | null)?.draftPhase === 'TAXI'
        ? 'TAXI'
        : 'MAIN') as 'MAIN' | 'TAXI',
    [league]
  );
  const benchSlots = useMemo(
    () => getBenchSlots((league as { benchSlots?: number } | null)?.benchSlots),
    [league]
  );
  const perTeamMainSlots = useMemo(
    () =>
      Object.values(rosterSlotConfig).reduce(
        (total, count) => total + (Number(count) || 0),
        0
      ),
    [rosterSlotConfig]
  );
  const totalMainSlots = perTeamMainSlots * (teams.length || 1);
  const totalTaxiSlots = benchSlots * (teams.length || 1);
  const playersDraftedMain = useMemo(
    () =>
      players.filter(
        (player) => Boolean(player.isDrafted) && String(player.draftPhase || '').toUpperCase() !== 'TAXI'
      ).length,
    [players]
  );
  const playersDraftedTaxi = useMemo(
    () =>
      players.filter(
        (player) => Boolean(player.isDrafted) && String(player.draftPhase || '').toUpperCase() === 'TAXI'
      ).length,
    [players]
  );
  const taxiRoundComplete = useMemo(
    () =>
      draftPhase === 'TAXI' &&
      teams.length > 0 &&
      benchSlots > 0 &&
      playersDraftedTaxi >= totalTaxiSlots,
    [draftPhase, teams.length, benchSlots, playersDraftedTaxi, totalTaxiSlots]
  );
  const headerDraftedCount = draftPhase === 'TAXI' ? playersDraftedTaxi : playersDraftedMain;
  const headerTotalSlots = draftPhase === 'TAXI' ? totalTaxiSlots : totalMainSlots;
  const playersRemaining = useMemo(
    () => Math.max(0, players.length - players.filter((player) => Boolean(player.isDrafted)).length),
    [players]
  );
  const allTeamsMainFull = useMemo(
    () =>
      teams.length > 0 &&
      teams.every((team) => getMainSlotsLeft(team, rosterSlotConfig) === 0),
    [teams, rosterSlotConfig]
  );
  useEffect(() => {
    if (draftPhase === 'TAXI' && tab === 'budget') {
      setTab('draft');
    }
  }, [draftPhase, tab]);
  const leagueMaxBid = useMemo(
    () => {
      if (!teams.length) return 0;
      return Math.max(
        ...teams.map((team) => {
          const remaining = Number(team.budget?.remaining ?? 0);
          const slotsLeft = getMainSlotsLeft(team, rosterSlotConfig);
          const reserveForMinimums = Math.max(0, slotsLeft - 1);
          return Math.max(0, remaining - reserveForMinimums);
        }),
        0
      );
    },
    [teams, rosterSlotConfig]
  );
  const currentInflationPct = useMemo(() => {
    const draftedPlayers = players.filter(
      (player) => player.isDrafted && String(player.draftPhase || '').toUpperCase() !== 'TAXI'
    );
    const spent = draftedPlayers.reduce((sum, player) => sum + (player.draftedFor ?? 0), 0);
    const expected = draftedPlayers.reduce((sum, player) => sum + (player.projectedValue ?? 0), 0);
    if (expected <= 0) return 0;
    return ((spent / expected) - 1) * 100;
  }, [players]);
  const availablePlayers = useMemo(
    () => players.filter((player) => !player.isDrafted),
    [players]
  );
  const scarcityMetrics = useMemo(() => {
    const baseMetrics = positions.map((position) => {
      const requiredForPosition = Number(rosterSlotConfig[position] ?? 0);
      if (requiredForPosition <= 0) {
        return { position, supply: 0, demand: 0, countUrgency: 0, qualityDrop: 0 };
      }

      const demand = teams.filter((team) => {
        const filled = (team.roster ?? []).filter((slot) => slot.position === position).length;
        return filled < requiredForPosition;
      }).length;
      const eligibleAvailablePlayers = availablePlayers.filter((player) =>
        (player.eligiblePositions ?? []).includes(position)
      );
      const supply = eligibleAvailablePlayers.length;
      const countUrgency = demand > 0 ? demand / Math.max(1, supply) : 0;

      let qualityDrop = 0;
      if (supply > 0) {
        const sortedValues = eligibleAvailablePlayers
          .map((player) => Number(player.projectedValue ?? 0))
          .sort((a, b) => b - a);
        const starterCutoff = Math.max(1, Math.min(sortedValues.length, demand || 1));
        const eliteWindow = sortedValues.slice(0, Math.max(1, Math.min(5, starterCutoff)));
        const replacementStart = Math.max(0, Math.min(sortedValues.length - 1, starterCutoff - 1));
        const replacementWindow = sortedValues.slice(
          replacementStart,
          Math.min(sortedValues.length, replacementStart + 4)
        );
        qualityDrop = Math.max(0, average(eliteWindow) - average(replacementWindow.length ? replacementWindow : [sortedValues[sortedValues.length - 1]]));
      }

      return { position, supply, demand, countUrgency, qualityDrop };
    });

    const countUrgencies = baseMetrics.map((metric) => metric.countUrgency).filter((value) => value > 0);
    const countBaseline = countUrgencies.length ? average(countUrgencies) : 1;
    const qualityDrops = baseMetrics.map((metric) => metric.qualityDrop).filter((value) => value > 0);
    const qualityBaseline = qualityDrops.length ? average(qualityDrops) : 1;
    const hasQualitySignal = qualityDrops.length > 0;

    const withUrgency = baseMetrics.map((metric) => {
      const normalizedCount = countBaseline > 0 ? metric.countUrgency / countBaseline : 1;
      const normalizedQuality = hasQualitySignal && qualityBaseline > 0
        ? metric.qualityDrop / qualityBaseline
        : 1;
      const urgency = (normalizedCount * 0.62) + (normalizedQuality * 0.38);
      const bidScarcityScore = metric.countUrgency * (0.72 + (normalizedQuality * 0.28));
      return { ...metric, urgency, bidScarcityScore };
    });

    return withUrgency.sort((a, b) => b.urgency - a.urgency);
  }, [positions, rosterSlotConfig, teams, availablePlayers]);
  const positionMarket = useMemo(() => {
    const map: Record<string, { demand: number; supply: number }> = {};
    for (const metric of scarcityMetrics) {
      map[metric.position] = {
        demand: Number(metric.demand ?? 0),
        supply: Number(metric.supply ?? 0),
      };
    }
    return map;
  }, [scarcityMetrics]);
  const handleExportCsv = async () => {
    if (!leagueId) return;
    setExporting(true);
    try {
      const response = await exportDraftLog(leagueId, 'csv');
      const blob = response.data;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `draft-log-${leagueId}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setToastType('success');
      setToast('Draft log downloaded.');
    } catch {
      setToastType('error');
      setToast('Failed to download draft log.');
    } finally {
      setExporting(false);
    }
  };

  if (!leagueId) {
    return (
      <div className="min-h-screen bg-app-dark text-text-primary p-6">
        <div className="max-w-2xl mx-auto">
          <p className="text-text-secondary mb-4">Select a league to open the draft.</p>
          <Link href="/dashboard" className="text-primary hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-app-dark text-text-primary p-6">
        <p className="text-text-secondary">Loading draft…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-app-dark text-text-primary p-6">
        <p className="text-budget-critical mb-4">{error}</p>
        <Link href="/dashboard" className="text-primary hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen bg-app-dark text-text-primary flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-app-border bg-app-panel">
        <Link href="/dashboard" className="text-primary hover:underline text-sm">
          ← Dashboard
        </Link>
        <span className="font-medium truncate px-2">{league?.name ?? 'Draft'}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting}
            className="rounded border border-app-border bg-app-dark px-2 py-1 text-xs text-text-primary hover:bg-app-border/25 disabled:opacity-50"
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <Link href={`/config?leagueId=${leagueId}`} className="text-text-secondary hover:text-primary text-sm">
            Config
          </Link>
        </div>
      </div>
      <DraftHeaderBar
        playersDrafted={headerDraftedCount}
        totalSlots={headerTotalSlots || 1}
        playersRemaining={playersRemaining}
        currentInflationPct={currentInflationPct}
        leagueMaxBid={leagueMaxBid}
        draftPhase={draftPhase}
      />
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-app-border bg-app-panel">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('draft')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === 'draft' ? 'bg-primary text-white' : 'bg-app-dark text-text-secondary hover:text-text-primary'
            }`}
          >
            Draft
          </button>
          {draftPhase !== 'TAXI' && (
            <button
              type="button"
              onClick={() => setTab('budget')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                tab === 'budget' ? 'bg-primary text-white' : 'bg-app-dark text-text-secondary hover:text-text-primary'
              }`}
            >
              Budget Tracker
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('roster')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === 'roster' ? 'bg-primary text-white' : 'bg-app-dark text-text-secondary hover:text-text-primary'
            }`}
          >
            Roster
          </button>
        </div>
        {draftPhase === 'MAIN' && allTeamsMainFull && benchSlots > 0 && (
          <button
            type="button"
            onClick={handleStartTaxiRound}
            className="rounded border border-budget-critical/80 bg-budget-critical/15 px-3 py-1.5 text-sm font-semibold text-budget-critical hover:bg-budget-critical/25"
          >
            Start Taxi Round
          </button>
        )}
        {taxiRoundComplete && (
          <Link
            href={`/post-draft?leagueId=${leagueId}`}
            className="rounded border border-budget-critical bg-budget-critical px-3 py-1.5 text-sm font-semibold text-white hover:bg-budget-critical/90"
          >
            Analyze Post-Draft
          </Link>
        )}
      </div>
      {tab === 'draft' && (
        <>
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 px-4 pt-3 pb-2 overflow-hidden">
            <div className="lg:col-span-2 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-text-secondary text-sm">Player pool</span>
                <button
                  type="button"
                  onClick={() => setAddPlayerModalOpen(true)}
                  className="rounded bg-app-panel border border-app-border px-3 py-1.5 text-sm text-text-primary hover:bg-app-border/30"
                >
                  + Add Custom Player
                </button>
              </div>
              <PlayerPoolTable
                players={filteredPlayers}
                search={search}
                onSearchChange={setSearch}
                positionFilter={positionFilter}
                onPositionFilterChange={setPositionFilter}
                showAvailableOnly={showAvailableOnly}
                onShowAvailableOnlyChange={setShowAvailableOnly}
                selectedPlayerId={selectedPlayer?._id ?? null}
                onSelectPlayer={setSelectedPlayer}
                positions={positions}
              />
            </div>
            <div className="min-h-0 flex flex-col">
              <DraftInputPanel
                selectedPlayer={selectedPlayer}
                teams={teams}
                onConfirmPick={handleConfirmPick}
                onUndoLastPick={handleUndoLastPick}
                onClearSelection={() => setSelectedPlayer(null)}
                latestPick={draftHistory[0] ?? null}
                canUndo={draftHistory.length > 0}
                currentInflationPct={currentInflationPct}
                rosterSlotConfig={rosterSlotConfig}
                positionMarket={positionMarket}
                draftPhase={draftPhase}
                benchSlots={benchSlots}
              />
              {draftPhase === 'MAIN' ? (
                <div className="mt-3 rounded-lg border border-app-border bg-app-panel p-3">
                  <h3 className="text-sm font-semibold text-text-primary mb-2">Position Scarcity</h3>
                  <ul className="space-y-1 text-xs text-text-secondary">
                    {scarcityMetrics.slice(0, 4).map((metric) => (
                      <li key={metric.position} className="flex items-center justify-between">
                        <span>{metric.position}</span>
                        <span>
                          {metric.demand} teams need it · {metric.supply} available
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-app-border bg-app-panel p-3 text-xs text-text-secondary">
                  <p className="font-semibold text-text-primary mb-1">Taxi Round</p>
                  <p>Bench capacity: {benchSlots} slots per team.</p>
                  <p>Taxi picks are free and do not affect budgets.</p>
                </div>
              )}
            </div>
          </div>
          <DraftHistoryTicker history={draftHistory} limit={15} />
        </>
      )}
      {tab === 'budget' && draftPhase === 'MAIN' && (
        <div className="flex-1 p-4 overflow-auto">
          <BudgetTrackerTable teams={teams} totalSlotsPerTeam={perTeamMainSlots} />
        </div>
      )}
      {tab === 'roster' && (
        <div className="flex-1 p-4 overflow-auto">
          <RosterTab
            teams={teams}
            league={league}
            onSelectTeam={(t) => setRosterTeam(t)}
            rosterTeam={rosterTeam}
            onRefresh={fetchData}
            onTeamPatched={(updatedTeam) => {
              setTeams((prev) =>
                prev.map((team) => (team._id === updatedTeam._id ? updatedTeam : team))
              );
            }}
            onStatus={(message, type = 'info') => {
              setToastType(type);
              setToast(message);
            }}
          />
        </div>
      )}
      {addPlayerModalOpen && leagueId && (
        <AddCustomPlayerModal
          leagueId={leagueId}
          onSuccess={() => fetchData()}
          onClose={() => setAddPlayerModalOpen(false)}
        />
      )}
      <LiveNewsToast />
      <Toast message={toast} type={toastType} onClose={() => setToast(null)} duration={3200} />
    </div>
  );
}

function RosterTab({
  teams,
  league,
  onSelectTeam,
  rosterTeam,
  onRefresh,
  onTeamPatched,
  onStatus,
}: {
  teams: Team[];
  league: League | null;
  onSelectTeam: (t: Team) => void;
  rosterTeam: Team | null;
  onRefresh: () => void;
  onTeamPatched: (team: Team) => void;
  onStatus: (message: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [loadedRoster, setLoadedRoster] = useState<Team | null>(null);
  const myTeam = teams.find((t) => t.isMyTeam) ?? teams[0];
  const displayTeam = rosterTeam ?? myTeam ?? null;

  const loadRoster = useCallback(async (teamId: string) => {
    const res = await getTeamRoster(teamId);
    setLoadedRoster(res.data);
    return res.data;
  }, []);

  useEffect(() => {
    if (!displayTeam?._id) return;
    loadRoster(displayTeam._id)
      .catch(() => setLoadedRoster(null));
  }, [displayTeam?._id, loadRoster]);

  useEffect(() => {
    if (!displayTeam?._id) return;
    const latestTeam = teams.find((team) => team._id === displayTeam._id);
    if (!latestTeam) return;
    setLoadedRoster((prev) => {
      if (!prev) return prev;
      return { ...prev, budget: latestTeam.budget };
    });
  }, [teams, displayTeam?._id]);

  const handleRefresh = useCallback(async () => {
    await onRefresh();
    if (displayTeam?._id) {
      try {
        await loadRoster(displayTeam._id);
      } catch {
        // no-op, stale data remains visible
      }
    }
  }, [onRefresh, displayTeam?._id, loadRoster]);

  const handleTeamUpdate = useCallback(
    (updatedTeam: Team) => {
      setLoadedRoster(updatedTeam);
      onTeamPatched(updatedTeam);
    },
    [onTeamPatched]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-text-secondary text-sm">Show roster:</span>
        {teams.map((t) => (
          <button
            key={t._id}
            type="button"
            onClick={() => onSelectTeam(t)}
            className={`px-3 py-1.5 rounded text-sm ${
              displayTeam?._id === t._id ? 'bg-primary text-white' : 'bg-app-panel border border-app-border text-text-primary'
            }`}
          >
            {t.ownerName} {t.isMyTeam && '(My Team)'}
          </button>
        ))}
      </div>
      {loadedRoster && (
        <RosterPositionView
          team={loadedRoster}
          league={league}
          onRefresh={handleRefresh}
          onStatus={onStatus}
          onTeamUpdate={handleTeamUpdate}
        />
      )}
    </div>
  );
}
