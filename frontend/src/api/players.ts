import { apiClient } from './client';

export interface Player {
  _id: string;
  leagueId: string;
  name: string;
  mlbTeam?: string;
  eligiblePositions: string[];
  isDrafted?: boolean;
  draftedBy?: string;
  draftedFor?: number;
  draftPhase?: string;
  activePosition?: string;
  projectedValue?: number;
  adp?: number;
  valuation?: {
    modelVersion?: string;
    categoryScore?: number;
    adpSignal?: number;
    injuryRiskPct?: number;
    scarcityFactor?: number;
    positionFactors?: Record<string, number>;
  };
  [key: string]: unknown;
}

export interface GetPlayersParams {
  q?: string;
  position?: string;
  drafted?: boolean;
  limit?: number;
}

export function getPlayers(leagueId: string, params?: GetPlayersParams) {
  return apiClient.get<Player[]>('/players', {
    params: { leagueId, ...params },
  });
}

export interface AddCustomPlayerBody {
  name: string;
  mlbTeam?: string;
  eligiblePositions: string[];
  projectedValue?: number;
}

export function addCustomPlayer(leagueId: string, body: AddCustomPlayerBody) {
  return apiClient.post<Player>('/players/custom', { leagueId, ...body });
}

export interface ImportPlayerBody {
  name: string;
  mlbTeam?: string;
  eligiblePositions: string[];
  projectedValue?: number;
  adp?: number;
  projections?: Record<string, string | number>;
}

export interface ImportPlayersResponse {
  message: string;
  importedCount: number;
  skippedCount: number;
  totalReceived: number;
}

export function importPlayers(leagueId: string, players: ImportPlayerBody[]) {
  return apiClient.post<ImportPlayersResponse>('/players/import', {
    leagueId,
    players,
  });
}
