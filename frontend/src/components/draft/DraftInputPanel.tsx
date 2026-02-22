'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Player } from '@/api/players';
import type { Team } from '@/api/teams';
import type { DraftHistoryEntry } from '@/api/draft';
import {
  getEligibleOpenPositions,
  getMainSlotsLeft,
  getTaxiSlotsLeft,
} from './rosterUtils';

type DraftPhase = 'MAIN' | 'TAXI';

type DraftInputPanelProps = {
  selectedPlayer: Player | null;
  teams: Team[];
  onConfirmPick: (playerId: string, teamId: string, amount: number) => Promise<void>;
  onUndoLastPick: () => Promise<void>;
  onClearSelection: () => void;
  latestPick: DraftHistoryEntry | null;
  canUndo: boolean;
  currentInflationPct: number;
  rosterSlotConfig: Record<string, number>;
  positionMarket: Record<string, { demand: number; supply: number }>;
  draftPhase: DraftPhase;
  benchSlots: number;
};

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object') return fallback;
  const response = (err as { response?: { data?: { message?: string } } }).response;
  if (typeof response?.data?.message === 'string' && response.data.message.trim()) {
    return response.data.message;
  }
  return fallback;
}

export function DraftInputPanel({
  selectedPlayer,
  teams,
  onConfirmPick,
  onUndoLastPick,
  onClearSelection,
  latestPick,
  canUndo,
  currentInflationPct,
  rosterSlotConfig,
  positionMarket,
  draftPhase,
  benchSlots,
}: DraftInputPanelProps) {
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [price, setPrice] = useState<string>('1');
  const [submitting, setSubmitting] = useState(false);
  const [undoModalOpen, setUndoModalOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myTeam = teams.find((t) => t.isMyTeam);
  const defaultTeamId = myTeam?._id ?? teams[0]?._id ?? '';
  const eligiblePositions = selectedPlayer?.eligiblePositions ?? [];

  const teamStatus = useMemo(
    () =>
      teams.map((team) => {
        const mainSlotsLeft = getMainSlotsLeft(team, rosterSlotConfig);
        const openEligiblePositions = getEligibleOpenPositions(
          team,
          rosterSlotConfig,
          eligiblePositions
        );
        const canDraftMain = selectedPlayer
          ? mainSlotsLeft > 0 && openEligiblePositions.length > 0
          : mainSlotsLeft > 0;
        const taxiSlotsLeft = getTaxiSlotsLeft(team, benchSlots);
        const canDraftTaxi = taxiSlotsLeft > 0;
        return {
          team,
          mainSlotsLeft,
          openEligiblePositions,
          canDraftMain,
          taxiSlotsLeft,
          canDraftTaxi,
        };
      }),
    [teams, rosterSlotConfig, eligiblePositions, selectedPlayer, benchSlots]
  );

  useEffect(() => {
    if (!teams.length) {
      if (selectedTeamId) setSelectedTeamId('');
      return;
    }

    const selected = teamStatus.find((entry) => entry.team._id === selectedTeamId);
    const selectedIsValid = selected
      ? draftPhase === 'TAXI'
        ? selected.canDraftTaxi || !selectedPlayer
        : selected.canDraftMain || !selectedPlayer
      : false;
    if (selectedIsValid) return;

    const preferred = teamStatus.find((entry) => entry.team._id === defaultTeamId);
    const preferredValid = preferred
      ? draftPhase === 'TAXI'
        ? preferred.canDraftTaxi || !selectedPlayer
        : preferred.canDraftMain || !selectedPlayer
      : false;
    if (preferredValid) {
      if (selectedTeamId !== defaultTeamId) setSelectedTeamId(defaultTeamId);
      return;
    }

    const firstEligible = teamStatus.find((entry) =>
      draftPhase === 'TAXI' ? entry.canDraftTaxi : entry.canDraftMain
    );
    const fallback = firstEligible?.team._id ?? teams[0]?._id ?? '';
    if (fallback && fallback !== selectedTeamId) {
      setSelectedTeamId(fallback);
    }
  }, [teams, teamStatus, selectedTeamId, draftPhase, selectedPlayer, defaultTeamId]);

  const selectedTeamStatus = useMemo(
    () => teamStatus.find((entry) => entry.team._id === selectedTeamId) ?? null,
    [teamStatus, selectedTeamId]
  );
  const selectedTeam = selectedTeamStatus?.team ?? null;

  const parsedPrice = Number.parseInt(price, 10);
  const validPrice = Number.isFinite(parsedPrice) && parsedPrice >= 1;
  const selectedTeamMaxBid = selectedTeam
    ? Math.max(
        0,
        (selectedTeam.budget?.remaining ?? 0) -
          Math.max(0, (selectedTeamStatus?.mainSlotsLeft ?? 0) - 1)
      )
    : 0;
  const withinTeamMaxBid =
    draftPhase === 'TAXI' ? true : validPrice && parsedPrice <= selectedTeamMaxBid;
  const selectedTeamCanDraft = selectedTeamStatus
    ? draftPhase === 'TAXI'
      ? selectedTeamStatus.canDraftTaxi
      : selectedTeamStatus.canDraftMain
    : false;
  const canSubmitPick = Boolean(
    !submitting &&
      selectedPlayer &&
      selectedTeamId &&
      selectedTeamCanDraft &&
      withinTeamMaxBid &&
      (draftPhase === 'TAXI' || validPrice)
  );

  const projectedRemaining =
    selectedTeam && validPrice
      ? Math.max(0, (selectedTeam.budget?.remaining ?? 0) - parsedPrice)
      : null;
  const selectedTeamRoster = Array.isArray(selectedTeam?.roster) ? selectedTeam.roster : [];
  const neededEligiblePositions = selectedTeam
    ? getEligibleOpenPositions(selectedTeam, rosterSlotConfig, eligiblePositions)
    : eligiblePositions;
  const baseValue = Number(selectedPlayer?.projectedValue ?? 0);
  const injuryRiskPct = Number(selectedPlayer?.valuation?.injuryRiskPct ?? 0);
  const positionFactorValues = neededEligiblePositions.map((position) => {
    const market = positionMarket[position] ?? { demand: 0, supply: 0 };
    const supply = Math.max(1, Number(market.supply ?? 0));
    const globalDemand = Math.max(0, Number(market.demand ?? 0));
    const globalPressure = globalDemand / supply;
    const globalScarcityFactor = 1 + globalPressure * 0.9;

    if (!selectedTeam) return Math.min(1.8, Math.max(1, globalScarcityFactor));
    const requiredSlots = Number(rosterSlotConfig[position] ?? 0);
    const filledSlots = selectedTeamRoster.filter((slot) => slot.position === position).length;
    const missingSlots = Math.max(0, requiredSlots - filledSlots);
    const teamNeedPressure = missingSlots / supply;
    const combinedPressure = teamNeedPressure * 0.7 + globalPressure * 0.3;
    const scarcityFactor = 1 + combinedPressure * 0.9;
    return Math.min(1.8, Math.max(1, scarcityFactor));
  });
  const teamScarcityFactor = selectedTeam
    ? positionFactorValues.length
      ? Math.max(...positionFactorValues)
      : 1
    : 1;
  const scarcityLabel =
    teamScarcityFactor >= 1.35
      ? 'very scarce'
      : teamScarcityFactor >= 1.15
        ? 'scarce'
        : teamScarcityFactor <= 0.95
          ? 'deep'
          : 'neutral';
  const inflationAdjusted = baseValue * (1 + currentInflationPct / 100);
  const scarcityPremium = Math.min(Math.max(0, (teamScarcityFactor - 1) * 10), 8);
  const fairValue = Math.max(1, inflationAdjusted + scarcityPremium);
  const injuryRate = Math.max(0, injuryRiskPct / 100);
  const injuryDiscountFloor =
    injuryRiskPct >= 30 ? 4 : injuryRiskPct >= 20 ? 3 : injuryRiskPct >= 12 ? 2 : injuryRiskPct >= 7 ? 1 : 0;
  const injuryDiscount = Math.min(
    Math.max(injuryDiscountFloor, fairValue * (injuryRate * 0.85)),
    14
  );
  const recommendationBase = Math.max(1, Math.round(fairValue - injuryDiscount));
  const recommendedBid = selectedTeam
    ? Math.max(0, Math.min(recommendationBase, selectedTeamMaxBid))
    : recommendationBase;
  const bidAssessment =
    draftPhase === 'MAIN' && validPrice && selectedTeam
      ? parsedPrice > selectedTeamMaxBid
        ? 'Over cap'
        : parsedPrice <= recommendedBid - 2
          ? 'Value'
          : parsedPrice <= recommendedBid + 2
            ? 'Fair'
            : 'Overpay'
      : null;

  const handleConfirm = useCallback(async () => {
    if (!selectedPlayer || !selectedTeamId) return;

    if (draftPhase === 'TAXI') {
      if (!selectedTeamCanDraft) {
        setError('Selected team has no bench slots left for taxi round.');
        return;
      }
      setError(null);
      setSubmitting(true);
      try {
        await onConfirmPick(selectedPlayer._id, selectedTeamId, 0);
        setPrice('1');
        onClearSelection();
      } catch (err) {
        setError(getApiErrorMessage(err, 'Taxi pick failed to save. Please retry.'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const amount = Number.parseInt(price, 10);
    if (isNaN(amount) || amount < 1) return;
    if (!selectedTeamCanDraft) {
      setError('Selected team does not have an open eligible roster slot for this player.');
      return;
    }
    if (selectedTeam && amount > selectedTeamMaxBid) {
      setError(
        `Maximum allowed bid is $${selectedTeamMaxBid} with ${selectedTeamStatus?.mainSlotsLeft ?? 0} roster spots left.`
      );
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onConfirmPick(selectedPlayer._id, selectedTeamId, amount);
      setPrice('1');
      onClearSelection();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Pick failed to save. Please retry.'));
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedPlayer,
    selectedTeamId,
    draftPhase,
    selectedTeamCanDraft,
    onConfirmPick,
    onClearSelection,
    price,
    selectedTeam,
    selectedTeamMaxBid,
    selectedTeamStatus?.mainSlotsLeft,
  ]);

  const handleUndoConfirm = useCallback(async () => {
    setError(null);
    setUndoing(true);
    try {
      await onUndoLastPick();
      setUndoModalOpen(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to undo the last pick.'));
    } finally {
      setUndoing(false);
    }
  }, [onUndoLastPick]);

  const latestPickPlayerName =
    latestPick && typeof latestPick.playerId === 'object'
      ? latestPick.playerId.name ?? 'Player'
      : 'Player';
  const latestPickPlayerPos =
    latestPick && typeof latestPick.playerId === 'object'
      ? latestPick.playerId.eligiblePositions?.[0] ?? ''
      : '';
  const latestPickTeamName =
    latestPick && typeof latestPick.teamId === 'object'
      ? latestPick.teamId.ownerName ?? latestPick.teamId.teamName ?? 'Team'
      : 'Team';

  return (
    <div className="flex flex-col h-full bg-app-panel border border-app-border rounded-lg p-4 text-text-primary">
      {error && (
        <p className="mb-3 rounded-md border border-budget-critical/80 bg-budget-critical/10 px-3 py-2 text-sm text-text-primary" role="alert">
          {error}
        </p>
      )}

      {!selectedPlayer ? (
        <p className="text-text-secondary text-sm">
          {draftPhase === 'TAXI'
            ? 'Select a player from the pool to add a free taxi pick.'
            : 'Select a player from the pool to log a pick.'}
        </p>
      ) : (
        <>
          <div className="mb-4">
            <p className="font-medium text-text-primary">{selectedPlayer.name}</p>
            <p className="text-text-secondary text-sm">
              {(selectedPlayer.eligiblePositions ?? []).join(', ') || '—'} · Proj{' '}
              {selectedPlayer.projectedValue != null ? selectedPlayer.projectedValue : '—'}
            </p>
            {draftPhase === 'MAIN' && selectedTeam && (
              <div className="mt-2 rounded-md border border-app-border bg-app-dark/70 px-2 py-2 text-xs text-text-secondary space-y-1">
                <p>
                  Fair value: ${fairValue.toFixed(0)} ({currentInflationPct >= 0 ? '+' : ''}
                  {currentInflationPct.toFixed(1)}% inflation
                  {scarcityPremium > 0 ? ` +$${scarcityPremium.toFixed(0)} scarcity` : ''})
                </p>
                <p>
                  Team max bid: ${selectedTeamMaxBid} · Recommended bid: ${recommendedBid}
                  {injuryDiscount > 0
                    ? ` (-$${injuryDiscount.toFixed(0)} injury discount)`
                    : ' (no injury discount)'}
                </p>
                <p>
                  Injury risk: {injuryRiskPct.toFixed(1)}% · Scarcity factor: {teamScarcityFactor.toFixed(3)} ({scarcityLabel})
                </p>
                {selectedTeamStatus && (
                  <p>
                    Open slots for this player: {selectedTeamStatus.openEligiblePositions.length > 0
                      ? selectedTeamStatus.openEligiblePositions.join(', ')
                      : 'None'}
                  </p>
                )}
                {bidAssessment && (
                  <p>
                    Current entry assessment:{' '}
                    <span
                      className={
                        bidAssessment === 'Value'
                          ? 'text-budget-safe'
                          : bidAssessment === 'Fair'
                            ? 'text-budget-caution'
                            : 'text-budget-critical'
                      }
                    >
                      {bidAssessment}
                    </span>
                  </p>
                )}
              </div>
            )}
            {draftPhase === 'TAXI' && selectedTeamStatus && (
              <div className="mt-2 rounded-md border border-app-border bg-app-dark/70 px-2 py-2 text-xs text-text-secondary space-y-1">
                <p>Taxi picks are free in this round.</p>
                <p>
                  Bench slots left: {selectedTeamStatus.taxiSlotsLeft} / {benchSlots}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-text-secondary text-sm mb-1">Team</label>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full rounded bg-app-dark border border-app-border px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {teamStatus.map((entry) => {
                  const canDraft = draftPhase === 'TAXI' ? entry.canDraftTaxi : entry.canDraftMain;
                  const disableOption = Boolean(selectedPlayer) && !canDraft;
                  return (
                    <option key={entry.team._id} value={entry.team._id} disabled={disableOption}>
                      {entry.team.ownerName} ({entry.team.teamName}) ·{' '}
                      {draftPhase === 'TAXI'
                        ? `${entry.taxiSlotsLeft}/${benchSlots} bench slots left`
                        : `$${entry.team.budget?.remaining ?? 0} left · ${entry.mainSlotsLeft} main slots left`}
                    </option>
                  );
                })}
              </select>
            </div>

            {draftPhase === 'MAIN' && (
              <div>
                <label className="block text-text-secondary text-sm mb-1">Price</label>
                <input
                  type="number"
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded bg-app-dark border border-app-border px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {selectedTeam && projectedRemaining != null && (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs text-text-secondary">
                      Budget preview: ${selectedTeam.budget?.remaining ?? 0} → ${projectedRemaining}
                    </p>
                    <p className="text-xs text-text-secondary">
                      Max legal bid right now: ${selectedTeamMaxBid} ({selectedTeamStatus?.mainSlotsLeft ?? 0} slots left)
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canSubmitPick}
              className="w-full rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 transition-colors"
            >
              {draftPhase === 'TAXI'
                ? submitting
                  ? 'Adding…'
                  : 'ADD TAXI PICK (FREE)'
                : submitting
                  ? 'Submitting…'
                  : 'CONFIRM PICK'}
            </button>
          </div>
        </>
      )}

      <div className="mt-auto pt-4 border-t border-app-border">
        <button
          type="button"
          onClick={() => setUndoModalOpen(true)}
          disabled={!canUndo}
          className="w-full rounded border border-app-border bg-app-dark hover:bg-app-border/30 text-text-primary text-sm py-2 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Undo Last Pick
        </button>
      </div>

      {undoModalOpen && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="undo-title"
        >
          <div className="bg-app-panel border border-app-border rounded-lg p-4 shadow-lg max-w-sm w-full mx-4">
            <h2 id="undo-title" className="font-medium text-text-primary mb-2">
              Undo last pick?
            </h2>
            {latestPick && (
              <p className="text-text-primary text-sm mb-2">
                {latestPickPlayerName}
                {latestPickPlayerPos ? ` (${latestPickPlayerPos})` : ''} → {latestPickTeamName} for ${latestPick.amount}
              </p>
            )}
            <p className="text-text-secondary text-sm mb-4">
              This will remove the last pick from draft history and return the player to the pool.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setUndoModalOpen(false)}
                disabled={undoing}
                className="rounded border border-app-border bg-app-dark text-text-primary px-3 py-1.5 text-sm hover:bg-app-border/30"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUndoConfirm}
                disabled={undoing}
                className="rounded bg-budget-critical hover:bg-budget-critical/90 text-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {undoing ? 'Undoing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
