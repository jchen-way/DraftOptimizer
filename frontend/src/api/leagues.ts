import { apiClient } from './client';

export interface League {
  id: string;
  name: string;
  totalBudget?: number;
  benchSlots?: number;
  draftPhase?: 'MAIN' | 'TAXI';
  taxiRoundStartedAt?: string;
  rosterSlots?: Record<string, number>;
  scoringCategories?: string[];
  [key: string]: unknown;
}

export interface CreateLeagueBody {
  name: string;
  totalBudget: number;
  benchSlots: number;
  rosterSlots: Record<string, number>;
  scoringCategories: string[];
}

export function getLeagues() {
  return apiClient.get<League[]>('/leagues');
}

export function getLeague(id: string) {
  return apiClient.get<League>(`/leagues/${id}`);
}

export function createLeague(body: CreateLeagueBody) {
  return apiClient.post<League>('/leagues', body);
}

export function updateLeague(id: string, body: Partial<CreateLeagueBody>) {
  return apiClient.put<League>(`/leagues/${id}`, body);
}

export function deleteLeague(id: string) {
  return apiClient.delete<{
    message: string;
    deleted?: {
      leagues: number;
      teams: number;
      players: number;
      draftHistory: number;
    };
  }>(`/leagues/${id}`);
}

export function seedPlayers(leagueId: string) {
  return apiClient.post(`/leagues/${leagueId}/seed-players`);
}

export function clearLeaguePlayerPool(leagueId: string) {
  return apiClient.post<{ message: string; deleted: number }>(`/leagues/${leagueId}/clear-player-pool`);
}
