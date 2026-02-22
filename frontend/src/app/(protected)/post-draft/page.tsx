'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  exportDraftLog,
  getPostDraftAnalysis,
  type PostDraftAnalysisResponse,
  type PostDraftExportRow,
} from '@/api/draft';

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function collectHeaders(rows: PostDraftExportRow[]): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      headers.push(key);
    }
  }
  return headers;
}

function downloadCsv(filename: string, rows: PostDraftExportRow[]) {
  const headers = collectHeaders(rows);
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function PostDraftAnalysisPage() {
  const searchParams = useSearchParams();
  const leagueId = searchParams.get('leagueId');
  const [analysis, setAnalysis] = useState<PostDraftAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingLog, setDownloadingLog] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    if (!leagueId) {
      setError('leagueId query param is required');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await getPostDraftAnalysis(leagueId);
      setAnalysis(data);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Unable to load post-draft analysis.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    void fetchAnalysis();
  }, [fetchAnalysis]);

  const categories = useMemo(() => analysis?.league?.scoringCategories ?? [], [analysis]);

  const handleExportDraftLog = useCallback(async () => {
    if (!leagueId) return;
    setDownloadingLog(true);
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
    } finally {
      setDownloadingLog(false);
    }
  }, [leagueId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-app-dark text-text-primary p-6">
        <p className="text-text-secondary">Loading post-draft analysis…</p>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="min-h-screen bg-app-dark text-text-primary p-6">
        <p className="text-budget-critical mb-4">{error ?? 'Post-draft analysis is unavailable.'}</p>
        <Link href={leagueId ? `/draft?leagueId=${leagueId}` : '/dashboard'} className="text-primary hover:underline">
          Back
        </Link>
      </div>
    );
  }

  const myTeam = analysis.myTeamSummary;

  return (
    <div className="min-h-screen bg-app-dark text-text-primary p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Link href={`/draft?leagueId=${analysis.league.leagueId}`} className="text-primary hover:underline text-sm">
              ← Back to Draft
            </Link>
            <h1 className="text-3xl font-semibold mt-2">Post-Draft Analysis</h1>
            <p className="text-text-secondary text-sm mt-1">
              {analysis.league.name} · Generated {new Date(analysis.generatedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadCsv(`my-roster-${analysis.league.leagueId}.csv`, analysis.exports.myRosterRows)}
              className="rounded bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Export My Roster + Stats
            </button>
            <button
              type="button"
              onClick={() => downloadCsv(`all-rosters-${analysis.league.leagueId}.csv`, analysis.exports.allRosterRows)}
              className="rounded border border-app-border bg-app-panel px-3 py-2 text-sm text-text-primary hover:bg-app-border/25"
            >
              Export All Rosters + Stats
            </button>
            <button
              type="button"
              onClick={handleExportDraftLog}
              disabled={downloadingLog}
              className="rounded border border-app-border bg-app-panel px-3 py-2 text-sm text-text-primary hover:bg-app-border/25 disabled:opacity-60"
            >
              {downloadingLog ? 'Exporting…' : 'Export Draft Pick Log'}
            </button>
          </div>
        </div>

        <section className="rounded-lg border border-app-border bg-app-panel p-4">
          <h2 className="text-lg font-semibold mb-2">Team Outlook</h2>
          <p className="text-sm text-text-secondary">{analysis.summaryText}</p>
          {myTeam && (
            <div className="mt-3 text-sm text-text-secondary">
              <span className="text-text-primary font-medium">{myTeam.ownerName}</span>
              <span> ({myTeam.teamName}) · {myTeam.rosterSize} players · ${myTeam.budgetRemaining} left</span>
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-text-primary mb-1">Strengths</p>
              <ul className="space-y-1 text-text-secondary">
                {analysis.strengths.length === 0 ? (
                  <li>No clear strengths identified.</li>
                ) : (
                  analysis.strengths.map((item) => (
                    <li key={`strength-${item.category}`}>
                      {item.category}: {item.myValue} (league avg {item.leagueAverage})
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <p className="font-medium text-text-primary mb-1">Weaknesses</p>
              <ul className="space-y-1 text-text-secondary">
                {analysis.weaknesses.length === 0 ? (
                  <li>No clear weaknesses identified.</li>
                ) : (
                  analysis.weaknesses.map((item) => (
                    <li key={`weakness-${item.category}`}>
                      {item.category}: {item.myValue} (league avg {item.leagueAverage})
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-app-border bg-app-panel p-4 overflow-auto">
          <h2 className="text-lg font-semibold mb-2">Head-to-Head Projection</h2>
          <p className="text-sm text-text-secondary mb-3">
            Predicted category results for your team versus each opponent.
          </p>
          <table className="w-full text-sm text-left min-w-[760px]">
            <thead className="text-text-secondary border-b border-app-border">
              <tr>
                <th className="py-2 pr-3 font-medium">Opponent</th>
                <th className="py-2 pr-3 font-medium">Projected Result</th>
                <th className="py-2 pr-3 font-medium">Category Record</th>
                <th className="py-2 pr-3 font-medium">Likely Wins</th>
                <th className="py-2 font-medium">Likely Losses</th>
              </tr>
            </thead>
            <tbody>
              {analysis.matchupOutlook.map((matchup) => (
                <tr key={matchup.opponentTeamId} className="border-b border-app-border/70">
                  <td className="py-2 pr-3">
                    {matchup.opponentOwnerName} ({matchup.opponentTeamName})
                  </td>
                  <td className="py-2 pr-3">{matchup.projectedResult}</td>
                  <td className="py-2 pr-3">
                    {matchup.categoryRecord.wins}-{matchup.categoryRecord.losses}-{matchup.categoryRecord.ties}
                  </td>
                  <td className="py-2 pr-3">{matchup.winningCategories.join(', ') || '—'}</td>
                  <td className="py-2">{matchup.losingCategories.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-app-border bg-app-panel p-4 overflow-auto">
          <h2 className="text-lg font-semibold mb-2">Team Category Totals</h2>
          <table className="w-full text-sm text-left min-w-[760px]">
            <thead className="text-text-secondary border-b border-app-border">
              <tr>
                <th className="py-2 pr-3 font-medium">Team</th>
                {categories.map((category) => (
                  <th key={category} className="py-2 pr-3 font-medium">
                    {category}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.teamSummaries.map((team) => (
                <tr key={team.teamId} className="border-b border-app-border/70">
                  <td className="py-2 pr-3">
                    {team.ownerName} {team.isMyTeam ? '(Your Team)' : ''} ({team.teamName})
                  </td>
                  {categories.map((category) => (
                    <td key={`${team.teamId}-${category}`} className="py-2 pr-3">
                      {team.categoryTotals[category] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
