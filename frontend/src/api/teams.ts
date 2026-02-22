import { apiClient } from './client';

export interface Team {
  _id: string;
  leagueId: string;
  ownerName: string;
  teamName: string;
  isMyTeam?: boolean;
  budget: {
    total: number;
    spent: number;
    remaining: number;
  };
  roster: Array<{
    playerId: string | { _id: string; name?: string };
    position: string;
    cost: number;
    draftPhase: string;
  }>;
}

export interface CreateTeamBody {
  leagueId: string;
  ownerName: string;
  teamName: string;
  budgetTotal: number;
}

export function getTeams(leagueId: string) {
  return apiClient.get<Team[]>(`/teams`, { params: { leagueId } });
}

export function createTeam(body: CreateTeamBody) {
  return apiClient.post<Team>('/teams', {
    leagueId: body.leagueId,
    ownerName: body.ownerName,
    teamName: body.teamName,
    budget: { total: body.budgetTotal },
  });
}

export function getTeamRoster(teamId: string) {
  return apiClient.get<Team>(`/teams/${teamId}/roster`);
}

export function updateTeam(
  id: string,
  body: Partial<Pick<Team, 'ownerName' | 'teamName' | 'isMyTeam'> & { budgetTotal?: number }>
) {
  const payload: Record<string, unknown> = {
    ownerName: body.ownerName,
    teamName: body.teamName,
    isMyTeam: body.isMyTeam,
  };
  if (typeof body.budgetTotal === 'number') {
    payload.budget = { total: body.budgetTotal };
  }
  return apiClient.put<Team>(`/teams/${id}`, payload);
}

export function deleteTeam(id: string) {
  return apiClient.delete<{ message: string }>(`/teams/${id}`);
}
