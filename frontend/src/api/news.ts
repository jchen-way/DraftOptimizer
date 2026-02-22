import { apiClient } from './client';

export interface NewsItem {
  id: string;
  playerName: string;
  message: string;
  playerId?: string;
}

export function getNews() {
  return apiClient.get<NewsItem[]>('/news');
}
