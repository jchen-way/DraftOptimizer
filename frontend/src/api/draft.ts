import { apiClient } from './client';
import type { Player } from './players';
import type { Team } from './teams';

export interface DraftHistoryEntry {
  _id: string;
  leagueId: string;
  playerId: string | { _id: string; name?: string; eligiblePositions?: string[] };
  teamId: string | { _id: string; ownerName?: string; teamName?: string };
  amount: number;
  phase: string;
  createdAt: string;
}

export interface PostDraftTeamSummary {
  teamId: string;
  ownerName: string;
  teamName: string;
  isMyTeam: boolean;
  budgetRemaining: number;
  rosterSize: number;
  categoryTotals: Record<string, number>;
}

export interface PostDraftMatchupOutlook {
  opponentTeamId: string;
  opponentOwnerName: string;
  opponentTeamName: string;
  projectedResult: 'Likely win' | 'Likely loss' | 'Toss-up';
  categoryRecord: {
    wins: number;
    losses: number;
    ties: number;
  };
  winningCategories: string[];
  losingCategories: string[];
}

export interface PostDraftCategoryEdge {
  category: string;
  edge: number;
  myValue: number;
  leagueAverage: number;
}

export interface PostDraftExportRow {
  [key: string]: string | number;
}

export interface PostDraftAnalysisResponse {
  generatedAt: string;
  league: {
    leagueId: string;
    name: string;
    scoringCategories: string[];
  };
  myTeamId: string | null;
  myTeamSummary: (PostDraftTeamSummary & { rosterRows: PostDraftExportRow[] }) | null;
  teamSummaries: PostDraftTeamSummary[];
  matchupOutlook: PostDraftMatchupOutlook[];
  strengths: PostDraftCategoryEdge[];
  weaknesses: PostDraftCategoryEdge[];
  summaryText: string;
  exports: {
    myRosterRows: PostDraftExportRow[];
    allRosterRows: PostDraftExportRow[];
    draftLogRows: PostDraftExportRow[];
  };
}

export function getDraftHistory(leagueId: string) {
  return apiClient.get<DraftHistoryEntry[]>('/draft/history', {
    params: { leagueId },
  });
}

export function submitKeeper(playerId: string, teamId: string, keeperPrice: number) {
  return apiClient.post<DraftHistoryEntry>('/draft/keeper', { playerId, teamId, keeperPrice });
}

export function submitBid(playerId: string, teamId: string, amount: number) {
  return apiClient.post<{ team: Team; player: Player }>('/draft/bid', {
    playerId,
    teamId,
    amount,
  });
}

export function undoLastPick(leagueId: string) {
  return apiClient.delete<{
    message: string;
    success: boolean;
    undone?: {
      playerId: string;
      teamId: string;
      amount: number;
      phase: string;
    };
  }>(
    '/draft/bid/last',
    { params: { leagueId } }
  );
}

export function swapPosition(playerId: string, newPosition: string) {
  return apiClient.put<{ team: Team; player: Player }>(
    '/draft/position',
    { playerId, newPosition }
  );
}

export function finalizeKeepers(leagueId: string) {
  return apiClient.post<{
    message: string;
    summary: {
      totalKeepers: number;
      totalKeeperSpend: number;
      minRemainingBudget: number;
      maxRemainingBudget: number;
    };
  }>('/draft/keepers/finalize', { leagueId });
}

export function reopenKeepers(leagueId: string) {
  return apiClient.post<{ message: string }>('/draft/keepers/reopen', { leagueId });
}

export function startTaxiRound(leagueId: string) {
  return apiClient.post<{
    message: string;
    draftPhase: 'TAXI';
    benchSlots: number;
  }>('/draft/taxi/start', { leagueId });
}

export function getPostDraftAnalysis(leagueId: string) {
  return apiClient.get<PostDraftAnalysisResponse>('/draft/post-analysis', {
    params: { leagueId },
  });
}

export function exportDraftLog(leagueId: string, format: 'csv' | 'json' = 'csv') {
  return apiClient.get<Blob>('/draft/export', {
    params: { leagueId, format },
    responseType: 'blob',
  });
}
